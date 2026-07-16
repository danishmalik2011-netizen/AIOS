import { useState, useRef, useEffect } from 'react';
import {
  FolderPlus,
  FolderOpen,
  Search,
  Layout,
  Terminal,
  Play,
  Settings,
  HelpCircle,
  ChevronDown,
  FilePlus,
  Compass,
  Sidebar,
  Menu,
  ArrowDownCircle,
  RefreshCw,
} from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTerminalStore } from '@/store/useTerminalStore';
import { toast } from '@/store/useNotificationStore';
import pkg from '../../../package.json';
import { AiosLogo } from '@/components/shared/AiosLogo';
import { Wordmark } from '@/components/shared/Wordmark';
import './TopBar.css';

export function TopBar() {
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const openFolder = useProjectStore((s) => s.openFolder);
  const createEntry = useProjectStore((s) => s.createEntry);
  const addSession = useTerminalStore((s) => s.addSession);
  
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const activeView = useSettingsStore((s) => s.activeView);
  const setActiveView = useSettingsStore((s) => s.setActiveView);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const updateStatus = useSettingsStore((s) => s.updateStatus);
  const downloadUpdate = useSettingsStore((s) => s.downloadUpdate);
  const quitAndInstall = useSettingsStore((s) => s.quitAndInstall);

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menu: string) => {
    setActiveMenu((prev) => (prev === menu ? null : menu));
  };

  const handleOpenFolder = () => {
    setActiveMenu(null);
    void openFolder();
  };

  const handleNewFile = () => {
    setActiveMenu(null);
    const name = prompt('Enter new file name:');
    if (!name) return;
    const targetDir = projectRoot || '/';
    createEntry(targetDir, name, 'file')
      .then(() => toast.success('File created', `"${name}" has been created.`))
      .catch((err) => toast.error('Creation failed', String(err)));
  };

  const handleNewFolder = () => {
    setActiveMenu(null);
    const name = prompt('Enter new folder name:');
    if (!name) return;
    const targetDir = projectRoot || '/';
    createEntry(targetDir, name, 'directory')
      .then(() => toast.success('Folder created', `"${name}" has been created.`))
      .catch((err) => toast.error('Creation failed', String(err)));
  };

  const handleToggleFileExplorer = () => {
    setActiveMenu(null);
    if (activeView === 'files') {
      toggleSidebar();
    } else {
      setActiveView('files');
      if (!sidebarVisible) toggleSidebar();
    }
  };

  const handleNewTerminal = () => {
    setActiveMenu(null);
    addSession();
    setActiveView('terminal');
    if (!sidebarVisible) toggleSidebar();
  };

  const handleClearTerminal = () => {
    setActiveMenu(null);
    const { activeSessionId } = useTerminalStore.getState();
    if (activeSessionId) {
      window.dispatchEvent(
        new CustomEvent('clear-terminal', { detail: { sessionId: activeSessionId } })
      );
      toast.success('Terminal cleared', 'Current terminal screen cleared.');
    }
  };

  return (
    <div className="topbar" ref={menuRef}>
      <div className="topbar__left">
        <div className="topbar__brand" onClick={() => setActiveView('dashboard')}>
          <AiosLogo size={20} className="topbar__logo" />
          <Wordmark className="topbar__title" />
        </div>

        <div className="topbar__menus">
          <div className="topbar__menu-container">
            <button
              className={`topbar__menu-btn ${activeMenu === 'file' ? 'topbar__menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('file')}
            >
              File
            </button>
            {activeMenu === 'file' && (
              <div className="topbar__dropdown glass">
                <button onClick={handleOpenFolder}>
                  <FolderOpen size={13} />
                  <span>Open Folder...</span>
                  <kbd className="topbar__kbd">Ctrl+O</kbd>
                </button>
                <button onClick={handleNewFile}>
                  <FilePlus size={13} />
                  <span>New File...</span>
                  <kbd className="topbar__kbd">Ctrl+N</kbd>
                </button>
                <button onClick={handleNewFolder}>
                  <FolderPlus size={13} />
                  <span>New Folder...</span>
                  <kbd className="topbar__kbd">Ctrl+Shift+N</kbd>
                </button>
              </div>
            )}
          </div>

          <div className="topbar__menu-container">
            <button
              className={`topbar__menu-btn ${activeMenu === 'view' ? 'topbar__menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('view')}
            >
              View
            </button>
            {activeMenu === 'view' && (
              <div className="topbar__dropdown glass">
                <button onClick={() => { setActiveMenu(null); toggleSidebar(); }}>
                  <Sidebar size={13} />
                  <span>Toggle Sidebar</span>
                  <kbd className="topbar__kbd">Ctrl+B</kbd>
                </button>
                <button
                  onClick={handleToggleFileExplorer}
                  className={activeView === 'files' && sidebarVisible ? 'topbar__dropdown-item--active' : ''}
                >
                  <FolderOpen size={13} />
                  <span>Explorer (File Tree)</span>
                  <kbd className="topbar__kbd">Ctrl+Shift+E</kbd>
                </button>
                <button onClick={() => { setActiveMenu(null); setActiveView('dashboard'); }}>
                  <Layout size={13} />
                  <span>Dashboard</span>
                  <kbd className="topbar__kbd">Ctrl+Shift+D</kbd>
                </button>
                <button onClick={() => { setActiveMenu(null); setActiveView('agents'); }}>
                  <Compass size={13} />
                  <span>Agents Fleet</span>
                  <kbd className="topbar__kbd">Ctrl+Shift+A</kbd>
                </button>
                <button onClick={() => { setActiveMenu(null); setActiveView('workspaces'); }}>
                  <Play size={13} />
                  <span>Workspaces</span>
                  <kbd className="topbar__kbd">Ctrl+Shift+W</kbd>
                </button>
              </div>
            )}
          </div>

          <div className="topbar__menu-container">
            <button
              className={`topbar__menu-btn ${activeMenu === 'terminal' ? 'topbar__menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('terminal')}
            >
              Terminal
            </button>
            {activeMenu === 'terminal' && (
              <div className="topbar__dropdown glass">
                <button onClick={handleNewTerminal}>
                  <Terminal size={13} />
                  <span>New Terminal</span>
                  <kbd className="topbar__kbd">Ctrl+T</kbd>
                </button>
                <button onClick={handleClearTerminal}>
                  <Terminal size={13} />
                  <span>Clear Scrollback</span>
                  <kbd className="topbar__kbd">Ctrl+Shift+C</kbd>
                </button>
              </div>
            )}
          </div>

          <div className="topbar__menu-container">
            <button
              className={`topbar__menu-btn ${activeMenu === 'help' ? 'topbar__menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('help')}
            >
              Help
            </button>
            {activeMenu === 'help' && (
              <div className="topbar__dropdown glass">
                <button onClick={() => { setActiveMenu(null); setSettingsOpen(true); }}>
                  <Settings size={13} />
                  <span>Settings</span>
                  <kbd className="topbar__kbd">Ctrl+,</kbd>
                </button>
                <button onClick={() => { setActiveMenu(null); toast.info('About AIOS', `AIOS Development Platform v${pkg.version}`); }}>
                  <HelpCircle size={13} />
                  <span>About AIOS</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="topbar__center">
        <span className="topbar__workspace-path">
          {projectRoot ? `Workspace: ${projectRoot}` : ''}
        </span>
      </div>

      <div className="topbar__right">
        {updateStatus.status === 'available' && (
          <button
            className="topbar__update-btn topbar__update-btn--available"
            onClick={downloadUpdate}
            title={`Version ${updateStatus.version || ''} available. Click to download.`}
          >
            <ArrowDownCircle size={14} />
            <span>Update Available (v{updateStatus.version})</span>
          </button>
        )}
        {updateStatus.status === 'downloading' && (
          <div className="topbar__update-progress">
            <RefreshCw size={13} className="animate-spin" />
            <span>Downloading ({updateStatus.percent || 0}%)</span>
            <div className="topbar__update-progressbar">
              <div
                className="topbar__update-progressbar-fill"
                style={{ width: `${updateStatus.percent || 0}%` }}
              />
            </div>
          </div>
        )}
        {updateStatus.status === 'downloaded' && (
          <button
            className="topbar__update-btn topbar__update-btn--downloaded"
            onClick={quitAndInstall}
            title="Restart the application to install the downloaded update."
          >
            <ArrowDownCircle size={14} />
            <span>Restart to Update</span>
          </button>
        )}

        <button
          className="topbar__quick-btn"
          onClick={handleOpenFolder}
          title="Open Folder"
        >
          <FolderOpen size={15} />
        </button>
      </div>
    </div>
  );
}
