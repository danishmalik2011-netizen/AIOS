/* ================================================================
   Plan-then-act gate. When the user (or the "Plan before
   acting" setting) asks for a plan, we propose an execution
   plan and stash it here PER SESSION. The agent does
   NOT touch the workspace until the user approves — this is
   the "explore → propose → approve" step that keeps the
   agent from acting blind on a non-trivial task.
   ================================================================ */

import { create } from 'zustand';
import type { PlanStep } from '@/store/useFollowPanelStore';

export interface PendingPlan {
  prompt: string;
  files: string[];
  plan: PlanStep[];
  /** Raw plan text, injected as hidden context when the plan is approved. */
  planText: string;
}

interface PlanStore {
  pending: Record<string, PendingPlan>;
  setPending: (sessionId: string, plan: PendingPlan) => void;
  clearPending: (sessionId: string) => void;
}

export const usePlanStore = create<PlanStore>((set) => ({
  pending: {},
  setPending: (sessionId, plan) =>
    set((s) => ({ pending: { ...s.pending, [sessionId]: plan } })),
  clearPending: (sessionId) =>
    set((s) => {
      const next = { ...s.pending };
      delete next[sessionId];
      return { pending: next };
    }),
}));
