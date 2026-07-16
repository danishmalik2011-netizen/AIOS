/* ================================================
   Diff-review store — gates AI file edits behind a user Accept/Reject.
   The tool loop calls `requestApproval(edit)` and awaits the returned promise;
   the DiffReviewModal renders the pending edit and resolves it. A per-session
   `autoApply` flag lets the user skip the modal when they trust the agent.
   ================================================ */

import { create } from 'zustand';

export type ReviewDecision = 'accepted' | 'rejected';

export interface PendingEdit {
  id: string;
  /** Repo-relative path being written. */
  path: string;
  /** Current on-disk content ('' for a new file). */
  original: string;
  /** Proposed new content. */
  proposed: string;
}

interface DiffReviewStore {
  pending: PendingEdit | null;
  autoApply: boolean;
  setAutoApply: (value: boolean) => void;
  /** Enqueue an edit for review; resolves once the user decides. */
  requestApproval: (edit: PendingEdit) => Promise<ReviewDecision>;
  /** Resolve the current pending edit with a decision. */
  resolve: (decision: ReviewDecision) => void;
}

let resolver: ((decision: ReviewDecision) => void) | null = null;

export const useDiffReviewStore = create<DiffReviewStore>((set, get) => ({
  pending: null,
  autoApply: false,

  setAutoApply: (value) => set({ autoApply: value }),

  requestApproval: (edit) =>
    new Promise<ReviewDecision>((resolve) => {
      // If an edit is already pending, auto-reject the stale one first.
      if (resolver) {
        resolver('rejected');
        resolver = null;
      }
      resolver = resolve;
      set({ pending: edit });
    }),

  resolve: (decision) => {
    const r = resolver;
    resolver = null;
    set({ pending: null });
    r?.(decision);
    // Touch state so subscribers re-render even if r was null.
    void get;
  },
}));
