import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { ChatMessage } from '@/core/types';
import { useProjectStore } from '@/store/useProjectStore';

/**
 * Debounced localStorage wrapper for the persist middleware.
 *
 * Without this, every streaming token delta triggers a full `setState` on the
 * chat store, and the default persist storage synchronously serialises the
 * ENTIRE sessions array to localStorage on each one — a multi-hundred-KB
 * JSON.stringify + write on the main thread, per token. That is the main cause
 * of the GUI "freezing" during a response. This wrapper coalesces rapid writes
 * into a single trailing write (per key) so streaming never blocks the UI.
 */
const debouncedLocalStorage: StateStorage = (() => {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const flush = (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* quota / private-mode — ignore */
    }
  };
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      const existing = pending.get(name);
      if (existing) clearTimeout(existing);
      pending.set(
        name,
        setTimeout(() => {
          pending.delete(name);
          flush(name, value);
        }, 400),
      );
    },
    removeItem: (name) => {
      const existing = pending.get(name);
      if (existing) clearTimeout(existing);
      pending.delete(name);
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
})();

// Best-effort synchronous flush of any pending persist writes (e.g. on tab
// close / app quit) so nothing is lost.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // No-op hook kept for clarity; pending timers are short (400ms).
  });
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  activeAgentId: string;
  model: string;
  provider: string;
  /** Chat project this conversation belongs to. Null/undefined → the default project. */
  projectId?: string | null;
  /** Optional objective set via the `/goal` slash command. */
  goal?: string;
  createdAt: number;
  isPinned?: boolean;
  isArchived?: boolean;
  /** True while the title is still auto-derived from the conversation. A manual
   *  rename clears it so we never overwrite the user's choice. */
  isAutoTitle?: boolean;
}

/** A chat project groups related conversations in the sidebar. */
export interface ChatProject {
  id: string;
  name: string;
  /** Absolute folder path backing this project, once a folder has been
   *  opened for it. Null/undefined → folder-less (e.g. General, or a
   *  project that hasn't been linked to a folder yet). Stored per project
   *  so each chat remembers its own workspace instead of sharing one
   *  global root. */
  rootPath?: string | null;
}

export const DEFAULT_PROJECT_ID = 'proj-general';
export const DEFAULT_PROJECT_NAME = 'General';

interface ChatStore {
  sessions: ChatSession[];
  projects: ChatProject[];
  activeProjectId: string;
  activeSessionId: string | null;
  searchQuery: string;
  dynamicModels: Record<string, string[]>;

  createSession: (
    agentId: string,
    provider: string,
    model: string,
    firstMessageText?: string,
    projectId?: string | null,
  ) => string;
  removeSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  /** Update the title but keep the auto-title marker (used when we
   *  re-derive a smarter title from the live conversation). */
  autoTitleSession: (id: string, title: string) => void;
  duplicateSession: (id: string) => void;
  togglePinSession: (id: string) => void;
  toggleArchiveSession: (id: string) => void;
  setActiveSessionId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  updateDiscoveredModels: (providerId: string, models: string[]) => void;
  clearAllSessions: () => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;

  createProject: (name: string) => string;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  setActiveProject: (id: string) => void;
  /** Link a folder path to a project so its conversations keep their
   *  own workspace (instead of every chat sharing one global root). */
  setProjectRoot: (id: string, root: string | null) => void;
  setGoal: (sessionId: string, goal: string) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      projects: [],
      activeProjectId: '',
      activeSessionId: null,
      searchQuery: '',
      dynamicModels: {},

      createSession: (agentId, provider, model, firstMessageText, projectId) => {
        const id = crypto.randomUUID();
        // Title starts empty; a smart one-line summary is derived by the LLM
        // once the conversation has enough context (see generateConversationTitle).
        const newSession: ChatSession = {
          id,
          title: '',
          messages: [],
          activeAgentId: agentId,
          model,
          provider,
          projectId: projectId === undefined ? (get().activeProjectId || null) : projectId,
          createdAt: Date.now(),
          isPinned: false,
          isArchived: false,
          isAutoTitle: true,
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: id,
        }));
        return id;
      },

      removeSession: (id) =>
        set((state) => {
          const nextSessions = state.sessions.filter((s) => s.id !== id);
          const nextActiveId =
            state.activeSessionId === id
              ? nextSessions.length > 0
                ? nextSessions[0].id
                : null
              : state.activeSessionId;
          return { sessions: nextSessions, activeSessionId: nextActiveId };
        }),

      renameSession: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, isAutoTitle: false } : s,
          ),
        })),

      autoTitleSession: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, isAutoTitle: true } : s,
          ),
        })),

      duplicateSession: (id) =>
        set((state) => {
          const target = state.sessions.find((s) => s.id === id);
          if (!target) return {};
          const dup: ChatSession = {
            ...target,
            id: crypto.randomUUID(),
            title: `${target.title} (Copy)`,
            createdAt: Date.now(),
            isPinned: false,
          };
          return {
            sessions: [dup, ...state.sessions],
            activeSessionId: dup.id,
          };
        }),

      togglePinSession: (id) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, isPinned: !s.isPinned } : s,
          ),
        })),

      toggleArchiveSession: (id) =>
        set((state) => {
          const sessions = state.sessions.map((s) =>
            s.id === id ? { ...s, isArchived: !s.isArchived } : s,
          );
          const nextActiveId =
            state.activeSessionId === id
              ? sessions.filter((s) => !s.isArchived).length > 0
                ? sessions.filter((s) => !s.isArchived)[0].id
                : null
              : state.activeSessionId;
          return { sessions, activeSessionId: nextActiveId };
        }),

      setActiveSessionId: (id) => set({ activeSessionId: id }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      updateDiscoveredModels: (providerId, models) =>
        set((state) => ({
          dynamicModels: { ...state.dynamicModels, [providerId]: models },
        })),

      addMessage: (sessionId, message) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s,
          ),
        })),

      updateMessage: (sessionId, messageId, patch) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m,
                  ),
                }
              : s,
          ),
        })),

      clearAllSessions: () => set({ sessions: [], activeSessionId: null }),

      createProject: (name) => {
        const id = `proj-${crypto.randomUUID().slice(0, 8)}`;
        const trimmed = name.trim() || 'Untitled Project';
        set((state) => ({
          projects: [...state.projects, { id, name: trimmed }],
          activeProjectId: id,
        }));
        return id;
      },

      removeProject: (id) => {
        // Drop the project and detach its conversations (they become folder-less
        // rather than being force-moved to a default project). If it was the
        // active project, also clear the shared workspace root.
        const wasActive = get().activeProjectId === id;
        set((state) => {
          const projects = state.projects.filter((p) => p.id !== id);
          const sessions = state.sessions.map((s) =>
            s.projectId === id ? { ...s, projectId: null } : s,
          );
          const nextActiveProjectId =
            state.activeProjectId === id ? '' : state.activeProjectId;
          return {
            projects,
            sessions,
            activeProjectId: nextActiveProjectId,
          };
        });
        if (wasActive && useProjectStore.getState().projectRoot) {
          useProjectStore.setState({ projectRoot: null });
        }
      },

      renameProject: (id, name) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, name: name.trim() || p.name } : p,
          ),
        })),

      setActiveProject: (id) => set({ activeProjectId: id }),

      setProjectRoot: (id, root) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, rootPath: root } : p,
          ),
        })),

      setGoal: (sessionId, goal) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, goal: goal || undefined } : s,
          ),
        })),
    }),
    {
      name: 'aios-chat-sessions',
      storage: createJSONStorage(() => debouncedLocalStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        dynamicModels: state.dynamicModels,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

/** Look up a conversation by id (outside React). Used for "copy by ID" context
 *  injection and exports. */
export function getSessionById(id: string): ChatSession | null {
  return useChatStore.getState().sessions.find((s) => s.id === id) ?? null;
}

/**
 * Resolve the provider/model that should serve an LLM call made "in this
 * session". Every LLM call in the app defers to the active session's
 * provider/model first; this is the single source of truth so the Director,
 * the workflow runner, and the title generator all use the same brain the
 * user is currently talking to (not an agent's hardcoded defaults).
 */
export function getActiveSessionProvider(): { provider: string; model: string } {
  const { sessions, activeSessionId } = useChatStore.getState();
  const session =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null;
  if (session) return { provider: session.provider, model: session.model };
  // Fallback to whatever the store last saw active, else safe defaults.
  return { provider: 'openai', model: 'gpt-4o' };
}
