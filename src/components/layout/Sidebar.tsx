import { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Bot,
  Workflow,
  Folder,
  Monitor,
  GitBranch,
  Brain,
  Terminal,
  BookOpen,
  Settings,
  Bell,
  User,
  Search,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Info,
  Columns,
  Sliders,
  Sparkles,
  KeyRound,
  FileText,
  BarChart2,
  Smartphone,
  Tablet,
  FileCode,
  Globe,
  Activity,
  ClipboardList,
  Bug,
  AlertTriangle,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Boxes,
  Network,
} from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useAgentStore } from '@/store/useAgentStore';
import { useGitStore } from '@/store/useGitStore';
import { useMemoryStore } from '@/store/useMemoryStore';
import { useTerminalStore } from '@/store/useTerminalStore';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { TreeNode, filterTree } from '@/components/views/FilesView';
import { IconButton } from '@/components/shared/IconButton';
import { Input } from '@/components/shared/Input';
import { Spinner } from '@/components/shared/Spinner';
import { Tooltip } from '@/components/shared/Tooltip';
import { AgentAvatar } from '@/components/shared/AgentAvatar';
import { AiosLogo } from '@/components/shared/AiosLogo';
import type { SidebarView, MemoryCategory } from '@/core/types';
import './Sidebar.css';

interface AccordionSection {
  id: SidebarView;
  label: string;
  icon: typeof LayoutDashboard;
}

const sections: AccordionSection[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agents', label: 'Agent Fleet', icon: Bot },
  { id: 'workflow', label: 'Workflow nodes', icon: Workflow },
  { id: 'files', label: 'File tree', icon: Folder },
  { id: 'preview', label: 'Live targets', icon: Monitor },
  { id: 'git', label: 'Source control', icon: GitBranch },
  { id: 'memory', label: 'Memory categories', icon: Brain },
  { id: 'terminal', label: 'Terminal sessions', icon: Terminal },
  { id: 'workspaces', label: 'Workspaces', icon: Boxes },
  { id: 'prompts', label: 'Prompt templates', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const activeView = useSettingsStore((s) => s.activeView);
  const setActiveView = useSettingsStore((s) => s.setActiveView);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const setSidebarVisible = useSettingsStore((s) => s.setSidebarVisible);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const setActiveSection = useSettingsStore((s) => s.setActiveSection);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const [isLogoHovered, setIsLogoHovered] = useState(false);

  // Accordion open/close state. Files, Agents, and Terminals are open by default.
  const [expandedSections, setExpandedSections] = useState<Record<SidebarView, boolean>>({
    dashboard: false,
    agents: true,
    workflow: false,
    files: true,
    preview: false,
    git: false,
    memory: false,
    terminal: true,
    workspaces: false,
    prompts: false,
    settings: false,
    notifications: false,
    account: false,
    web: false,
  });

  const toggleSection = (id: SidebarView) => {
    if (id === 'settings') {
      setSettingsOpen(true);
    } else {
      setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
      setActiveView(id);
    }
  };

  const handleIconClick = (id: SidebarView) => {
    if (id === 'settings') {
      setSettingsOpen(true);
    } else {
      setActiveView(id);
      setSidebarVisible(true);
      setExpandedSections((prev) => ({ ...prev, [id]: true }));
    }
  };

  // Files store selectors
  const fileTree = useProjectStore((s) => s.fileTree);
  const activeFileId = useProjectStore((s) => s.activeFileId);
  const isLoadingTree = useProjectStore((s) => s.isLoadingTree);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const setSearchQuery = useProjectStore((s) => s.setSearchQuery);
  const toggleFolder = useProjectStore((s) => s.toggleFolder);
  const openFile = useProjectStore((s) => s.openFile);
  const openFolder = useProjectStore((s) => s.openFolder);

  // Agent store selectors
  const agents = useAgentStore((s) => s.agents);
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent);

  // Workflow store selectors
  const workflowNodes = useWorkflowStore((s) => s.nodes);

  // Git store selectors
  const gitStatus = useGitStore((s) => s.status);

  // Memory store selectors
  const activeCategory = useMemoryStore((s) => s.activeCategory);
  const setActiveCategory = useMemoryStore((s) => s.setActiveCategory);

  // Terminal store selectors
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);

  const isElectron = typeof window !== 'undefined' && Boolean(window.aios);

  const filteredTree = useMemo(() => {
    return filterTree(fileTree, searchQuery);
  }, [fileTree, searchQuery]);

  const totalChanges =
    (gitStatus.staged?.length ?? 0) +
    (gitStatus.unstaged?.length ?? 0) +
    (gitStatus.untracked?.length ?? 0);

  const memoryCategories: { label: string; value: MemoryCategory | 'all'; icon: React.ReactNode }[] = [
    { label: 'All Entries', value: 'all', icon: <Globe size={12} /> },
    { label: 'Architecture', value: 'architecture', icon: <Activity size={12} /> },
    { label: 'Requirements', value: 'requirements', icon: <ClipboardList size={12} /> },
    { label: 'Bugs & Issues', value: 'bugs', icon: <Bug size={12} /> },
    { label: 'Decisions', value: 'decisions', icon: <Info size={12} /> },
    { label: 'Documentation', value: 'documentation', icon: <BookOpen size={12} /> },
  ];

  return (
    <aside className={`sidebar glass-panel ${sidebarVisible ? 'sidebar--expanded' : 'sidebar--collapsed'}`}>
      {/* 1. COLLAPSED VIEW (Narrow 48px rail) */}
      {!sidebarVisible && (
        <div className="sidebar__collapsed-container">
          {/* Logo hover toggle button */}
          <button
            className="sidebar__logo-toggle"
            onMouseEnter={() => setIsLogoHovered(true)}
            onMouseLeave={() => setIsLogoHovered(false)}
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
          >
            <div className="sidebar__logo-toggle-inner">
              <AiosLogo
                size={28}
                className={`sidebar__logo-face ${isLogoHovered ? 'sidebar__logo-face--hidden' : ''}`}
              />
              <div className={`sidebar__toggle-face ${isLogoHovered ? 'sidebar__toggle-face--visible' : ''}`}>
                <PanelLeftOpen size={18} />
              </div>
            </div>
          </button>

          {/* Narrow rail categories */}
          <div className="sidebar__collapsed-icons">
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeView === sec.id;
              return (
                <Tooltip key={sec.id} content={sec.label} side="right" delay={250}>
                  <button
                    className={`sidebar__collapsed-btn ${isActive ? 'sidebar__collapsed-btn--active' : ''}`}
                    onClick={() => handleIconClick(sec.id)}
                    aria-label={sec.label}
                  >
                    <Icon size={20} />
                    {sec.id === 'agents' && agents.some((a) => a.status === 'running') && (
                      <span className="sidebar__badge-dot" />
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>

          {/* Narrow rail bottom utility buttons */}
          <div className="sidebar__collapsed-bottom">
            <Tooltip content="Notifications" side="right" delay={250}>
              <button
                className={`sidebar__collapsed-btn ${activeView === 'notifications' ? 'sidebar__collapsed-btn--active' : ''}`}
                onClick={() => handleIconClick('notifications')}
                aria-label="Notifications"
              >
                <Bell size={18} />
              </button>
            </Tooltip>
            <Tooltip content="Account" side="right" delay={250}>
              <button
                className={`sidebar__collapsed-btn ${activeView === 'account' ? 'sidebar__collapsed-btn--active' : ''}`}
                onClick={() => handleIconClick('account')}
                aria-label="Account"
              >
                <User size={18} />
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* 2. EXPANDED VIEW (Wide 260px list with accordion) */}
      {sidebarVisible && (
        <>
          <div className="sidebar__header">
            {/* Logo hover toggle button */}
            <button
              className="sidebar__logo-toggle"
              onMouseEnter={() => setIsLogoHovered(true)}
              onMouseLeave={() => setIsLogoHovered(false)}
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
            >
              <div className="sidebar__logo-toggle-inner">
                <AiosLogo
                  size={28}
                  className={`sidebar__logo-face ${isLogoHovered ? 'sidebar__logo-face--hidden' : ''}`}
                />
                <div className={`sidebar__toggle-face ${isLogoHovered ? 'sidebar__toggle-face--visible' : ''}`}>
                  <PanelLeftClose size={18} />
                </div>
              </div>
            </button>
            <span className="sidebar__title">AIOS WORKSPACE</span>
          </div>

          <div className="sidebar__content">
            {activeView === 'files' ? (
              /* Dedicated File Explorer Side Panel */
              <div className="sidebar__files-section sidebar__files-section--standalone">
                <div className="sidebar__section-title-standalone">
                  <Folder size={14} />
                  <span>WORKSPACE EXPLORER</span>
                </div>
                <div className="sidebar__search-row">
                  <Input
                    icon={<Search size={13} />}
                    placeholder="Filter files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Filter files"
                  />
                  {isElectron && (
                    <IconButton
                      icon={<FolderPlus size={14} />}
                      tooltip="Open folder…"
                      variant="ghost"
                      size="sm"
                      onClick={() => void openFolder()}
                    />
                  )}
                </div>
                {isLoadingTree ? (
                  <div className="sidebar__loading-state">
                    <Spinner size="sm" /> <span>Loading workspace...</span>
                  </div>
                ) : filteredTree.length > 0 ? (
                  <div role="tree" aria-label="Workspace Files" className="filesview__tree">
                    {filteredTree.map((node) => (
                      <TreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        activeFileId={activeFileId}
                        onToggle={toggleFolder}
                        onOpen={openFile}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="sidebar__empty-text">No files matched</div>
                )}
              </div>
            ) : (
              sections
                .filter((s) => s.id !== 'files')
                .map((section) => {
                  const Icon = section.icon;
                  const isOpen = expandedSections[section.id];
                  const isActive = activeView === section.id;

                  return (
                    <div key={section.id} className="sidebar__section">
                      {/* Section Title Header */}
                      <div
                        className={`sidebar__section-header ${
                          isActive ? 'sidebar__section-header--active' : ''
                        }`}
                        onClick={() => toggleSection(section.id)}
                      >
                        <div className="sidebar__section-title">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <Icon size={15} className="sidebar__section-icon" />
                          <span>{section.label}</span>
                        </div>
                      </div>

                      {/* Section Expanded Content */}
                      {isOpen && (
                        <div className="sidebar__section-body">
                          {/* 1. Dashboard Sub-Items */}
                          {section.id === 'dashboard' && (
                            <div className="sidebar__sub-list">
                              <div className="sidebar__sub-item sidebar__sub-item--active" onClick={() => setActiveView('dashboard')}>
                                <BarChart2 size={12} /> Mission Control Center
                              </div>
                            </div>
                          )}

                          {/* 2. Agents Fleet */}
                          {section.id === 'agents' && (
                            <div className="sidebar__sub-list">
                              {agents.length === 0 ? (
                                <div className="sidebar__empty-text">No active agents</div>
                              ) : (
                                agents.map((agent) => {
                                  const isAgentActive = agent.id === activeAgentId;
                                  let statusDot = 'sidebar__dot--idle';
                                  if (agent.status === 'running') statusDot = 'sidebar__dot--running';
                                  else if (agent.status === 'paused') statusDot = 'sidebar__dot--paused';
                                  else if (agent.status === 'error') statusDot = 'sidebar__dot--error';

                                  return (
                                    <div
                                      key={agent.id}
                                      className={`sidebar__agent-row ${
                                        isAgentActive ? 'sidebar__agent-row--active' : ''
                                      }`}
                                      onClick={() => {
                                        setActiveAgent(agent.id);
                                        setActiveView('agents');
                                      }}
                                    >
                                      <AgentAvatar role={agent.role} size={26} glow={isAgentActive} />
                                      <div className="sidebar__agent-info">
                                        <span className="sidebar__agent-name">{agent.name}</span>
                                        <span className="sidebar__agent-role">{agent.role}</span>
                                      </div>
                                      <span className={`sidebar__dot ${statusDot}`} />
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {/* 3. Workflows Node List */}
                          {section.id === 'workflow' && (
                            <div className="sidebar__sub-list">
                              {workflowNodes.length === 0 ? (
                                <div className="sidebar__empty-text">No nodes placed</div>
                              ) : (
                                workflowNodes.map((node) => (
                                  <div
                                    key={node.id}
                                    className="sidebar__sub-item"
                                    onClick={() => setActiveView('workflow')}
                                  >
                                    <Workflow size={12} /> {node.data?.label || 'Node'} ({String(node.data?.type || '')})
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {/* 5. Live Target Viewports */}
                          {section.id === 'preview' && (
                            <div className="sidebar__sub-list">
                              <div className="sidebar__sub-item" onClick={() => setActiveView('preview')}>
                                <Monitor size={12} /> Desktop view target
                              </div>
                              <div className="sidebar__sub-item" onClick={() => setActiveView('preview')}>
                                <Smartphone size={12} /> Mobile view target
                              </div>
                              <div className="sidebar__sub-item" onClick={() => setActiveView('preview')}>
                                <Tablet size={12} /> Tablet view target
                              </div>
                            </div>
                          )}

                          {/* 6. Source Control (Git) */}
                          {section.id === 'git' && (
                            <div className="sidebar__git-section" onClick={() => setActiveView('git')}>
                              <div className="sidebar__git-branch-info">
                                <GitBranch size={13} className="sidebar__git-icon" />
                                <span>Branch: <strong>{gitStatus.branch}</strong></span>
                              </div>
                              <div className="sidebar__git-status-summary">
                                {totalChanges === 0 ? (
                                  <span className="sidebar__git-clean" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Check size={12} /> Clean working tree
                                  </span>
                                ) : (
                                  <span className="sidebar__git-dirty" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <AlertTriangle size={12} /> {totalChanges} files changed
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 7. Memory categories */}
                          {section.id === 'memory' && (
                            <div className="sidebar__sub-list">
                              {memoryCategories.map((cat) => {
                                const isCatActive = activeCategory === cat.value;
                                return (
                                  <div
                                    key={cat.value}
                                    className={`sidebar__category-row ${
                                      isCatActive ? 'sidebar__category-row--active' : ''
                                    }`}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                    onClick={() => {
                                      setActiveCategory(cat.value);
                                      setActiveView('memory');
                                    }}
                                  >
                                    {cat.icon}
                                    <span>{cat.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                           {/* 8. Terminals list */}
                           {section.id === 'terminal' && (
                             <div className="sidebar__sub-list">
                               {terminalSessions.length === 0 ? (
                                 <div className="sidebar__empty-text">No active terminals</div>
                               ) : (
                                 terminalSessions.map((sess) => {
                                   const isSessActive = sess.id === activeSessionId;
                                   return (
                                     <div
                                       key={sess.id}
                                       className={`sidebar__sub-item ${
                                         isSessActive ? 'sidebar__sub-item--active' : ''
                                       }`}
                                       onClick={() => {
                                         setActiveSession(sess.id);
                                         setActiveView('terminal');
                                       }}
                                     >
                                       <Terminal size={12} /> {sess.name} {sess.isDead ? '(Exited)' : ''}
                                     </div>
                                   );
                                 })
                               )}
                             </div>
                           )}

                           {/* 8b. Workspaces — deploy command-driven terminal grids */}
                           {section.id === 'workspaces' && (
                             <div className="sidebar__sub-list">
                               <div
                                 className="sidebar__sub-item"
                                 onClick={() => setActiveView('workspaces')}
                               >
                                 <Boxes size={12} /> Launch workspace grid
                               </div>
                               <div
                                 className="sidebar__sub-item"
                                 onClick={() => setActiveView('workspaces')}
                               >
                                 <Terminal size={12} /> Multi-agent terminals
                               </div>
                               <div
                                 className="sidebar__sub-item"
                                 onClick={() => setActiveView('terminal')}
                               >
                                 <Columns size={12} /> Open terminal view
                               </div>
                             </div>
                           )}

                           {/* 9. Prompts categories */}
                           {section.id === 'prompts' && (
                             <div className="sidebar__sub-list">
                               <div className="sidebar__sub-item" onClick={() => setActiveView('prompts')}>
                                 <FileCode size={12} /> Refactoring templates
                               </div>
                               <div className="sidebar__sub-item" onClick={() => setActiveView('prompts')}>
                                 <Activity size={12} /> Test builder presets
                               </div>
                               <div className="sidebar__sub-item" onClick={() => setActiveView('prompts')}>
                                 <ClipboardList size={12} /> Code review guidelines
                               </div>
                             </div>
                           )}

                           {/* 10. Settings indices */}
                           {section.id === 'settings' && (
                             <div className="sidebar__sub-list">
                               <div className="sidebar__sub-item" onClick={() => { setActiveSection('general'); setSettingsOpen(true); }}>
                                 <Sliders size={12} /> General Config
                               </div>
                               <div className="sidebar__sub-item" onClick={() => { setActiveSection('providers'); setSettingsOpen(true); }}>
                                 <Sparkles size={12} /> AI Providers
                               </div>
                               <div className="sidebar__sub-item" onClick={() => { setActiveSection('secrets'); setSettingsOpen(true); }}>
                                 <KeyRound size={12} /> API Credentials
                               </div>
                                <div className="sidebar__sub-item" onClick={() => { setActiveSection('plugins'); setSettingsOpen(true); }}>
                                  <FileText size={12} /> Plugins & Addons
                                </div>
                                <div className="sidebar__sub-item" onClick={() => { setActiveSection('mcp'); setSettingsOpen(true); }}>
                                  <Network size={12} /> MCP Servers
                                </div>
                               <div className="sidebar__sub-item" onClick={() => { setActiveSection('about'); setSettingsOpen(true); }}>
                                 <Info size={12} /> About AIOS
                               </div>
                             </div>
                           )}
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>

          {/* Bottom utility footer section */}
          <div className="sidebar__footer">
            <button
              className={`sidebar__footer-btn ${activeView === 'notifications' ? 'sidebar__footer-btn--active' : ''}`}
              onClick={() => toggleSection('notifications')}
            >
              <Bell size={15} />
              <span>Notifications</span>
            </button>
            <button
              className={`sidebar__footer-btn ${activeView === 'account' ? 'sidebar__footer-btn--active' : ''}`}
              onClick={() => toggleSection('account')}
            >
              <User size={15} />
              <span>Account</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
