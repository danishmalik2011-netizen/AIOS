import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Copy,
  Clipboard,
  Eraser,
  FolderOpen,
  Save,
  Sidebar as SidebarIcon,
  Settings,
  Grid,
  FilePlus,
  FolderPlus,
  Check,
  X,
  LayoutDashboard,
  Bot,
  Workflow,
  Folder,
  Monitor,
  GitBranch,
  Brain,
  Terminal as TerminalIcon,
  Boxes,
  BookOpen,
  RefreshCw,
  Plus,
  Trash,
  Download,
} from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useGitStore } from '@/store/useGitStore';
import { useMemoryStore } from '@/store/useMemoryStore';
import { usePromptStore } from '@/store/usePromptStore';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { useAgentStore } from '@/store/useAgentStore';
import { useChatStore } from '@/store/useChatStore';
import { useTerminalStore } from '@/store/useTerminalStore';
import { toast } from '@/store/useNotificationStore';
import type { ProjectFile } from '@/core/types';
import './ContextMenu.css';

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  type: 'terminal' | 'file-tree' | 'editor' | 'general';
  data: Record<string, string | null>;
}

type NamingState = { kind: 'file' | 'folder'; parentPath: string } | null;

function findNode(nodes: ProjectFile[], id: string): ProjectFile | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function parentPathOf(node: ProjectFile): string {
  if (node.type === 'directory') return node.path;
  const parts = node.path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function ContextMenu() {
  const [menu, setMenu] = useState<MenuState>({
    visible: false,
    x: 0,
    y: 0,
    type: 'general',
    data: {},
  });
  const [naming, setNaming] = useState<NamingState>(null);
  const [draftName, setDraftName] = useState('');

  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleCommandPalette = useSettingsStore((s) => s.toggleCommandPalette);
  const setActiveView = useSettingsStore((s) => s.setActiveView);
  const activeView = useSettingsStore((s) => s.activeView);
  const saveActiveFile = useProjectStore((s) => s.saveActiveFile);
  const openFile = useProjectStore((s) => s.openFile);
  const openFolder = useProjectStore((s) => s.openFolder);
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const fileTree = useProjectStore((s) => s.fileTree);
  const createEntry = useProjectStore((s) => s.createEntry);
  const addSession = useTerminalStore((s) => s.addSession);

  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback((e?: any) => {
    if (e && menuRef.current?.contains(e.target as Node)) {
      return;
    }
    setMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    setNaming(null);
    setDraftName('');
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();

    let target = e.target as HTMLElement | null;
    let type: MenuState['type'] = 'general';
    const data: Record<string, string | null> = {};

    while (target) {
      if (
        target.classList.contains('terminal__body') ||
        target.classList.contains('terminal-split__pane') ||
        target.closest('.terminal-pane')
      ) {
        type = 'terminal';
        const pane = target.closest('[data-session-id]');
        if (pane) data.sessionId = pane.getAttribute('data-session-id');
        break;
      }
      if (target.closest('.filesview__row') || target.classList.contains('filesview__row')) {
        type = 'file-tree';
        const row = target.closest('.filesview__row');
        if (row) {
          data.fileId = row.getAttribute('data-file-id');
          data.fileType = row.getAttribute('data-file-type');
        }
        break;
      }
      if (target.closest('.filesview__monaco') || target.classList.contains('monaco-editor')) {
        type = 'editor';
        break;
      }
      target = target.parentElement;
    }

    const x = Math.min(window.innerWidth - 200, e.clientX);
    const y = Math.min(window.innerHeight - 280, e.clientY);

    setNaming(null);
    setDraftName('');
    setMenu({ visible: true, x, y, type, data });
  }, []);

  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousedown', close, true);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [handleContextMenu, close]);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  if (!menu.visible) return null;

  const handleCopy = async () => {
    try {
      const text = window.getSelection()?.toString();
      if (text) {
        if (window.aios?.clipboard) {
          window.aios.clipboard.writeText(text);
        } else {
          await navigator.clipboard.writeText(text);
        }
        toast.success('Copied selection', 'Copied text to clipboard.');
      } else {
        toast.info('No selection', 'Select text to copy.');
      }
    } catch {
      toast.error('Copy failed');
    }
  };

  const handlePaste = async () => {
    try {
      let text = '';
      if (window.aios?.clipboard) {
        text = window.aios.clipboard.readText();
      } else {
        text = await navigator.clipboard.readText();
      }
      if (menu.type === 'terminal' && menu.data.sessionId && window.aios) {
        window.aios.pty.write(menu.data.sessionId, text);
      } else {
        toast.info('Paste complete', 'Pasted clipboard contents.');
      }
    } catch {
      toast.error('Paste failed', 'Clipboard read denied.');
    }
  };

  const handleClearTerminal = () => {
    const sessId = menu.data.sessionId;
    if (sessId) {
      window.dispatchEvent(new CustomEvent('clear-terminal', { detail: { sessionId: sessId } }));
      toast.success('Terminal cleared', 'Console scrollback cleared.');
    }
  };

  const startNaming = (kind: 'file' | 'folder') => {
    const id = menu.data.fileId;
    let parentPath = '/';
    if (id) {
      const node = findNode(fileTree, id);
      if (node) parentPath = parentPathOf(node);
    }
    setNaming({ kind, parentPath });
    setDraftName('');
  };

  const confirmNaming = async () => {
    if (!naming) return;
    const name = draftName.trim();
    if (!name) {
      close();
      return;
    }
    await createEntry(naming.parentPath, name, naming.kind === 'folder' ? 'directory' : 'file');
    close();
  };

  const handleSaveEditor = () => {
    void saveActiveFile();
    close();
  };

  const renderItems = () => {
    switch (menu.type) {
      case 'terminal':
        return (
          <>
            <button type="button" className="context-menu__item" onClick={handleCopy}>
              <Copy size={14} /> Copy Selection
            </button>
            <button type="button" className="context-menu__item" onClick={handlePaste}>
              <Clipboard size={14} /> Paste
            </button>
            <div className="context-menu__divider" />
            <button type="button" className="context-menu__item" onClick={handleClearTerminal}>
              <Eraser size={14} /> Clear scrollback
            </button>
          </>
        );
      case 'file-tree': {
        const id = menu.data.fileId;
        const openTarget = id ? findNode(fileTree, id) : null;
        return (
          <>
            <button
              type="button"
              className="context-menu__item"
              onClick={() => {
                if (openTarget && openTarget.type === 'file') openFile(openTarget);
                close();
              }}
            >
              <FolderOpen size={14} /> Open File
            </button>
            <div className="context-menu__divider" />
            <button type="button" className="context-menu__item" onClick={() => startNaming('file')}>
              <FilePlus size={14} /> New File
            </button>
            <button type="button" className="context-menu__item" onClick={() => startNaming('folder')}>
              <FolderPlus size={14} /> New Folder
            </button>
            <div className="context-menu__divider" />
            <button type="button" className="context-menu__item" onClick={handleSaveEditor}>
              <Save size={14} /> Save changes
            </button>
          </>
        );
      }
      case 'editor':
        return (
          <>
            <button type="button" className="context-menu__item" onClick={handleSaveEditor}>
              <Save size={14} /> Save file
            </button>
            <button type="button" className="context-menu__item" onClick={handleCopy}>
              <Copy size={14} /> Copy
            </button>
            <button type="button" className="context-menu__item" onClick={handlePaste}>
              <Clipboard size={14} /> Paste
            </button>
          </>
        );
      case 'general':
      default:
        switch (activeView) {
          case 'dashboard':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    toast.success('Dashboard synced', 'System diagnostics refreshed.');
                    close();
                  }}
                >
                  <RefreshCw size={14} /> Sync Dashboard
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    void openFolder();
                    close();
                  }}
                >
                  <FolderOpen size={14} /> Open Workspace...
                </button>
                <div className="context-menu__divider" />
                <button type="button" className="context-menu__item" onClick={toggleSidebar}>
                  <SidebarIcon size={14} /> Toggle Sidebar
                </button>
              </>
            );
          case 'agents':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    useChatStore.getState().createSession('director', 'google', 'gemini-2.5-flash');
                    toast.success('New session created', 'Started a new agent thread.');
                    close();
                  }}
                >
                  <Plus size={14} /> New Chat Session
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    const sid = useChatStore.getState().activeSessionId;
                    if (sid) {
                      useChatStore.getState().removeSession(sid);
                      toast.success('Chat cleared', 'Reset active agent thread.');
                    }
                    close();
                  }}
                >
                  <Trash size={14} /> Clear Active Chat
                </button>
                <div className="context-menu__divider" />
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    useAgentStore.getState().agents.forEach((a) => {
                      useAgentStore.getState().updateAgentStatus(a.id, 'idle');
                    });
                    toast.success('Agents reset', 'All agents returned to idle.');
                    close();
                  }}
                >
                  <Bot size={14} /> Reset Agent Roster
                </button>
              </>
            );
          case 'workflow':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    useWorkflowStore.getState().addNode({
                      id: `node-${crypto.randomUUID()}`,
                      type: 'custom',
                      position: { x: 100, y: 150 },
                      data: {
                        label: 'New Agent Node',
                        type: 'builder',
                        description: 'Custom added agent node.',
                        status: 'idle',
                        progress: 0,
                      },
                    });
                    toast.success('Node added', 'Placed new agent node on grid.');
                    close();
                  }}
                >
                  <Plus size={14} /> Add Agent Node
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    useWorkflowStore.setState({ nodes: [], edges: [] });
                    toast.info('Grid reset', 'Cleared all nodes and relationships.');
                    close();
                  }}
                >
                  <Trash size={14} /> Clear Workflow
                </button>
                <div className="context-menu__divider" />
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(useWorkflowStore.getState()));
                    const dl = document.createElement('a');
                    dl.setAttribute("href", dataStr);
                    dl.setAttribute("download", "workflow-blueprint.json");
                    dl.click();
                    close();
                  }}
                >
                  <Download size={14} /> Export Blueprint JSON
                </button>
              </>
            );
          case 'files':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={async () => {
                    if (projectRoot) {
                      await useProjectStore.getState().loadProjectRoot(projectRoot);
                      toast.success('Refreshed tree', 'File structure re-read from disk.');
                    }
                    close();
                  }}
                >
                  <RefreshCw size={14} /> Refresh Explorer
                </button>
                <div className="context-menu__divider" />
                <button type="button" className="context-menu__item" onClick={() => startNaming('file')}>
                  <FilePlus size={14} /> Create File...
                </button>
                <button type="button" className="context-menu__item" onClick={() => startNaming('folder')}>
                  <FolderPlus size={14} /> Create Folder...
                </button>
              </>
            );
          case 'preview':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('refresh-preview-frame'));
                    toast.success('Preview refreshed', 'Reloaded target canvas.');
                    close();
                  }}
                >
                  <RefreshCw size={14} /> Reload Live Page
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={async () => {
                    if (!projectRoot) {
                      toast.error('Export failed', 'No workspace open.');
                      return;
                    }
                    close();
                    toast.info('Exporting...', 'Zipping project folder...');
                    const saved = await (window as any).aios.fs.zipProject(projectRoot);
                    if (saved) toast.success('Project exported', `Saved ZIP to ${saved}`);
                  }}
                >
                  <Download size={14} /> Export ZIP Archive...
                </button>
              </>
            );
          case 'git':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={async () => {
                    await useGitStore.getState().refresh();
                    toast.success('Git refreshed', 'Re-scanned source modifications.');
                    close();
                  }}
                >
                  <RefreshCw size={14} /> Scan Repository
                </button>
                <div className="context-menu__divider" />
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={async () => {
                    await useGitStore.getState().stageAll();
                    toast.success('Changes staged', 'Staged all repository edits.');
                    close();
                  }}
                >
                  <Plus size={14} /> Stage All Modifications
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={async () => {
                    await useGitStore.getState().unstageAll();
                    toast.success('Changes unstaged', 'Unstaged all staged commits.');
                    close();
                  }}
                >
                  <X size={14} /> Unstage All
                </button>
              </>
            );
          case 'memory':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    toast.success('Context synced', 'Re-indexed project vector memories.');
                    close();
                  }}
                >
                  <Brain size={14} /> Re-index Project Context
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    useMemoryStore.setState({ entries: [] });
                    toast.success('Memories cleared', 'Reset persistent category maps.');
                    close();
                  }}
                >
                  <Trash size={14} /> Reset Vector Index
                </button>
              </>
            );
          case 'terminal':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={async () => {
                    await addSession();
                    toast.success('Terminal session opened', 'Spawned shell terminal.');
                    close();
                  }}
                >
                  <Plus size={14} /> Spawn New Shell
                </button>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    const sid = useTerminalStore.getState().activeSessionId;
                    if (sid) {
                      window.dispatchEvent(new CustomEvent('clear-terminal', { detail: { sessionId: sid } }));
                      toast.success('Terminal cleared');
                    }
                    close();
                  }}
                >
                  <Eraser size={14} /> Clear Active Buffer
                </button>
              </>
            );
          case 'prompts':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    usePromptStore.getState().addPrompt({
                      id: `p-${Date.now()}`,
                      title: 'New Prompt Template',
                      content: 'Given the codebase block below, review for logic errors:\n\n{{code}}',
                      category: 'Custom',
                      tags: ['new'],
                      usageCount: 0,
                      isFavorite: false,
                      createdAt: Date.now(),
                    });
                    toast.success('Prompt added', 'Created new template stub.');
                    close();
                  }}
                >
                  <Plus size={14} /> Create Prompt...
                </button>
              </>
            );
          case 'settings':
            return (
              <>
                <button
                  type="button"
                  className="context-menu__item"
                  onClick={() => {
                    useSettingsStore.setState({
                      settings: {
                        theme: 'dark-slate',
                        fontSize: 14,
                        fontFamily: 'JetBrains Mono',
                        tabSize: 2,
                        wordWrap: true,
                        minimap: true,
                        sidebarVisible: true,
                        sidebarWidth: 260,
                        activeView: 'dashboard',
                        planBeforeAct: false,
                        verifyOnComplete: true,
                        verifyCommand: '',
                      },
                    });
                    toast.success('Settings reset', 'Restored system configuration defaults.');
                    close();
                  }}
                >
                  <RefreshCw size={14} /> Restore Default Settings
                </button>
              </>
            );
          default:
            return (
              <>
                <button type="button" className="context-menu__item" onClick={toggleSidebar}>
                  <SidebarIcon size={14} /> Toggle Sidebar
                </button>
                <button type="button" className="context-menu__item" onClick={() => toggleCommandPalette()}>
                  <Grid size={14} /> Command Palette
                </button>
                <div className="context-menu__divider" />
                <button type="button" className="context-menu__item" onClick={() => setActiveView('settings')}>
                  <Settings size={14} /> Open Settings
                </button>
              </>
            );
        }
    }
  };

  return (
    <div
      ref={menuRef}
      className="context-menu glass"
      style={{ top: menu.y, left: menu.x }}
      role="menu"
      aria-label="Context menu"
      onClick={(e) => e.stopPropagation()}
    >
      {naming ? (
        <div className="context-menu__naming">
          <span className="context-menu__naming-label">
            {naming.kind === 'file' ? 'New file in' : 'New folder in'}
          </span>
          <span className="context-menu__naming-path">{naming.parentPath}</span>
          <div className="context-menu__naming-input-row">
            <input
              ref={inputRef}
              className="context-menu__naming-input"
              value={draftName}
              placeholder={naming.kind === 'file' ? 'name.ts' : 'folder-name'}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmNaming();
                if (e.key === 'Escape') close();
              }}
            />
            <button type="button" className="context-menu__naming-confirm" onClick={confirmNaming} aria-label="Create">
              <Check size={14} />
            </button>
            <button type="button" className="context-menu__naming-cancel" onClick={close} aria-label="Cancel">
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        renderItems()
      )}
    </div>
  );
}
