/* ================================================
   OpenAI-compatible driver — a single generic driver that talks the
   OpenAI Chat Completions protocol against ANY base URL. This covers
   OpenRouter, Groq, DeepSeek, Together, OpenAI itself, and local
   OpenAI-compatible servers (Ollama's /v1 port, vLLM, LM Studio).

   It mirrors the real OpenAI driver's streaming + native tool-calling
   logic, parameterised by the provider's base URL and id (so the right
   API key is read from the vault).

   Some hosted endpoints (notably NVIDIA NIM, which runs on vLLM) do NOT
   support OpenAI-style native function calling: sending `tool_choice:
   "auto"` returns 400 ("requires --enable-auto-tool-choice …"). For those
   providers, set `nativeTools: false` and the driver simply omits the
   `tools`/`tool_choice` fields — the app's XML `<tool_call>` fallback
   (already wired into the agent runtime) takes over instead.
   ================================================ */

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

/**
 * Guarantee a tool-call's `arguments` is valid, provider-safe JSON. Streamed
 * argument fragments are occasionally truncated or contain control characters,
 * which many OpenAI-compatible gateways reject with a bare 400 ("Provider
 * returned error"). Repair where possible (strip control chars, balance braces)
 * and fall back to `{}` so the request never dies on malformed arguments.
 */
export function sanitizeToolArgs(raw: string | undefined): string {
  const src = (raw ?? '').trim();
  if (!src) return '{}';
  try {
    JSON.parse(src);
    return src;
  } catch {
    /* fall through to repair */
  }
  // Strip control characters that break JSON parsing, then drop a trailing
  // comma before a closing brace (a common streaming artifact).
  const cleaned = src
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    /* still invalid — attempt brace balancing */
  }
  const open = (cleaned.match(/{/g) || []).length;
  const close = (cleaned.match(/}/g) || []).length;
  let balanced = cleaned;
  if (open > close) balanced = cleaned + '}'.repeat(open - close);
  try {
    JSON.parse(balanced);
    return balanced;
  } catch {
    return '{}';
  }
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
          id: tc.id || `call_${genId()}`,
          type: 'function',
          function: { name: tc.name, arguments: sanitizeToolArgs(tc.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

/** Local servers (Ollama's /v1, vLLM, LM Studio) don't need an API key. */
function isLocalBaseUrl(baseUrl: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(baseUrl);
}

export interface CompatibleConfig {
  id: string;
  name: string;
  baseUrl: string;
  /**
   * When false, the driver does NOT send `tools`/`tool_choice` to the
   * endpoint. Use this for providers that lack OpenAI-style native function
   * calling (e.g. NVIDIA NIM). The agent runtime's XML `<tool_call>` fallback
   * then handles tool invocation instead. Defaults to true.
   */
  nativeTools?: boolean;
}

/**
 * Build a ProviderDriver for an OpenAI-compatible endpoint. The base URL is
 * normalised and `/chat/completions` (and `/models`) are appended.
 */
export function createOpenAICompatibleDriver(config: CompatibleConfig): ProviderDriver {
  const { id, name, baseUrl, nativeTools = true } = config;
  const normalized = baseUrl.replace(/\/+$/, '');
  const chatEndpoint = `${normalized}/chat/completions`;
  const modelsEndpoint = `${normalized}/models`;

  return {
    id,
    name,

    isAvailable: () => (isLocalBaseUrl(baseUrl) ? true : hasApiKey(id)),

    async listModels(): Promise<string[]> {
      const key = getApiKey(id);
      try {
        const res = await fetch(modelsEndpoint, {
          headers: key ? { authorization: `Bearer ${key}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const list = (data?.data as Array<{ id: string }> | undefined)
            ?.map((m) => m.id)
            .filter(Boolean);
          if (list && list.length > 0) return list;
        }
      } catch {
        /* ignore — fall back to caller's known model list */
      }
      return [];
    },

    async complete(req: CompletionRequest, opts?: StreamCallbacks): Promise<CompletionResult> {
      if (!isLocalBaseUrl(baseUrl) && !hasApiKey(id)) {
        throw new ProviderError(`No API key configured for ${name}`, id);
      }
      const key = getApiKey(id);

      const messages = [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        ...toOpenAIMessages(req.messages),
      ];

      const tools = req.tools?.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

      // Only attach native tool schemas when the provider supports them. When
      // disabled, the request is a plain chat completion and the agent runtime
      // relies on the XML `<tool_call>` fallback instead.
      const sendNativeTools = nativeTools && tools && tools.length > 0;

      // Force a tool call (`required`) so the model can never end a turn with
      // bare narration instead of acting — it must either call an action tool
      // or `respond_to_user`. Some endpoints reject forced tool choice with a
      // 400; we then retry once with tools still attached but `tool_choice:
      // "auto"` (let the model decide) instead of dropping tools entirely.
      const runWithTools = async (mode: 'required' | 'auto' | 'none') => {
        const res = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(key ? { authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({
            model: req.model,
            messages,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 1024,
            ...(mode !== 'none' ? { tools } : {}),
            ...(mode === 'required'
              ? { tool_choice: 'required' }
              : mode === 'auto'
                ? { tool_choice: 'auto' }
                : {}),
            stream: true,
          }),
          signal: opts?.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          let friendly = detail.slice(0, 500);
          try {
            const parsed = JSON.parse(detail);
            if (parsed?.error?.message) friendly = String(parsed.error.message);
          } catch {
            /* keep raw detail */
          }
          throw new ProviderError(`Provider error ${res.status}: ${friendly}`, id, res.status);
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

        // Drop streamed tool calls that never received a name/args — sending a
        // `function` with no name is a hard 400 from compliant providers.
        const toolCalls: ProviderToolCall[] = [...toolAccum.values()]
          .filter((t) => t.name)
          .map((t) => ({
            // Some providers omit/stream the tool-call id late; a missing id would
            // produce an empty `tool_call_id` downstream (a hard 400 from the API).
            // Always guarantee a non-empty id so the pairing stays valid.
            id: t.id || `call_${genId()}`,
            name: t.name,
            arguments: sanitizeToolArgs(t.args),
          }));

        return {
          content,
          model: req.model,
          provider: id,
          finishReason,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          simulated: false,
        };
      };

      try {
        return await runWithTools(sendNativeTools ? 'required' : 'none');
      } catch (e) {
        const recoverable =
          sendNativeTools &&
          e instanceof ProviderError &&
          e.status === 400 &&
          /tool_choice|auto-tool|function call|auto_tool|tool_calls|function calling|parallel_tool|required/i.test(e.message);
        if (!recoverable) throw e;
        // Provider rejected forced tool choice — retry with tools still attached
        // but let the model decide (auto) instead of dropping tools entirely.
        return await runWithTools('auto');
      }
    },
  };
}
