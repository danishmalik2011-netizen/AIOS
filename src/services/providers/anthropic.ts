/* Real Anthropic driver — calls the Messages API with SSE streaming.
   Uses the direct-browser-access opt-in header so it works from the
   local-first client. Key comes from the local vault. */

import type {
  ProviderDriver, CompletionRequest, CompletionResult, StreamCallbacks,
  ProviderMessage, ProviderToolCall,
} from './types';
import { ProviderError } from './types';
import { getApiKey, hasApiKey } from './keyVault';
import { parseSSE } from './sse';

/* Map our normalized messages to Anthropic's content-block format, folding
   assistant tool calls into `tool_use` blocks and grouping consecutive tool
   results into a single following `user` turn of `tool_result` blocks. */
function toAnthropicMessages(messages: ProviderMessage[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let pendingToolResults: Array<Record<string, unknown>> = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      out.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
      });
      continue;
    }
    flushToolResults();
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: Array<Record<string, unknown>> = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        let input: unknown = {};
        try { input = JSON.parse(tc.arguments || '{}'); } catch { input = {}; }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
      }
      out.push({ role: 'assistant', content: blocks });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  flushToolResults();
  return out;
}

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

// Real, currently-available Anthropic model ids (latest generation first,
// then older generations). The live /models fetch replaces this list whenever
// a valid key is present; this is only the offline fallback.
const MODELS = [
  // Claude 4 (latest)
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514',
  'claude-opus-4-0',
  'claude-sonnet-4-0',
  // Claude 3.7
  'claude-3-7-sonnet-20250219',
  'claude-3-7-sonnet-latest',
  // Claude 3.5
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-20241022',
  'claude-3-5-haiku-latest',
  // Claude 3
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  // Older generations (still served)
  'claude-2.1',
  'claude-2',
  'claude-instant-1.2',
];

export const anthropicDriver: ProviderDriver = {
  id: 'anthropic',
  name: 'Anthropic',
  isAvailable: () => hasApiKey('anthropic'),
  async listModels(): Promise<string[]> {
    const key = getApiKey('anthropic');
    if (!key) return MODELS;
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
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
    const key = getApiKey('anthropic');
    if (!key) throw new ProviderError('No Anthropic API key configured', 'anthropic');

    // Anthropic takes `system` separately; only user/assistant in messages.
    const systemFromMessages = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const system = req.system ?? (systemFromMessages || undefined);
    const messages = toAnthropicMessages(req.messages);

    const tools = req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 8192,
        temperature: req.temperature ?? 0.7,
        system,
        messages,
        ...(tools && tools.length > 0
          ? { tools, tool_choice: { type: 'auto' } }
          : {}),
        stream: true,
      }),
      signal: opts?.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(`Anthropic error ${res.status}: ${detail.slice(0, 200)}`, 'anthropic', res.status);
    }

    let content = '';
    let outputTokens = 0;
    let inputTokens = 0;
    let finishReason: string | undefined;

    // Accumulate streamed tool_use blocks by their content-block index.
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();

    for await (const data of parseSSE(res, opts?.signal)) {
      if (!data || data === '[DONE]') continue;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(data); } catch { continue; }
      const type = evt.type as string;
      if (type === 'content_block_start') {
        const index = evt.index as number;
        const block = evt.content_block as { type?: string; id?: string; name?: string } | undefined;
        if (block?.type === 'tool_use') {
          toolBlocks.set(index, { id: block.id ?? '', name: block.name ?? '', json: '' });
        }
      } else if (type === 'content_block_delta') {
        const index = evt.index as number;
        const delta = evt.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        if (delta?.type === 'input_json_delta') {
          const tb = toolBlocks.get(index);
          if (tb) tb.json += delta.partial_json ?? '';
        } else {
          const text = delta?.text ?? '';
          if (text) { content += text; opts?.onDelta?.(text); }
        }
      } else if (type === 'message_delta') {
        const usage = (evt.usage as { output_tokens?: number } | undefined);
        if (usage?.output_tokens) outputTokens = usage.output_tokens;
        finishReason = (evt.delta as { stop_reason?: string } | undefined)?.stop_reason ?? finishReason;
      } else if (type === 'message_start') {
        const usage = (evt.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
        if (usage?.input_tokens) inputTokens = usage.input_tokens;
      }
    }

    const toolCalls: ProviderToolCall[] = [...toolBlocks.values()].map((tb) => ({
      id: tb.id,
      name: tb.name,
      arguments: tb.json || '{}',
    }));

    return {
      content,
      model: req.model,
      provider: 'anthropic',
      usage: { inputTokens, outputTokens },
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      simulated: false,
    };
  },
};
