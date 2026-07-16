/* ================================================
   Command-approval store — gates the agent's shell commands behind a single
   prompt the first time it tries to run one. The tool loop calls
   `requestApproval(command)` and awaits the returned promise; the
   CommandApprovalModal renders the pending command and resolves it.

   Decisions:
     - 'allow-once'    : run just this command
     - 'allow-session' : run this command and skip the prompt for the rest of
                         the session
     - 'reject'        : do not run; optionally carries `instruction` text that
                         is fed back to the model so it knows what to do instead
   ================================================ */

import { create } from 'zustand';

export type CommandDecision = 'allow-once' | 'allow-session' | 'reject';

export interface PendingCommand {
  id: string;
  /** The exact command the agent wants to run. */
  command: string;
  /** Session the command belongs to (used for "allow for this session"). */
  sessionId: string;
}

export interface CommandDecisionResult {
  decision: CommandDecision;
  /** Shown to the model when the user rejects with guidance. */
  instruction?: string;
}

interface CommandApprovalStore {
  pending: PendingCommand | null;
  /** Session ids that already approved all commands for the remainder. */
  approvedSessions: string[];
  /** Mark a session as fully approved (no more prompts this session). */
  approveSession: (sessionId: string) => void;
  /** Enqueue a command for approval; resolves once the user decides. */
  requestApproval: (command: PendingCommand) => Promise<CommandDecisionResult>;
  /** Resolve the current pending command with a decision. */
  resolve: (result: CommandDecisionResult) => void;
}

let resolver: ((result: CommandDecisionResult) => void) | null = null;

export const useCommandApprovalStore = create<CommandApprovalStore>((set) => ({
  pending: null,
  approvedSessions: [],

  approveSession: (sessionId) =>
    set((state) =>
      state.approvedSessions.includes(sessionId)
        ? state
        : { approvedSessions: [...state.approvedSessions, sessionId] },
    ),

  requestApproval: (command) =>
    new Promise<CommandDecisionResult>((resolve) => {
      // If a command is already pending, auto-reject the stale one first.
      if (resolver) {
        resolver({ decision: 'reject' });
        resolver = null;
      }
      resolver = resolve;
      set({ pending: command });
    }),

  resolve: (result) => {
    const r = resolver;
    resolver = null;
    set({ pending: null });
    r?.(result);
  },
}));
