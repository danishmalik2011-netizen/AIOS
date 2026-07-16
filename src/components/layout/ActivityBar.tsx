import { useState } from 'react';
import {
  LayoutDashboard,
  Bot,
  GitBranch,
  Folder,
  Monitor,
  Workflow,
  Brain,
  Terminal,
  BookOpen,
  Settings,
  Bell,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Boxes,
} from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { SidebarView } from '@/core/types';
import { Tooltip } from '@/components/shared/Tooltip';
import { AiosLogo } from '@/components/shared/AiosLogo';
import './ActivityBar.css';

interface NavItem {
  id: SidebarView;
  icon: typeof LayoutDashboard;
  label: string;
}

const topItems: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'agents',    icon: Bot,             label: 'Agents' },
  { id: 'workflow',  icon: Workflow,         label: 'Workflows' },
  { id: 'files',     icon: Folder,           label: 'Files' },
  { id: 'preview',   icon: Monitor,          label: 'Preview' },
  { id: 'git',       icon: GitBranch,        label: 'Git' },
  { id: 'memory',    icon: Brain,            label: 'Memory' },
  { id: 'terminal',  icon: Terminal,         label: 'Terminal' },
  { id: 'workspaces',icon: Boxes,            label: 'Workspaces' },
  { id: 'prompts',   icon: BookOpen,         label: 'Prompts' },
  { id: 'settings',  icon: Settings,         label: 'Settings' },
];

export function ActivityBar() {
  const activeView = useSettingsStore((s) => s.activeView);
  const setActiveView = useSettingsStore((s) => s.setActiveView);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <nav className="activity-bar">
      {/* Brand logo + collapse toggle combined */}
      <button
        type="button"
        className="activity-bar__logo-toggle"
        onClick={toggleSidebar}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={sidebarVisible ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-label={sidebarVisible ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <div className="activity-bar__logo-toggle-inner">
          <div className={`activity-bar__logo-face ${isHovered ? 'activity-bar__logo-face--visible' : ''}`}>
            <AiosLogo size={32} className="activity-bar__logo-img" />
          </div>

          {/* Toggle icon face */}
          <div className={`activity-bar__toggle-face ${!isHovered ? 'activity-bar__toggle-face--visible' : ''}`}>
            {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </div>
        </div>
      </button>

      {/* ---- Top nav icons ---- */}
      <div className="activity-bar__top">
        {topItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <Tooltip key={item.id} content={item.label} side="right" delay={250} disabled={sidebarVisible}>
              <button
                className={`activity-bar__button ${isActive ? 'activity-bar__button--active' : ''}`}
                onClick={() => setActiveView(item.id)}
                aria-label={item.label}
              >
                <Icon size={20} />
                {item.id === 'agents' && (
                  <span className="activity-bar__badge" />
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* ---- Bottom utility icons ---- */}
      <div className="activity-bar__bottom">
        <Tooltip content="Notifications" side="right" delay={250} disabled={sidebarVisible}>
          <button
            className={`activity-bar__button ${activeView === 'notifications' ? 'activity-bar__button--active' : ''}`}
            aria-label="Notifications"
            onClick={() => setActiveView('notifications')}
          >
            <Bell size={18} />
          </button>
        </Tooltip>
        <Tooltip content="Account" side="right" delay={250} disabled={sidebarVisible}>
          <button
            className={`activity-bar__button ${activeView === 'account' ? 'activity-bar__button--active' : ''}`}
            aria-label="Account"
            onClick={() => setActiveView('account')}
          >
            <User size={18} />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
