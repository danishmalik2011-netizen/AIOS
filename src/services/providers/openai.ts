/* Real OpenAI driver — Chat Completions API with SSE streaming. */

import type {
  ProviderDriver, CompletionRequest, CompletionResult, StreamCallbacks,
  ProviderMessage, ProviderToolCall,
} from './types';
import { ProviderError } from './types';
import { getApiKey, hasApiKey } from './keyVault';
import { parseSSE } from './sse';

/** Generate a provider-safe unique id for tool calls whose streamed id is missing. */
function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through to fallback */
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* Map normalized messages to OpenAI Chat Completions format. Assistant tool
   calls become `tool_calls`; tool results become `role: 'tool'` messages. */
function toOpenAIMessages(messages: ProviderMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments || '{}' },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODELS = ['gpt-4o', 'gpt-4o-mini', 'o1-preview'];

export const openaiDriver: ProviderDriver = {
  id: 'openai',
  name: 'OpenAI',
  isAvailable: () => hasApiKey('openai'),
  async listModels(): Promise<string[]> {
    const key = getApiKey('openai');
    if (!key) return MODELS;
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Return the COMPLETE list — free and paid, no curated subset.
        const list = (data.data as Array<{ id: string }>)
          .map((m) => m.id)
          .filter(Boolean);
        return list.length > 0 ? Array.from(new Set(list)).sort() : MODELS;
      }
    } catch {
      // ignore and return default list
    }
    return MODELS;
  },

  async complete(req: CompletionRequest, opts?: StreamCallbacks): Promise<CompletionResult> {
    const key = getApiKey('openai');
    if (!key) throw new ProviderError('No OpenAI API key configured', 'openai');

    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      ...toOpenAIMessages(req.messages),
    ];

    const tools = req.tools?.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const doFetch = (mode: 'required' | 'auto') =>
      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1024,
          ...(tools && tools.length > 0 ? { tools, tool_choice: mode } : {}),
          stream: true,
        }),
        signal: opts?.signal,
      });

    // Force a tool call so the model can't end a turn with bare narration. If a
    // model/proxy rejects forced tool choice, retry once letting it decide.
    let res = await doFetch('required');
    if (!res.ok && tools && tools.length > 0) {
      const retry = await doFetch('auto');
      if (retry.ok) res = retry;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      let friendly = detail.slice(0, 500);
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.error?.message) friendly = String(parsed.error.message);
      } catch {
        /* keep raw detail */
      }
      throw new ProviderError(`OpenAI error ${res.status}: ${friendly}`, 'openai', res.status);
    }

    let content = '';
    let finishReason: string | undefined;

    // Accumulate streamed tool_calls by their array index.
    interface ToolAccum { id: string; name: string; args: string }
    const toolAccum = new Map<number, ToolAccum>();

    for await (const data of parseSSE(res, opts?.signal)) {
      if (!data || data === '[DONE]') continue;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(data); } catch { continue; }
      const choice = (evt.choices as Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string;
      }> | undefined)?.[0];

      const delta = choice?.delta?.content ?? '';
      if (delta) { content += delta; opts?.onDelta?.(delta); }

      for (const tc of choice?.delta?.tool_calls ?? []) {
        const entry = toolAccum.get(tc.index) ?? { id: '', name: '', args: '' };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name = tc.function.name;
        if (tc.function?.arguments) entry.args += tc.function.arguments;
        toolAccum.set(tc.index, entry);
      }

      if (choice?.finish_reason) finishReason = choice.finish_reason;
    }

    const toolCalls: ProviderToolCall[] = [...toolAccum.values()].map((t) => ({
      // Some providers omit/stream the tool-call id late; a missing id would
      // produce an empty `tool_call_id` downstream (a hard 400 from the API).
      // Always guarantee a non-empty id so the pairing stays valid.
      id: t.id || `call_${genId()}`,
      name: t.name,
      arguments: t.args || '{}',
    }));

    return {
      content,
      model: req.model,
      provider: 'openai',
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      simulated: false,
    };
  },
};
