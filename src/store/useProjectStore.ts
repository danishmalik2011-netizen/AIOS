import { create } from 'zustand';
import type { ProjectFile } from '@/core/types';
import { toast } from '@/store/useNotificationStore';
import { useChatStore } from '@/store/useChatStore';
import { useAgentStore } from '@/store/useAgentStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { cacheTabs, getCachedTabs } from '@/store/workspaceCache';

/* ------------------------------------------------------------------ */
/*  Offline sample data — used when running as a plain browser SPA    */
/*  (no Electron bridge available) so the view stays fully explorable. */
/* ------------------------------------------------------------------ */

const sampleFileTree: ProjectFile[] = [
  {
    id: 'src',
    name: 'src',
    path: '/src',
    type: 'directory',
    isExpanded: true,
    children: [
      {
        id: 'src-components',
        name: 'components',
        path: '/src/components',
        type: 'directory',
        isExpanded: true,
        children: [
          {
            id: 'src-components-app',
            name: 'App.tsx',
            path: '/src/components/App.tsx',
            type: 'file',
            language: 'typescript',
            size: 2450,
            isModified: true,
          },
          {
            id: 'src-components-dashboard',
            name: 'Dashboard.tsx',
            path: '/src/components/Dashboard.tsx',
            type: 'file',
            language: 'typescript',
            size: 5120,
          },
          {
            id: 'src-components-sidebar',
            name: 'Sidebar.tsx',
            path: '/src/components/Sidebar.tsx',
            type: 'file',
            language: 'typescript',
            size: 3200,
            isModified: true,
          },
        ],
      },
      {
        id: 'src-core',
        name: 'core',
        path: '/src/core',
        type: 'directory',
        isExpanded: false,
        children: [
          {
            id: 'src-core-types',
            name: 'types.ts',
            path: '/src/core/types.ts',
            type: 'file',
            language: 'typescript',
            size: 5086,
          },
        ],
      },
      {
        id: 'src-store',
        name: 'store',
        path: '/src/store',
        type: 'directory',
        isExpanded: false,
        children: [
          {
            id: 'src-store-agents',
            name: 'useAgentStore.ts',
            path: '/src/store/useAgentStore.ts',
            type: 'file',
            language: 'typescript',
            size: 1800,
          },
        ],
      },
      {
        id: 'src-styles',
        name: 'styles',
        path: '/src/styles',
        type: 'directory',
        isExpanded: false,
        children: [
          {
            id: 'src-styles-index',
            name: 'index.css',
            path: '/src/styles/index.css',
            type: 'file',
            language: 'css',
            size: 4637,
          },
          {
            id: 'src-styles-glass',
            name: 'glassmorphism.css',
            path: '/src/styles/glassmorphism.css',
            type: 'file',
            language: 'css',
            size: 5308,
          },
        ],
      },
      {
        id: 'src-main',
        name: 'main.tsx',
        path: '/src/main.tsx',
        type: 'file',
        language: 'typescript',
        size: 377,
      },
    ],
  },
  {
    id: 'package-json',
    name: 'package.json',
    path: '/package.json',
    type: 'file',
    language: 'json',
    size: 782,
  },
  {
    id: 'tsconfig',
    name: 'tsconfig.json',
    path: '/tsconfig.json',
    type: 'file',
    language: 'json',
    size: 639,
  },
  {
    id: 'readme',
    name: 'README.md',
    path: '/README.md',
    type: 'file',
    language: 'markdown',
    size: 1200,
    isModified: true,
  },
];

const sampleFileContents: Record<string, string> = {
  'src-components-app': `import { useState } from 'react';
import { Dashboard } from './Dashboard';
import { Sidebar } from './Sidebar';

export function App() {
  const [activeView, setActiveView] = useState('dashboard');

  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="main-content">
        <Dashboard />
      </main>
    </div>
  );
}`,
  'src-core-types': '// See @/core/types for full type definitions',
  'src-main': `import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(<App />);`,
};

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface ProjectStore {
  /** Absolute filesystem path of the open project root. Null in browser/demo mode. */
  projectRoot: string | null;
  isLoadingTree: boolean;
  fileTree: ProjectFile[];
  activeFileId: string | null;
  openFiles: ProjectFile[];
  fileContents: Record<string, string>;
  /** File ids currently being fetched from disk, to avoid duplicate reads. */
  loadingFileIds: Set<string>;
  /** File ids with unsaved edits, so FilesView/tabs can show the modified dot. */
  dirtyFileIds: Set<string>;
  searchQuery: string;
  previewUrl: string;
  activeDevServers: Record<string, string>;

  registerDevServer: (sessionId: string, url: string) => void;
  unregisterDevServer: (sessionId: string) => void;
  /** Open a folder dialog. The chosen path is linked to the chat project
   *  (so it is remembered per chat) and loaded into the active workspace. */
  openFolder: () => Promise<void>;
  /** (Re)load a folder's tree into the active workspace view. Shared by
   *  openFolder and the per-chat project switcher so the workspace always
   *  reflects whichever conversation is currently active. Tab/draft state
   *  is managed separately (see collectAndCacheTabs / restoreCachedTabs)
   *  so each chat keeps its own open tabs across switches. */
  loadProjectRoot: (root: string) => Promise<void>;
  /** Stash the active chat's open tabs / active file / dirty drafts so they
   *  survive a conversation switch. */
  collectAndCacheTabs: (sessionId: string) => void;
  /** Restore a chat's open tabs / active file / dirty drafts (or clear to
   *  defaults when this chat has no cached view yet). */
  restoreCachedTabs: (sessionId: string) => void;
  /** Create a file or folder inside the directory at `dirPath`. */
  createEntry: (dirPath: string, name: string, type: 'file' | 'directory') => Promise<void>;
  setActiveFile: (id: string) => void;
  openFile: (file: ProjectFile) => Promise<void>;
  closeFile: (id: string) => void;
  toggleFolder: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setDraftContent: (id: string, content: string) => void;
  saveActiveFile: () => Promise<void>;
  setPreviewUrl: (url: string) => void;
}

function toggleFolderRecursive(files: ProjectFile[], id: string): ProjectFile[] {
  return files.map((file) => {
    if (file.id === id && file.type === 'directory') {
      return { ...file, isExpanded: !file.isExpanded };
    }
    if (file.children) {
      return { ...file, children: toggleFolderRecursive(file.children, id) };
    }
    return file;
  });
}

function findFile(files: ProjectFile[], id: string): ProjectFile | null {
  for (const f of files) {
    if (f.id === id) return f;
    if (f.children) {
      const found = findFile(f.children, id);
      if (found) return found;
    }
  }
  return null;
}

function languageFromName(name: string): string | undefined {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.css': 'css',
    '.scss': 'css',
    '.json': 'json',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.html': 'html',
    '.yml': 'yaml',
    '.yaml': 'yaml',
  };
  return map[ext];
}

/** Immutably insert `node` as a child of the directory whose path === dirPath. */
function insertNode(tree: ProjectFile[], dirPath: string, node: ProjectFile): ProjectFile[] {
  return tree.map((entry) => {
    if (entry.type === 'directory') {
      if (entry.path === dirPath) {
        const children = [...(entry.children ?? []), node].sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return { ...entry, children, isExpanded: true };
      }
      if (entry.children) {
        return { ...entry, children: insertNode(entry.children, dirPath, node) };
      }
    }
    return entry;
  });
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projectRoot: null,
  isLoadingTree: false,
  fileTree: sampleFileTree,
  activeFileId: 'src-components-app',
  openFiles: [
    sampleFileTree[0].children![0].children![0], // App.tsx
    sampleFileTree[0].children![0].children![1], // Dashboard.tsx
  ],
  fileContents: sampleFileContents,
  loadingFileIds: new Set(),
  dirtyFileIds: new Set(),
  searchQuery: '',
  previewUrl: 'http://localhost:3000',
  activeDevServers: {},

  registerDevServer: (sessionId, url) =>
    set((state) => {
      const nextServers = { ...state.activeDevServers, [sessionId]: url };
      return { activeDevServers: nextServers, previewUrl: url };
    }),

  unregisterDevServer: (sessionId) =>
    set((state) => {
      const nextServers = { ...state.activeDevServers };
      delete nextServers[sessionId];
      // If the current previewUrl was from this session, pick another active server or clear
      let nextPreviewUrl = state.previewUrl;
      if (state.activeDevServers[sessionId] === state.previewUrl) {
        const remainingUrls = Object.values(nextServers);
        nextPreviewUrl = remainingUrls.length > 0 ? remainingUrls[remainingUrls.length - 1] : '';
      }
      return { activeDevServers: nextServers, previewUrl: nextPreviewUrl };
    }),

  openFolder: async () => {
    if (!window.aios) return;
    const root = await window.aios.dialog.openFolder();
    if (!root) return;

    // A project is derived from the opened folder and holds its conversations.
    // The folder path is stored ON the project (rootPath) so it is remembered
    // per chat and the global workspace can follow whichever chat is active —
    // opening a folder for one chat no longer clobbers another chat's project.
    const folderName = root.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
    const chat = useChatStore.getState();
    const existing = chat.projects.find(
      (p) => p.name.toLowerCase() === folderName.toLowerCase(),
    );
    const projectId = existing?.id ?? chat.createProject(folderName);
    chat.setProjectRoot(projectId, root);

    // Load the tree into the active workspace (scoped to this project).
    await get().loadProjectRoot(root);

    const existingSession = chat.sessions.find((s) => s.projectId === projectId);
    if (!existingSession) {
      const agentStore = useAgentStore.getState();
      const agentId = agentStore.activeAgentId ?? agentStore.agents[0]?.id ?? '';
      const settings = useSettingsStore.getState();
      const providerObj =
        settings.providers.find((p) => p.isConnected) ?? settings.providers[0];
      const provider = providerObj?.id ?? '';
      const model = providerObj?.models?.[0] ?? '';
      chat.createSession(agentId, provider, model, undefined, projectId);
    } else {
      chat.setActiveSessionId(existingSession.id);
      chat.setActiveProject(projectId);
    }
  },

  loadProjectRoot: async (root) => {
    if (!window.aios) return;
    set({ isLoadingTree: true });
    try {
      const tree = (await window.aios.fs.readTree(root)) as ProjectFile[];
      set({
        projectRoot: root,
        fileTree: tree,
        isLoadingTree: false,
      });
      toast.success('Project opened', root);
    } catch (err) {
      set({ isLoadingTree: false });
      toast.error('Failed to open folder', err instanceof Error ? err.message : String(err));
    }
  },

  collectAndCacheTabs: (sessionId) => {
    const { openFiles, activeFileId, fileContents, dirtyFileIds } = get();
    cacheTabs(sessionId, {
      openFiles,
      activeFileId,
      fileContents,
      dirtyFileIds,
    });
  },

  restoreCachedTabs: (sessionId) => {
    const cached = getCachedTabs(sessionId);
    if (cached) {
      set({
        openFiles: cached.openFiles,
        activeFileId: cached.activeFileId,
        fileContents: cached.fileContents,
        dirtyFileIds: cached.dirtyFileIds,
      });
    } else {
      set({
        openFiles: [],
        activeFileId: null,
        fileContents: {},
        dirtyFileIds: new Set(),
      });
    }
  },

  createEntry: async (dirPath, name, type) => {
    const clean = name.trim();
    if (!clean) return;
    const { projectRoot, fileTree } = get();

    if (projectRoot && window.aios) {
      try {
        const tree = (await window.aios.fs.createEntry(
          projectRoot,
          dirPath,
          clean,
          type,
        )) as ProjectFile[];
        set({ fileTree: tree });
        toast.success(type === 'directory' ? 'Folder created' : 'File created', `${dirPath}/${clean}`);
      } catch (err) {
        toast.error('Could not create entry', err instanceof Error ? err.message : String(err));
      }
      return;
    }

    /* Demo / browser mode — mutate the in-memory tree. */
    const parentPath = dirPath === '/' ? '' : dirPath;
    const id = `${parentPath}/${clean}`;
    const node: ProjectFile =
      type === 'directory'
        ? { id, name: clean, path: id, type: 'directory', isExpanded: true, children: [] }
        : { id, name: clean, path: id, type: 'file', language: languageFromName(clean), size: 0 };
    set((state) => ({ fileTree: insertNode(state.fileTree, dirPath, node) }));
    toast.success(type === 'directory' ? 'Folder created' : 'File created', clean);
  },

  setActiveFile: (id) => set({ activeFileId: id }),

  openFile: async (file) => {
    const { openFiles, projectRoot, fileContents, loadingFileIds } = get();
    const alreadyOpen = openFiles.some((f) => f.id === file.id);
    set({
      activeFileId: file.id,
      openFiles: alreadyOpen ? openFiles : [...openFiles, file],
    });

    if (!projectRoot || !window.aios) return;
    if (file.id in fileContents || loadingFileIds.has(file.id)) return;

    const nextLoading = new Set(loadingFileIds);
    nextLoading.add(file.id);
    set({ loadingFileIds: nextLoading });

    try {
      const content = await window.aios.fs.readFile(projectRoot, file.path);
      set((state) => ({
        fileContents: { ...state.fileContents, [file.id]: content },
      }));
    } catch (err) {
      toast.error('Failed to read file', file.path);
    } finally {
      set((state) => {
        const next = new Set(state.loadingFileIds);
        next.delete(file.id);
        return { loadingFileIds: next };
      });
    }
  },

  closeFile: (id) =>
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f.id !== id);
      const newActiveId =
        state.activeFileId === id
          ? newOpenFiles.length > 0
            ? newOpenFiles[newOpenFiles.length - 1].id
            : null
          : state.activeFileId;
      return { openFiles: newOpenFiles, activeFileId: newActiveId };
    }),

  toggleFolder: (id) =>
    set((state) => ({
      fileTree: toggleFolderRecursive(state.fileTree, id),
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setDraftContent: (id, content) =>
    set((state) => {
      const dirty = new Set(state.dirtyFileIds);
      dirty.add(id);
      return {
        fileContents: { ...state.fileContents, [id]: content },
        dirtyFileIds: dirty,
      };
    }),

  saveActiveFile: async () => {
    const { activeFileId, projectRoot, fileContents, fileTree } = get();
    if (!activeFileId) return;
    const file = findFile(fileTree, activeFileId);
    if (!file) return;

    if (projectRoot && window.aios) {
      try {
        await window.aios.fs.writeFile(projectRoot, file.path, fileContents[activeFileId] ?? '');
        toast.success('Saved', file.path);
      } catch (err) {
        toast.error('Failed to save file', file.path);
        return;
      }
    } else {
      toast.success('Saved', file.path);
    }

    set((state) => {
      const dirty = new Set(state.dirtyFileIds);
      dirty.delete(activeFileId);
      return { dirtyFileIds: dirty };
    });
  },

  setPreviewUrl: (url) => set({ previewUrl: url }),
}));

function mergeTreeExpandedState(oldTree: ProjectFile[], newTree: ProjectFile[]): ProjectFile[] {
  const expandedMap = new Map<string, boolean>();

  const scan = (nodes: ProjectFile[]) => {
    for (const n of nodes) {
      if (n.type === 'directory') {
        expandedMap.set(n.path, Boolean(n.isExpanded));
        if (n.children) scan(n.children);
      }
    }
  };
  scan(oldTree);

  const apply = (nodes: ProjectFile[]): ProjectFile[] => {
    return nodes.map((n) => {
      if (n.type === 'directory') {
        return {
          ...n,
          isExpanded: expandedMap.has(n.path) ? expandedMap.get(n.path) : n.isExpanded,
          children: n.children ? apply(n.children) : undefined,
        };
      }
      return n;
    });
  };
  return apply(newTree);
}

const aios = typeof window !== 'undefined' ? window.aios : null;
if (aios?.fs?.onTreeChanged) {
  aios.fs.onTreeChanged(async () => {
    const { projectRoot, isLoadingTree, fileTree } = useProjectStore.getState();
    if (!projectRoot || isLoadingTree) return;

    try {
      const tree = (await aios.fs.readTree(projectRoot)) as ProjectFile[];
      const merged = mergeTreeExpandedState(fileTree, tree);
      useProjectStore.setState({ fileTree: merged });
    } catch (err) {
      console.error('Failed to auto-refresh project tree:', err);
    }
  });
}
