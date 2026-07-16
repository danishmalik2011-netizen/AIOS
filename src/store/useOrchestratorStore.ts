/* ================================================
   Orchestrator store — UI-facing state for the Fleet
   Director run: the active plan, per-subtask progress,
   the Director's live "thinking", and the abort handle.
   ================================================ */

import { create } from 'zustand';
import type { OrchestrationPlan, SubTask } from '@/core/types';

let abortController: AbortController | null = null;

interface OrchestratorStore {
  plan: OrchestrationPlan | null;
  isRunning: boolean;
  /** Live Director narration (e.g. while the optional LLM plan is built). */
  directorThinking: string | null;
  /** Session the fleet run was launched from (results are posted here). */
  activeSessionId: string | null;

  setPlan: (plan: OrchestrationPlan | null) => void;
  setRunning: (running: boolean) => void;
  setDirectorThinking: (text: string | null) => void;
  setActiveSession: (id: string | null) => void;
  updateSubtask: (id: string, patch: Partial<SubTask>) => void;
  reset: () => void;

  /** Abort handle shared with the runner so the user can stop a fleet run. */
  beginRun: () => AbortController;
  abort: () => void;
  getAbortSignal: () => AbortSignal | undefined;
}

export const useOrchestratorStore = create<OrchestratorStore>((set, get) => ({
  plan: null,
  isRunning: false,
  directorThinking: null,
  activeSessionId: null,

  setPlan: (plan) => set({ plan }),
  setRunning: (running) => set({ isRunning: running }),
  setDirectorThinking: (text) => set({ directorThinking: text }),
  setActiveSession: (id) => set({ activeSessionId: id }),

  updateSubtask: (id, patch) =>
    set((s) => {
      if (!s.plan) return {};
      return {
        plan: {
          ...s.plan,
          subtasks: s.plan.subtasks.map((t) =>
            t.id === id ? { ...t, ...patch } : t,
          ),
        },
      };
    }),

  reset: () =>
    set({ plan: null, isRunning: false, directorThinking: null, activeSessionId: null }),

  beginRun: () => {
    abortController = new AbortController();
    set({ isRunning: true, directorThinking: null });
    return abortController;
  },

  abort: () => {
    abortController?.abort();
    abortController = null;
    set({ isRunning: false });
  },

  getAbortSignal: () => abortController?.signal,
}));
