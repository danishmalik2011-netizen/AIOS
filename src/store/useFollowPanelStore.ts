import { create } from 'zustand';

export type PanelTab = 'code' | 'preview' | 'plan' | 'artifacts';

export interface FollowedFile {
  id: string;
  path: string;
  name: string;
  content: string;
  /** Previous content, used to render a red/green diff after a write. */
  original?: string;
}

export type PlanStepStatus = 'pending' | 'active' | 'done';

export interface PlanStep {
  id: string;
  text: string;
  status: PlanStepStatus;
}

export type ArtifactType = 'spec' | 'doc' | 'diagram' | 'code';

export interface Artifact {
  id: string;
  title: string;
  type: ArtifactType;
  content: string;
  ts: number;
}

interface FollowPanelStore {
  /* UI */
  collapsed: boolean;
  activeTab: PanelTab;
  /** Canvas panel width in px (horizontal resize handle). */
  width: number;
  /** Live text the agent is composing right now (surfaced in the "Working" panel). */
  liveText: string;
  /* Per-session canvas content (keyed via sessionId so switching chats resets) */
  sessionId: string | null;
  followedFile: FollowedFile | null;
  plan: { title: string; steps: PlanStep[] } | null;
  artifacts: Artifact[];

  /* Actions */
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  setActiveTab: (t: PanelTab) => void;
  setWidth: (w: number) => void;
  followFile: (f: FollowedFile) => void;
  setPlan: (title: string, steps: PlanStep[]) => void;
  clearPlan: () => void;
  setStepStatus: (id: string, status: PlanStepStatus) => void;
  addArtifact: (a: { title: string; type: ArtifactType; content: string }) => void;
  resetForSession: (sessionId: string) => void;
  setLiveText: (t: string) => void;
  clearLiveText: () => void;
}

// Throttle live-text updates so a fast stream doesn't re-render the panel
// on every token. The latest value is always flushed on turn end.
let lastLiveAt = 0;
let pendingLive: string | null = null;
let liveFlushTimer: ReturnType<typeof setTimeout> | null = null;

const NEXT_STATUS: Record<PlanStepStatus, PlanStepStatus> = {
  pending: 'active',
  active: 'done',
  done: 'pending',
};

export const useFollowPanelStore = create<FollowPanelStore>((set) => ({
  collapsed: false,
  activeTab: 'plan',
  width: 400,
  liveText: '',
  sessionId: null,
  followedFile: null,
  plan: null,
  artifacts: [],

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setCollapsed: (v) => set({ collapsed: v }),
  setActiveTab: (t) => set({ activeTab: t }),
  setWidth: (w) => set({ width: Math.max(320, Math.min(760, Math.round(w))) }),

  // File edits are "followed" into the canvas live (gated by Follow Agent in the
  // tool executor). When the panel is open we surface the Code tab.
  followFile: (f) => set((s) => ({ followedFile: f, activeTab: s.collapsed ? s.activeTab : 'code' })),

  setPlan: (title, steps) =>
    set((s) => ({ plan: { title, steps }, activeTab: s.collapsed ? s.activeTab : 'plan' })),

  clearPlan: () => set((s) => ({ plan: null })),

  setStepStatus: (id, status) =>
    set((s) =>
      s.plan
        ? { plan: { ...s.plan, steps: s.plan.steps.map((st) => (st.id === id ? { ...st, status } : st)) } }
        : {},
    ),

  addArtifact: (a) =>
    set((s) => ({
      artifacts: [...s.artifacts, { ...a, id: crypto.randomUUID(), ts: Date.now() }],
      activeTab: s.collapsed ? s.activeTab : 'artifacts',
    })),

  // Reset canvas content when the active chat changes (keep collapse + global preview).
  resetForSession: (sessionId) =>
    set((s) =>
      s.sessionId === sessionId
        ? {}
        : { sessionId, followedFile: null, plan: null, artifacts: [] },
    ),

  setLiveText: (t) => {
    const now = Date.now();
    pendingLive = t;
    if (now - lastLiveAt < 150) {
      if (!liveFlushTimer) {
        liveFlushTimer = setTimeout(() => {
          liveFlushTimer = null;
          lastLiveAt = Date.now();
          if (pendingLive != null) set({ liveText: pendingLive });
          pendingLive = null;
        }, 150);
      }
      return;
    }
    lastLiveAt = now;
    pendingLive = null;
    if (liveFlushTimer) {
      clearTimeout(liveFlushTimer);
      liveFlushTimer = null;
    }
    set({ liveText: t });
  },

  clearLiveText: () => {
    if (liveFlushTimer) {
      clearTimeout(liveFlushTimer);
      liveFlushTimer = null;
    }
    pendingLive = null;
    lastLiveAt = 0;
    set({ liveText: '' });
  },
}));
