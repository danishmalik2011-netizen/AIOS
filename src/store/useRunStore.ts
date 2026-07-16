/* ================================================================
   Per-session run UI state — reactive slice that the composer
   and Working indicator subscribe to. Keyed by session id so
   the Stop button + "thinking" timer only ever reflect the
   *active* chat, and each chat carries its own queue/run flag.
   ================================================================ */

import { create } from 'zustand';
import type { QueuedItem } from '@/services/runManager';

export interface SessionRunUI {
  isGenerating: boolean;
  turnStartedAt: number | null;
  queuedItems: QueuedItem[];
}

interface RunStore {
  ui: Record<string, SessionRunUI>;
  setGenerating: (sessionId: string, value: boolean) => void;
  setTurnStart: (sessionId: string, value: number | null) => void;
  setQueuedItems: (sessionId: string, items: QueuedItem[]) => void;
}

function withSession(
  ui: Record<string, SessionRunUI>,
  sessionId: string,
  patch: Partial<SessionRunUI>,
): Record<string, SessionRunUI> {
  const prev: SessionRunUI = ui[sessionId] ?? {
    isGenerating: false,
    turnStartedAt: null,
    queuedItems: [],
  };
  return { ...ui, [sessionId]: { ...prev, ...patch } };
}

export const useRunStore = create<RunStore>((set) => ({
  ui: {},
  setGenerating: (sessionId, value) =>
    set((s) => ({ ui: withSession(s.ui, sessionId, { isGenerating: value }) })),
  setTurnStart: (sessionId, value) =>
    set((s) => ({ ui: withSession(s.ui, sessionId, { turnStartedAt: value }) })),
  setQueuedItems: (sessionId, items) =>
    set((s) => ({ ui: withSession(s.ui, sessionId, { queuedItems: items }) })),
}));
