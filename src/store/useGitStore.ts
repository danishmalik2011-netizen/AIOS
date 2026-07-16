import { create } from 'zustand';
import type { GitStatus, GitFileChange, GitCommit } from '@/core/types';
import { useProjectStore } from '@/store/useProjectStore';
import { toast } from '@/store/useNotificationStore';

/* ------------------------------------------------------------------ */
/*  Offline sample data — used in browser mode / before a folder with  */
/*  a real git repo has been opened, so the view stays explorable.    */
/* ------------------------------------------------------------------ */

const sampleStatus: GitStatus = {
  branch: 'main',
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
};

const sampleCommits: GitCommit[] = [];

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface GitStore {
  status: GitStatus;
  commits: GitCommit[];
  commitMessage: string;
  isCommitting: boolean;
  isLoading: boolean;
  /** True once we've confirmed the open folder is a real git repo. */
  isRealRepo: boolean;

  setCommitMessage: (message: string) => void;
  refresh: () => Promise<void>;
  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: () => Promise<void>;
}

function repoRoot(): string | null {
  return useProjectStore.getState().projectRoot;
}

export const useGitStore = create<GitStore>((set, get) => ({
  status: sampleStatus,
  commits: sampleCommits,
  commitMessage: '',
  isCommitting: false,
  isLoading: false,
  isRealRepo: false,

  setCommitMessage: (message) => set({ commitMessage: message }),

  refresh: async () => {
    const root = repoRoot();
    if (!root || !window.aios) return;

    set({ isLoading: true });
    try {
      const [status, log] = await Promise.all([
        window.aios.git.status(root),
        window.aios.git.log(root, 50),
      ]);
      if (!status) {
        set({ isRealRepo: false, isLoading: false });
        return;
      }
      set({
        status: status as GitStatus,
        commits: log as GitCommit[],
        isRealRepo: true,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      toast.error('Git error', err instanceof Error ? err.message : String(err));
    }
  },

  stageFile: async (path) => {
    const root = repoRoot();
    if (!root || !window.aios || !get().isRealRepo) {
      set((state) => {
        const file = state.status.unstaged.find((f) => f.path === path);
        if (!file) return state;
        return {
          status: {
            ...state.status,
            unstaged: state.status.unstaged.filter((f) => f.path !== path),
            staged: [...state.status.staged, file],
          },
        };
      });
      return;
    }
    const status = await window.aios.git.stage(root, path);
    set({ status: status as GitStatus });
  },

  unstageFile: async (path) => {
    const root = repoRoot();
    if (!root || !window.aios || !get().isRealRepo) {
      set((state) => {
        const file = state.status.staged.find((f) => f.path === path);
        if (!file) return state;
        return {
          status: {
            ...state.status,
            staged: state.status.staged.filter((f) => f.path !== path),
            unstaged: [...state.status.unstaged, file],
          },
        };
      });
      return;
    }
    const status = await window.aios.git.unstage(root, path);
    set({ status: status as GitStatus });
  },

  stageAll: async () => {
    const root = repoRoot();
    if (!root || !window.aios || !get().isRealRepo) {
      set((state) => ({
        status: {
          ...state.status,
          staged: [...state.status.staged, ...state.status.unstaged],
          unstaged: [],
          untracked: [],
        },
      }));
      return;
    }
    const status = await window.aios.git.stageAll(root);
    set({ status: status as GitStatus });
  },

  unstageAll: async () => {
    const root = repoRoot();
    if (!root || !window.aios || !get().isRealRepo) {
      set((state) => ({
        status: {
          ...state.status,
          unstaged: [...state.status.unstaged, ...state.status.staged],
          staged: [],
        },
      }));
      return;
    }
    const status = await window.aios.git.unstageAll(root);
    set({ status: status as GitStatus });
  },

  commit: async () => {
    const { commitMessage, status, isRealRepo } = get();
    if (!commitMessage.trim() || status.staged.length === 0) return;
    const root = repoRoot();

    set({ isCommitting: true });

    if (!root || !window.aios || !isRealRepo) {
      const newCommit: GitCommit = {
        hash: Math.random().toString(36).substring(2, 9),
        message: commitMessage,
        author: 'You',
        date: Date.now(),
        files: status.staged.length,
      };
      set((state) => ({
        commits: [newCommit, ...state.commits],
        commitMessage: '',
        isCommitting: false,
        status: { ...state.status, staged: [], ahead: state.status.ahead + 1 },
      }));
      return;
    }

    try {
      const newCommit = (await window.aios.git.commit(root, commitMessage)) as GitCommit;
      const nextStatus = (await window.aios.git.status(root)) as GitStatus;
      set({
        commits: [newCommit, ...get().commits],
        commitMessage: '',
        isCommitting: false,
        status: nextStatus,
      });
    } catch (err) {
      set({ isCommitting: false });
      toast.error('Commit failed', err instanceof Error ? err.message : String(err));
    }
  },
}));

/* Re-sync git status whenever a different project folder is opened. */
useProjectStore.subscribe((state, prevState) => {
  if (state.projectRoot !== prevState.projectRoot) {
    void useGitStore.getState().refresh();
  }
});
