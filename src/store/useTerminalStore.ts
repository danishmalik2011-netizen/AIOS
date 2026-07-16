import { create } from 'zustand';
import type { TerminalSession } from '@/core/types';

interface AddSessionOptions {
  /** Command to run automatically once the shell is ready. */
  initialCommand?: string;
  /** Whether the new session should become the active tab. Defaults to true. */
  activate?: boolean;
  /** Override the auto-generated display name. */
  name?: string;
}

interface TerminalStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  addSession: (opts?: AddSessionOptions) => string;
  removeSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setActiveSession: (id: string) => void;
  markDead: (id: string) => void;
  /** Track which sessions have had their PTY spawned. */
  ptySpawned: Set<string>;
  markPtySpawned: (id: string) => void;
  /** Store last workspace deploy for auto-split. */
  lastWorkspaceDeploy: { ids: string[]; layout: 'tabs' | 'grid' } | null;
  setLastWorkspaceDeploy: (data: { ids: string[]; layout: 'tabs' | 'grid' }) => void;
  clearLastWorkspaceDeploy: () => void;
  /** Spawn `count` sessions that each run the same command. Returns their ids. */
  deployWorkspace: (command: string, count: number, layout?: 'tabs' | 'grid') => string[];
}

const firstSession: TerminalSession = {
  id: 'term-1',
  name: 'Terminal 1',
  createdAt: Date.now(),
  isDead: false,
};

/** Pick the lowest free "Terminal N" index so names stay stable as tabs close. */
function nextTerminalNumber(sessions: TerminalSession[]): number {
  const used = sessions
    .map((s) => {
      const match = s.name.match(/^Terminal\s+(\d+)$/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter((n): n is number => n !== null);
  let candidate = 1;
  while (used.includes(candidate)) candidate++;
  return candidate;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: [firstSession],
  activeSessionId: firstSession.id,
  ptySpawned: new Set(),
  lastWorkspaceDeploy: null,

  addSession: (opts = {}) => {
    let nextId = '';
    set((state) => {
      const number = nextTerminalNumber(state.sessions);
      const newSession: TerminalSession = {
        id: `term-${Date.now()}-${number}`,
        name: opts.name ?? `Terminal ${number}`,
        createdAt: Date.now(),
        isDead: false,
        initialCommand: opts.initialCommand,
      };

      nextId = newSession.id;
      return {
        sessions: [...state.sessions, newSession],
        activeSessionId: opts.activate ?? true ? newSession.id : state.activeSessionId,
      };
    });
    return nextId;
  },

  removeSession: (id) =>
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      const newPtySpawned = new Set(state.ptySpawned);
      newPtySpawned.delete(id);
      const newActiveId =
        state.activeSessionId === id
          ? newSessions.length > 0
            ? newSessions[newSessions.length - 1].id
            : null
          : state.activeSessionId;
      return { sessions: newSessions, activeSessionId: newActiveId, ptySpawned: newPtySpawned };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  markDead: (id) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, isDead: true } : s)),
    })),

  markPtySpawned: (id) =>
    set((state) => {
      const next = new Set(state.ptySpawned);
      next.add(id);
      return { ptySpawned: next };
    }),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s)),
    })),

  setLastWorkspaceDeploy: (data) =>
    set({ lastWorkspaceDeploy: data }),

  clearLastWorkspaceDeploy: () =>
    set({ lastWorkspaceDeploy: null }),

  deployWorkspace: (command, count, layout: 'tabs' | 'grid' = 'tabs') => {
    const sanitizedCommand = command.trim();
    const total = Math.max(1, Math.min(12, Math.floor(count) || 1));
    const ids: string[] = [];

    set((state) => {
      const created: TerminalSession[] = [];
      const cliName = sanitizedCommand.split(' ')[0] || 'Terminal';
      for (let i = 0; i < total; i++) {
        const id = `term-${Date.now()}-ws-${i}`;
        ids.push(id);
        created.push({
          id,
          name: total === 1 ? cliName : `${cliName} ${i + 1}`,
          createdAt: Date.now(),
          isDead: false,
          initialCommand: sanitizedCommand || undefined,
        });
      }
      return {
        sessions: [...state.sessions, ...created],
        activeSessionId: created[0].id,
        lastWorkspaceDeploy: { ids, layout },
      };
    });

    return ids;
  },
}));
