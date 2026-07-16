/* ================================================
   Auto-access store — a "trust mode" toggle in the chat composer that lets the
   assistant act on the workspace without per-step prompts. When enabled, the
   agent gets full, uninterrupted access:

     - commands : shell commands run immediately (no approval popup)
     - edits    : file writes apply immediately (no diff review)

   Persisted so the choice sticks across sessions. Each granule can be toggled
   independently. Disabling the master switch restores the safe, prompt-per-step
   behaviour.
   ================================================ */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AutoAccessStore {
  /** Master switch for uninterrupted agent access. */
  enabled: boolean;
  /** Run shell commands without the approval popup. */
  commands: boolean;
  /** Apply file edits without the diff-review modal. */
  edits: boolean;
  setEnabled: (value: boolean) => void;
  setCommands: (value: boolean) => void;
  setEdits: (value: boolean) => void;
}

export const useAutoAccessStore = create<AutoAccessStore>()(
  persist(
    (set) => ({
      enabled: false,
      commands: true,
      edits: true,

      setEnabled: (value) =>
        set((state) =>
          value
            ? { enabled: true, commands: state.commands, edits: state.edits }
            : { enabled: false },
        ),
      setCommands: (value) => set({ commands: value }),
      setEdits: (value) => set({ edits: value }),
    }),
    {
      name: 'aios-auto-access',
      partialize: (state) => ({
        enabled: state.enabled,
        commands: state.commands,
        edits: state.edits,
      }),
    },
  ),
);
