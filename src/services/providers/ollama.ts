/* Real local provider — Ollama at http://localhost:11434 (CORS-friendly,
   no API key). This is a genuinely live local model path when the user
   has Ollama running. */

import type {
  ProviderDriver, CompletionRequest, CompletionResult, StreamCallbacks,
  ProviderMessage, ProviderToolCall,
} from './types';
import { ProviderError } from './types';
import { parseNDJSON } from './sse';

/* Map normalized messages to Ollama /api/chat format. Assistant tool calls
   carry `tool_calls` (arguments as an object); tool results are `role: 'tool'`
   messages. */
function toOllamaMessages(messages: ProviderMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((tc) => {
          let args: unknown = {};
          try { args = JSON.parse(tc.arguments || '{}'); } catch { args = {}; }
          return { function: { name: tc.name, arguments: args } };
        }),
      };
    }
    return { role: m.role, content: m.content };
  });
}

const BASE = 'http://localhost:11434';
const DEFAULT_MODELS = ['llama3', 'codellama', 'mistral', 'qwen2.5-coder'];

/* Reachability is probed against the local daemon and cached briefly so
   resolveDriver() doesn't fire a request on every completion. Previously this
   was hardcoded `true`, which made the auto-resolver always fall back to Ollama
   even when the daemon wasn't running. */
const AVAILABILITY_TTL = 15_000;
let availabilityCache: { value: boolean; at: number } | null = null;

async function probeReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const ollamaDriver: ProviderDriver = {
  id: 'ollama',
  name: 'Ollama (Local)',
  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (availabilityCache && now - availabilityCache.at < AVAILABILITY_TTL) {
      return availabilityCache.value;
    }
    const value = await probeReachable();
    availabilityCache = { value, at: now };
    return value;
  },
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${BASE}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const list = (data.models as Array<{ name: string }>)
          .map((m) => m.name)
          .sort();
        return list.length > 0 ? list : DEFAULT_MODELS;
      }
    } catch {
      // ignore and return default
    }
    return DEFAULT_MODELS;
  },

  async complete(req: CompletionRequest, opts?: StreamCallbacks): Promise<CompletionResult> {
    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      ...toOllamaMessages(req.messages),
    ];

    const tools = req.tools?.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    let res: Response;
    try {
      res = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: req.model || 'llama3',
          messages,
          stream: true,
          options: { temperature: req.temperature ?? 0.7 },
          ...(tools && tools.length > 0 ? { tools } : {}),
        }),
        signal: opts?.signal,
      });
    } catch (e) {
      throw new ProviderError(`Ollama not reachable at ${BASE} (${(e as Error).message})`, 'ollama');
    }

    if (!res.ok) {
      throw new ProviderError(`Ollama error ${res.status}`, 'ollama', res.status);
    }

    let content = '';
    let finishReason: string | undefined;
    const toolCalls: ProviderToolCall[] = [];

    for await (const obj of parseNDJSON(res, opts?.signal)) {
      const rec = obj as {
        message?: {
          content?: string;
          tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
        };
        done?: boolean;
        done_reason?: string;
      };
      const delta = rec.message?.content ?? '';
      if (delta) { content += delta; opts?.onDelta?.(delta); }
      for (const tc of rec.message?.tool_calls ?? []) {
        const args = tc.function?.arguments;
        toolCalls.push({
          id: `ollama-${toolCalls.length}`,
          name: tc.function?.name ?? '',
          arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
        });
      }
      if (rec.done) finishReason = rec.done_reason ?? 'stop';
    }

    return {
      content,
      model: req.model || 'llama3',
      provider: 'ollama',
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      simulated: false,
    };
  },
};
