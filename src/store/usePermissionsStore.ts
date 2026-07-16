/* ================================================
   Tool permission matrix — Claude-Code-style per-tool policy that gates the
   agent's tool calls before they run. Modes:
     - 'allow' : execute immediately, no prompt (write_file skips diff review)
     - 'ask'   : prompt first (write_file shows the diff modal; others run)
     - 'deny'  : block the tool entirely and report it to the model

   Persisted to localStorage so the policy survives restarts. Read-only tools
   default to 'allow'; mutating tools (writes, commands, commits) default to
   'ask' so the user stays in control out of the box.
   ================================================ */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ToolPermission = 'allow' | 'ask' | 'deny';

/** Tool ids match the names in src/services/providers/toolSchemas.ts. */
export const TOOL_IDS = [
  'read_file',
  'list_dir',
  'search_code',
  'git_status',
  'write_file',
  'run_command',
  'git_commit',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_LABELS: Record<ToolId, string> = {
  read_file: 'Read file',
  list_dir: 'List directory',
  search_code: 'Search code',
  git_status: 'Git status',
  write_file: 'Write / edit file',
  run_command: 'Run shell command',
  git_commit: 'Git commit',
};

const DEFAULTS: Record<ToolId, ToolPermission> = {
  read_file: 'allow',
  list_dir: 'allow',
  search_code: 'allow',
  git_status: 'allow',
  write_file: 'ask',
  run_command: 'ask',
  git_commit: 'ask',
};

interface PermissionsStore {
  modes: Record<ToolId, ToolPermission>;
  /** Resolve the effective mode for a tool (falls back to 'ask'). */
  getMode: (tool: string) => ToolPermission;
  setMode: (tool: ToolId, mode: ToolPermission) => void;
  reset: () => void;
}

export const usePermissionsStore = create<PermissionsStore>()(
  persist(
    (set, get) => ({
      modes: { ...DEFAULTS },

      getMode: (tool) => get().modes[tool as ToolId] ?? 'ask',

      setMode: (tool, mode) =>
        set((state) => ({ modes: { ...state.modes, [tool]: mode } })),

      reset: () => set({ modes: { ...DEFAULTS } }),
    }),
    {
      name: 'aios-permissions',
      partialize: (state) => ({ modes: state.modes }),
    },
  ),
);
