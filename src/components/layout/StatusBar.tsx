import { useState, useEffect } from 'react';
import { GitBranch, Bot, Bell, Clock } from 'lucide-react';
import { useGitStore } from '@/store/useGitStore';
import { useAgentStore } from '@/store/useAgentStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import './StatusBar.css';

export function StatusBar() {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  const isRealRepo = useGitStore((s) => s.isRealRepo);
  const gitStatus = useGitStore((s) => s.status);

  const agents = useAgentStore((s) => s.agents);
  const runningAgents = agents.filter((a) => a.status === 'running');
  const activeRunningAgent = agents.find((a) => a.status === 'running' && a.currentTask);

  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleCommandPalette = useSettingsStore((s) => s.toggleCommandPalette);
  const setActiveView = useSettingsStore((s) => s.setActiveView);

  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <footer className="status-bar">
      {/* Left section: Git and Shortcuts */}
      <div className="status-bar__left">
        {isRealRepo && (
          <span className="status-bar__item" style={{ cursor: 'pointer' }} onClick={() => setActiveView('git')}>
            <GitBranch size={12} />
            <span>{gitStatus.branch}</span>
            {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
              <span className="status-bar__sync" style={{ marginLeft: 6 }}>
                ↑{gitStatus.ahead} ↓{gitStatus.behind}
              </span>
            )}
          </span>
        )}

        {/* Shortcuts */}
        <button
          type="button"
          className="status-bar__kbd-btn"
          onClick={toggleSidebar}
          title="Toggle Sidebar"
        >
          <kbd className="status-bar__kbd">{mod}+B</kbd>
          <span>Sidebar</span>
        </button>

        <button
          type="button"
          className="status-bar__kbd-btn"
          onClick={toggleCommandPalette}
          title="Command Palette"
        >
          <kbd className="status-bar__kbd">{mod}+⇧+P</kbd>
          <span>Commands</span>
        </button>

        <button
          type="button"
          className="status-bar__kbd-btn"
          onClick={() => setActiveView('terminal')}
          title="Toggle Terminal"
        >
          <kbd className="status-bar__kbd">{mod}+`</kbd>
          <span>Terminal</span>
        </button>
      </div>

      {/* Center section: Active running Agent task ticker */}
      <div className="status-bar__center">
        {activeRunningAgent && (
          <span className="status-bar__ticker">
            <Bot size={12} />
            <span>{activeRunningAgent.name} — {activeRunningAgent.currentTask}</span>
          </span>
        )}
      </div>

      {/* Right section: System clock and running agents count */}
      <div className="status-bar__right">
        {runningAgents.length > 0 && (
          <span className="status-bar__item" style={{ cursor: 'pointer' }} onClick={() => setActiveView('agents')}>
            <span className="status-bar__agent-dot status-bar__agent-dot--pulse" />
            {runningAgents.length} {runningAgents.length === 1 ? 'agent' : 'agents'} running
          </span>
        )}

        <span className="status-bar__item" style={{ cursor: 'pointer' }} onClick={() => setActiveView('notifications')}>
          <Bell size={12} />
        </span>
        <span className="status-bar__item">
          <Clock size={12} />
          <span>{time}</span>
        </span>
      </div>
    </footer>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
