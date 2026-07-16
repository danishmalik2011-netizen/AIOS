import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, Bot, Workflow, Folder, GitBranch, Brain,
  Terminal, BookOpen, Settings, PanelLeft, Plus, Sparkles, Search, Boxes,
} from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTerminalStore } from '@/store/useTerminalStore';
import { toast } from '@/store/useNotificationStore';
import type { Command, SidebarView } from '@/core/types';
import './CommandPalette.css';

interface CommandDef extends Command {
  keywords?: string;
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  // subsequence match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 20 : -1;
}

export function CommandPalette() {
  const open = useSettingsStore((s) => s.commandPaletteOpen);
  const setOpen = useSettingsStore((s) => s.setCommandPaletteOpen);
  const setActiveView = useSettingsStore((s) => s.setActiveView);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const addSession = useTerminalStore((s) => s.addSession);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<CommandDef[]>(() => {
    const nav = (id: SidebarView, label: string, icon: string, shortcut?: string) => ({
      id: `nav-${id}`,
      label,
      category: 'Navigation',
      icon,
      shortcut,
      action: () => {
        if (id === 'settings') {
          setSettingsOpen(true);
        } else {
          setActiveView(id);
        }
      },
    });
    return [
      nav('dashboard', 'Go to Dashboard', 'dashboard', 'Ctrl+Shift+D'),
      nav('agents', 'Go to Agents', 'agents', 'Ctrl+Shift+A'),
      nav('workflow', 'Go to Workflows', 'workflow', 'Ctrl+Shift+F'),
      nav('files', 'Go to Files', 'files', 'Ctrl+Shift+E'),
      nav('git', 'Go to Git', 'git', 'Ctrl+Shift+G'),
      nav('memory', 'Go to Memory', 'memory', 'Ctrl+Shift+M'),
      nav('terminal', 'Go to Terminal', 'terminal', 'Ctrl+Shift+T'),
      nav('prompts', 'Go to Prompts', 'prompts', 'Ctrl+Shift+S'),
      nav('workspaces', 'Go to Workspaces', 'workspaces', 'Ctrl+Shift+W'),
      nav('settings', 'Go to Settings', 'settings', 'Ctrl+,'),
      {
        id: 'toggle-sidebar', label: 'Toggle Sidebar', category: 'View', icon: 'panel',
        shortcut: 'Ctrl+B', action: () => toggleSidebar(),
      },
      {
        id: 'new-terminal', label: 'New Terminal Session', category: 'Terminal', icon: 'plus',
        shortcut: 'Ctrl+T', action: () => { addSession(); setActiveView('terminal'); toast.success('Terminal created'); },
      },
      {
        id: 'run-workflow', label: 'Run Active Workflow', category: 'Agents', icon: 'sparkles',
        action: () => { setActiveView('workflow'); toast.info('Workflow started', 'Orchestrating agents…'); },
      },
    ];
  }, [setActiveView, toggleSidebar, addSession, setSettingsOpen]);

  const filtered = useMemo(() => {
    return commands
      .map((c) => ({ c, score: fuzzyScore(query, `${c.label} ${c.category} ${c.keywords ?? ''}`) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      const id = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) { cmd.action(); setOpen(false); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, selected, setOpen]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const iconFor = (name?: string) => {
    const size = 16;
    switch (name) {
      case 'dashboard': return <LayoutDashboard size={size} />;
      case 'agents': return <Bot size={size} />;
      case 'workflow': return <Workflow size={size} />;
      case 'files': return <Folder size={size} />;
      case 'git': return <GitBranch size={size} />;
      case 'memory': return <Brain size={size} />;
      case 'terminal': return <Terminal size={size} />;
      case 'prompts': return <BookOpen size={size} />;
      case 'settings': return <Settings size={size} />;
      case 'panel': return <PanelLeft size={size} />;
      case 'plus': return <Plus size={size} />;
      case 'sparkles': return <Sparkles size={size} />;
      case 'workspaces': return <Boxes size={size} />;
      default: return <Sparkles size={size} />;
    }
  };

  return (
    <div className="cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div
        className="cmdk glass-heavy animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="cmdk__search">
          <Search size={18} className="cmdk__search-icon" />
          <input
            ref={inputRef}
            className="cmdk__input"
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="cmdk__kbd">ESC</kbd>
        </div>

        <div className="cmdk__list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="cmdk__empty">No matching commands</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              data-index={i}
              className={`cmdk__item ${i === selected ? 'cmdk__item--active' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => { cmd.action(); setOpen(false); }}
            >
              <span className="cmdk__item-icon">{iconFor(cmd.icon)}</span>
              <span className="cmdk__item-label">{cmd.label}</span>
              <span className="cmdk__item-category">{cmd.category}</span>
              {cmd.shortcut && <kbd className="cmdk__kbd cmdk__kbd--sm">{cmd.shortcut}</kbd>}
            </button>
          ))}
        </div>

        <div className="cmdk__footer">
          <span><kbd className="cmdk__kbd cmdk__kbd--sm">↑↓</kbd> navigate</span>
          <span><kbd className="cmdk__kbd cmdk__kbd--sm">↵</kbd> select</span>
          <span><kbd className="cmdk__kbd cmdk__kbd--sm">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
