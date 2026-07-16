/* ================================================================
   Per-session run state — keeps the agent run lifecycle
   (abort controller, send lock, queue, tool-failure streak,
   token tally, turn timers) scoped to the conversation it
   belongs to, instead of living on the single AgentsView
   instance. This is what lets two chats generate in parallel
   and stops the composer's Stop button / Working indicator
   from bleeding into whichever chat you've switched to.
   ================================================================ */

import type { ToolCall } from '@/core/types';
import type { ProviderMessage } from '@/services/providers/types';

export interface QueuedItem {
  id: string;
  text: string;
  files: string[];
  /** Timestamp (ms) when this item will be promoted to the chat, or null
   *  while it waits for the agent to finish its current turn. */
  promoteAt: number | null;
}

export interface LastTurn {
  sessionId: string;
  providerHistory: ProviderMessage[];
  toolRound: number;
  assistantMsgId?: string;
  priorText: string;
  priorToolCalls: ToolCall[];
  compactLevel: number;
}

export interface SessionRun {
  controller: AbortController | null;
  turnStart: number | null;
  isSending: boolean;
  lastTurn: LastTurn | null;
  /** True once this turn has actually mutated the workspace
   *  (write_file / run_command / git_commit) — gates the
   *  self-verification step at turn end. */
  madeChanges: boolean;
  /** How many times this turn has been sent back to the model for a
   *  self-verification fix, capped to avoid infinite verify loops. */
  verifyAttempts: number;
  failedToolStreak: { sig: string; count: number };
  turnTokens: { inputTokens: number; outputTokens: number };
  queue: QueuedItem[];
  scheduleTimer: number | null;
}

function blankRun(): SessionRun {
  return {
    controller: null,
    turnStart: null,
    isSending: false,
    lastTurn: null,
    madeChanges: false,
    verifyAttempts: 0,
    failedToolStreak: { sig: '', count: 0 },
    turnTokens: { inputTokens: 0, outputTokens: 0 },
    queue: [],
    scheduleTimer: null,
  };
}

const runs = new Map<string, SessionRun>();

/** Get (creating if needed) the run context for a session. The returned
 *  object is a stable, mutable reference — mutate its fields directly. */
export function getRun(sessionId: string): SessionRun {
  let run = runs.get(sessionId);
  if (!run) {
    run = blankRun();
    runs.set(sessionId, run);
  }
  return run;
}

/** Drop a session's run context (clears any pending scheduler timer). */
export function dropRun(sessionId: string): void {
  const run = runs.get(sessionId);
  if (run?.scheduleTimer != null) window.clearTimeout(run.scheduleTimer);
  runs.delete(sessionId);
}
