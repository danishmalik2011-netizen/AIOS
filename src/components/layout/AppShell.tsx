import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useTerminalStore } from '@/store/useTerminalStore';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useNotificationStore';
import { useHotkey } from '@/hooks/useHotkeys';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ViewRouter } from './ViewRouter';
import { CommandPalette } from '@/components/command/CommandPalette';
import { Toaster } from '@/components/shared/Toaster';
import { ContextMenu } from '@/components/shared/ContextMenu';
import { DiffReviewModal } from '@/components/shared/DiffReviewModal';
import { CommandApprovalModal } from '@/components/shared/CommandApprovalModal';
import { Modal } from '@/components/shared/Modal';
import { SettingsView } from '@/components/views/SettingsView';
import './AppShell.css';

import { ArrowDownCircle } from 'lucide-react';

const SIDEBAR_COLLAPSED_WIDTH = 48;

export function AppShell() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleCommandPalette = useSettingsStore((s) => s.toggleCommandPalette);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const setActiveView = useSettingsStore((s) => s.setActiveView);
  const setUpdateStatus = useSettingsStore((s) => s.setUpdateStatus);
  const updateStatus = useSettingsStore((s) => s.updateStatus);
  const checkForUpdates = useSettingsStore((s) => s.checkForUpdates);
  const quitAndInstall = useSettingsStore((s) => s.quitAndInstall);

  const openFolder = useProjectStore((s) => s.openFolder);
  const createEntry = useProjectStore((s) => s.createEntry);
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const saveActiveFile = useProjectStore((s) => s.saveActiveFile);
  const addSession = useTerminalStore((s) => s.addSession);

  // The workspace (Files / Terminal / Git / agent context) follows the
  // ACTIVE chat. Each project stores its own folder path, so switching
  // conversations swaps the workspace to that chat's project instead of
  // every chat sharing one global root.
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  // Subscribe ONLY to the active session's projectId, not the whole
  // sessions array. Streaming token deltas mutate session messages, so a
  // broad `s.sessions` subscription would re-render the entire app shell
  // on every token. Narrowing here keeps message updates from touching
  // the shell layout at all.
  const activeSessionProjectId = useChatStore(
    (s) => s.sessions.find((x) => x.id === s.activeSessionId)?.projectId ?? null,
  );
  const chatProjects = useChatStore((s) => s.projects);
  const activeProjectRoot = useMemo(() => {
    if (!activeSessionProjectId) return null;
    return chatProjects.find((p) => p.id === activeSessionProjectId)?.rootPath ?? null;
  }, [activeSessionProjectId, chatProjects]);

  // The workspace (Files / Terminal / Git / agent context) follows the
  // ACTIVE chat. Each project stores its own folder path, so switching
  // conversations swaps the workspace to that chat's project instead of
  // every chat sharing one global root. Open tabs / dirty drafts are
  // stashed per chat (see workspaceCache) so they survive the switch.
  const prevSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSessionRef.current;
    if (prev && prev !== activeSessionId) {
      useProjectStore.getState().collectAndCacheTabs(prev);
    }
    const nextRoot = activeProjectRoot;
    const switchTo = async () => {
      // Only re-read the tree when the folder actually changed.
      if (nextRoot && nextRoot !== useProjectStore.getState().projectRoot) {
        await useProjectStore.getState().loadProjectRoot(nextRoot);
      }
      useProjectStore.getState().restoreCachedTabs(activeSessionId ?? '');
    };
    void switchTo();
    prevSessionRef.current = activeSessionId ?? null;
  }, [activeSessionId, activeProjectRoot]);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!window.aios) return;

    const offUpdate = window.aios.updater.onUpdateStatus((payload) => {
      setUpdateStatus(payload);

      if (payload.status === 'downloaded') {
        setShowUpdateModal(true);
        toast.success(
          'Update Ready!',
          `Version ${payload.version || ''} has been downloaded. Restart to install.`
        );
      } else if (payload.status === 'error') {
        toast.error('Update Error', payload.error || 'Failed to fetch update.');
      }
    });

    const timer = setTimeout(() => {
      checkForUpdates();
    }, 3000);

    return () => {
      offUpdate();
      clearTimeout(timer);
    };
  }, [setUpdateStatus, checkForUpdates]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${(fontSize / 14) * 100}%`;
    document.documentElement.style.setProperty('--font-mono', `'${fontFamily}', monospace`);
  }, [fontSize, fontFamily]);

  // Global keydown capture for Backspace inside text inputs.
  // NOTE: previously this copied the selection to the clipboard on
  // Backspace, which made a normal "select + delete" feel like an
  // unexpected auto-copy. We now let the browser handle deletion and
  // intentionally do NOT write the selection to the clipboard.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
          const start = activeEl.selectionStart;
          const end = activeEl.selectionEnd;
          if (start !== null && end !== null && start !== end) {
            e.preventDefault();
            activeEl.setRangeText('', start, end, 'end');
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, []);

  useHotkey('mod+k', useCallback(() => toggleCommandPalette(), [toggleCommandPalette]), {
    allowInInputs: true,
  });
  useHotkey('mod+p', useCallback(() => toggleCommandPalette(), [toggleCommandPalette]), {
    allowInInputs: true,
  });
  useHotkey('mod+b', useCallback(() => toggleSidebar(), [toggleSidebar]), { allowInInputs: true });

  useHotkey('mod+shift+d', useCallback(() => setActiveView('dashboard'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+a', useCallback(() => setActiveView('agents'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+e', useCallback(() => setActiveView('files'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+f', useCallback(() => setActiveView('workflow'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+t', useCallback(() => setActiveView('terminal'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+g', useCallback(() => setActiveView('git'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+m', useCallback(() => setActiveView('memory'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+s', useCallback(() => setActiveView('prompts'), [setActiveView]), { allowInInputs: true });
  useHotkey('mod+shift+w', useCallback(() => setActiveView('workspaces'), [setActiveView]), { allowInInputs: true });

  useHotkey('mod+shift+k', useCallback((e) => {
    e.preventDefault();
    const { activeSessionId } = useTerminalStore.getState();
    if (activeSessionId) {
      window.dispatchEvent(
        new CustomEvent('clear-terminal', { detail: { sessionId: activeSessionId } })
      );
      toast.success('Terminal cleared', 'Current terminal screen cleared.');
    }
  }, []), { allowInInputs: true });

  useHotkey('mod+,', useCallback(() => setSettingsOpen(!settingsOpen), [settingsOpen, setSettingsOpen]), { allowInInputs: true });

  useHotkey('mod+o', useCallback((e) => {
    e.preventDefault();
    void openFolder();
  }, [openFolder]), { allowInInputs: true });

  useHotkey('mod+n', useCallback((e) => {
    e.preventDefault();
    const name = prompt('Enter new file name:');
    if (!name) return;
    const targetDir = projectRoot || '/';
    createEntry(targetDir, name, 'file')
      .then(() => toast.success('File created', `"${name}" has been created.`))
      .catch((err) => toast.error('Creation failed', String(err)));
  }, [projectRoot, createEntry]), { allowInInputs: true });

  useHotkey('mod+shift+n', useCallback((e) => {
    e.preventDefault();
    const name = prompt('Enter new folder name:');
    if (!name) return;
    const targetDir = projectRoot || '/';
    createEntry(targetDir, name, 'directory')
      .then(() => toast.success('Folder created', `"${name}" has been created.`))
      .catch((err) => toast.error('Creation failed', String(err)));
  }, [projectRoot, createEntry]), { allowInInputs: true });

  useHotkey('mod+s', useCallback((e) => {
    e.preventDefault();
    void saveActiveFile();
  }, [saveActiveFile]), { allowInInputs: true });

  useHotkey('mod+t', useCallback((e) => {
    e.preventDefault();
    addSession();
    setActiveView('terminal');
    if (!sidebarVisible) toggleSidebar();
  }, [addSession, setActiveView, sidebarVisible, toggleSidebar]), { allowInInputs: true });

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        setSidebarWidth(ev.clientX);
      };
      const onUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [setSidebarWidth],
  );

  const shellStyle = {
    '--sidebar-width': sidebarVisible ? `${sidebarWidth}px` : `${SIDEBAR_COLLAPSED_WIDTH}px`,
  } as CSSProperties;

  return (
    <div className="app-shell noise-overlay" style={shellStyle}>
      <TopBar />
      <div className="app-shell__body">
        <Sidebar />
        {sidebarVisible && (
          <div
            className="app-shell__resize-handle"
            onMouseDown={startResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}
        <main className="app-shell__main">
          <ViewRouter />
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
      <Toaster />
      <ContextMenu />
      <DiffReviewModal />
      <CommandApprovalModal />

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
        size="xl"
        rawBody
      >
        <SettingsView />
      </Modal>

      <Modal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        title="Software Update Ready"
        size="md"
      >
        <div className="update-modal">
          <div className="update-modal__icon">
            <ArrowDownCircle size={36} className="update-modal__svg" />
          </div>
          <h3 className="update-modal__title">Version {updateStatus.version} is ready!</h3>
          <p className="update-modal__desc">
            A new update has been downloaded in the background. Restart the application now to apply the latest changes and features.
          </p>
          <div className="update-modal__actions">
            <button className="aios-button aios-button--secondary" onClick={() => setShowUpdateModal(false)}>
              Later
            </button>
            <button className="aios-button aios-button--primary" onClick={quitAndInstall}>
              Restart & Update
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
