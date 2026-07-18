/* Agent chat runtime — streams a real provider response for a single
   agent turn, using the agent's configured provider/model and system
   prompt. Surfaces real provider errors instead of a silent fallback.

   Optionally supports tool calling: when `tools` + `executeTool` are
   supplied (e.g. by the Fleet, which routes to MCP + local tools), the turn
   loops — model emits tool calls, we execute them, feed results back, repeat —
   mirroring the chat composer's tool loop but in a headless, service-scoped
   form so it works for background fleet runs. */

import type { Agent, ChatMessage, ProviderType } from '@/core/types';
import { complete } from '@/services/providers/registry';
import type { ProviderMessage, ToolDefinition } from '@/services/providers/types';

export interface AgentTurnHandlers {
  onDelta?: (delta: string, accumulated: string) => void;
  signal?: AbortSignal;
}

/**
 * Optional provider/model override. When supplied, the turn uses the active
 * session's provider/model instead of the agent's own hardcoded defaults — so
 * every LLM call in the app is served by the brain the user is talking to.
 */
export interface AgentTurnOverride {
  provider?: ProviderType;
  model?: string;
}

/** Dispatches a single tool call name+args to an executor (local or MCP). */
export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

/** Hard cap on a single tool result. Raised to 8 000 chars so read_file
 *  verify-after-write calls can return enough content to confirm a write
 *  was complete. The main cause of the original “8 MB” context errors was
 *  the old 4 000-char cap getting hit on every large read. */
const MAX_TOOL_OUTPUT = 8_000;

/** History → provider messages (drop empty/system rows; cap for context). */
function toProviderMessages(history: ChatMessage[]): ProviderMessage[] {
  return history
    .filter((m) => m.role !== 'system')
    .slice(-40)
    .map((m) => {
      const pm: ProviderMessage = {
        role: m.role as any,
        content: m.content || '',
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        pm.toolCalls = m.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        }));
      }
      if (m.toolCallId) {
        pm.toolCallId = m.toolCallId;
      }
      return pm;
    });
}

export interface AgentTurnResult {
  content: string;
  provider: ProviderType;
  model: string;
  simulated: boolean;
  tokens: number;
  /** Whether the turn ended after executing tool calls. */
  toolCallsExecuted: number;
}

export async function runAgentTurn(
  agent: Agent,
  history: ChatMessage[],
  handlers: AgentTurnHandlers = {},
  override?: AgentTurnOverride,
  tools?: ToolDefinition[],
  executeTool?: ToolExecutor,
): Promise<AgentTurnResult> {
  // Defer to the session's provider/model when one is supplied; otherwise fall
  // back to the agent's own configured defaults.
  const provider = override?.provider ?? (agent.provider as ProviderType);
  const model = override?.model ?? agent.model;

  const messages: ProviderMessage[] = toProviderMessages(history);
  let acc = '';
  let toolRounds = 0;
  let toolCallsExecuted = 0;

  // Tool-calling loop (only when the caller supplied tools + an executor).
  while (true) {
    const result = await complete(
      {
        model,
        system: agent.systemPrompt,
        messages,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens || 4096,
        ...(tools && tools.length > 0 && executeTool ? { tools } : {}),
      },
      {
        preferred: provider,
        strict: !!override?.provider,
        signal: handlers.signal,
        onDelta: (d) => {
          acc += d;
          handlers.onDelta?.(d, acc);
        },
      },
    );

    // No tool calls → final text answer; the turn is done.
    if (!result.toolCalls || result.toolCalls.length === 0 || !executeTool) {
      return {
        content: result.content,
        provider: result.provider,
        model: result.model,
        simulated: result.simulated,
        tokens: result.usage?.outputTokens ?? Math.round(result.content.length / 4),
        toolCallsExecuted,
      };
    }

    // Guard against runaway tool loops (raised from 8 → 25 for large tasks).
    if (toolRounds >= 25) {
      return {
        content:
          acc ||
          '(stopped after too many tool rounds)',
        provider: result.provider,
        model: result.model,
        simulated: result.simulated,
        tokens: result.usage?.outputTokens ?? Math.round(acc.length / 4),
        toolCallsExecuted,
      };
    }

    // Append the assistant tool-call turn, then each tool result.
    const assistantMsg = {
      role: 'assistant' as const,
      content: result.content || '',
      toolCalls: result.toolCalls,
    };
    messages.push(assistantMsg);
    history.push({
      id: `a-t-${Date.now()}-${Math.random()}`,
      agentId: agent.id || 'cli',
      role: 'assistant',
      content: assistantMsg.content,
      toolCalls: assistantMsg.toolCalls,
      timestamp: Date.now(),
    });

    for (const call of result.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || '{}');
      } catch {
        /* leave empty */
      }
      let output: string;
      try {
        output = await executeTool(call.name, args);
        toolCallsExecuted += 1;
      } catch (e) {
        output = `Tool "${call.name}" failed: ${(e as Error).message}`;
      }
      // Truncate oversized tool outputs so they never blow the context window.
      if (output.length > MAX_TOOL_OUTPUT) {
        output =
          output.slice(0, MAX_TOOL_OUTPUT) +
          `\n... [truncated — ${output.length} chars total; use offset/limit args to read more]`;
      }
      messages.push({ role: 'tool', toolCallId: call.id, content: output });
      history.push({
        id: `t-${call.id}`,
        agentId: agent.id || 'cli',
        role: 'tool',
        toolCallId: call.id,
        content: output,
        timestamp: Date.now(),
      });
    }

    toolRounds += 1;
    // Do NOT reset acc — any text the model wrote before calling tools is
    // valuable; we want to preserve it across rounds.
  }
}
