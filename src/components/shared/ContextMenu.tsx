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
} from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProjectStore } from '@/store/useProjectStore';
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
  const saveActiveFile = useProjectStore((s) => s.saveActiveFile);
  const openFile = useProjectStore((s) => s.openFile);
  const fileTree = useProjectStore((s) => s.fileTree);
  const createEntry = useProjectStore((s) => s.createEntry);

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
      if (target.classList.contains('filesview__row')) {
        type = 'file-tree';
        data.fileId = target.getAttribute('data-file-id');
        data.fileType = target.getAttribute('data-file-type');
        break;
      }
      if (target.closest('.filesview__monaco') || target.classList.contains('monaco-editor')) {
        type = 'editor';
        break;
      }
      target = target.parentElement;
    }

    const x = Math.min(window.innerWidth - 200, e.clientX);
    const y = Math.min(window.innerHeight - 260, e.clientY);

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
    const text = window.getSelection()?.toString();
    if (text) {
      await navigator.clipboard.writeText(text);
      toast.success('Copied selection', 'Copied text to clipboard.');
    } else {
      toast.info('No selection', 'Select text to copy.');
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
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

  function handleSaveEditor() {
    void saveActiveFile();
  }
}
