import { useState } from 'react';
import {
  Boxes,
  Terminal,
  Rocket,
  Play,
  Plus,
  Minus,
  CornerDownLeft,
  Sparkles,
  Layers,
  LayoutGrid,
  Columns,
} from 'lucide-react';
import { useTerminalStore } from '@/store/useTerminalStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Input } from '@/components/shared/Input';
import { toast } from '@/store/useNotificationStore';
import './WorkspacesView.css';

interface Preset {
  id: string;
  label: string;
  command: string;
  hint: string;
}

const PRESETS: Preset[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude', hint: 'Anthropic agentic CLI' },
  { id: 'kilo', label: 'Kilo', command: 'kilo', hint: 'Kilo Code assistant' },
  { id: 'codex', label: 'Codex', command: 'codex', hint: 'OpenAI Codex CLI' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', hint: 'Open-source coding agent' },
  { id: 'antigravity', label: 'Antigravity', command: 'agy', hint: 'Antigravity Agentic Developer CLI' },
  { id: 'aider', label: 'Aider', command: 'aider', hint: 'Pair-programming in your terminal' },
  { id: 'cursor', label: 'Cursor', command: 'cursor', hint: 'Cursor agent CLI' },
];

export function WorkspacesView() {
  const deployWorkspace = useTerminalStore((s) => s.deployWorkspace);
  const setActiveView = useSettingsStore((s) => s.setActiveView);

  const [command, setCommand] = useState('');
  const [count, setCount] = useState(4);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [layout, setLayout] = useState<'tabs' | 'grid'>('tabs');

  const clampCount = (n: number) => Math.max(1, Math.min(12, Math.floor(n) || 1));

  const selectPreset = (preset: Preset) => {
    setCommand(preset.command);
    setActivePreset(preset.id);
  };

  const handleDeploy = () => {
    const cmd = command.trim();
    if (!cmd) {
      toast.error('Command required', 'Enter a CLI command to deploy your workspaces.');
      return;
    }
    const ids = deployWorkspace(cmd, count, layout);
    toast.success(
      'Workspaces deployed',
      `${ids.length} terminal${ids.length === 1 ? '' : 's'} launched with "${cmd}" (${layout === 'grid' ? 'grid layout' : 'separate tabs'}).`,
    );
    setActiveView('terminal');
  };

  return (
    <div className="workspaces animate-fade-in">
      <div className="workspaces__hero">
        <div className="workspaces__badge glass">
          <Boxes size={14} /> Workspaces
        </div>
        <h1 className="workspaces__title">Spin up a grid of agent terminals</h1>
        <p className="workspaces__subtitle">
          Type any CLI — <strong>Claude Code</strong>, <strong>Kilo</strong>, <strong>OpenCode</strong>,
          <strong> Codex</strong>, <strong>Antigravity</strong> and more — pick how many you want, and
          AIOS launches each one in its own isolated terminal.
        </p>
      </div>

      <div className="workspaces__card glass-panel">
        <div className="workspaces__field">
          <label className="workspaces__label" htmlFor="ws-command">
            <Terminal size={14} /> Command
          </label>
          <Input
            id="ws-command"
            icon={<CornerDownLeft size={13} />}
            placeholder="e.g. claude, kilo, opencode, codex …"
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              setActivePreset(null);
            }}
            aria-label="Workspace command"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDeploy();
            }}
          />
        </div>

        <div className="workspaces__field">
          <label className="workspaces__label">
            <Layers size={14} /> Number of terminals
          </label>
          <div className="workspaces__stepper">
            <button
              type="button"
              className="workspaces__stepper-btn"
              aria-label="Decrease count"
              onClick={() => setCount((c) => clampCount(c - 1))}
            >
              <Minus size={15} />
            </button>
            <input
              className="workspaces__stepper-input"
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(clampCount(Number(e.target.value)))}
              aria-label="Terminal count"
            />
            <button
              type="button"
              className="workspaces__stepper-btn"
              aria-label="Increase count"
              onClick={() => setCount((c) => clampCount(c + 1))}
            >
              <Plus size={15} />
            </button>
            <span className="workspaces__stepper-hint">{count === 1 ? 'terminal' : 'terminals'}</span>
          </div>
        </div>

        <div className="workspaces__field">
          <label className="workspaces__label">
            <LayoutGrid size={14} /> Layout
          </label>
          <div className="workspaces__layout-toggle" role="group" aria-label="Terminal layout">
            <button
              type="button"
              className={`workspaces__layout-btn ${layout === 'tabs' ? 'workspaces__layout-btn--active' : ''}`}
              onClick={() => setLayout('tabs')}
              aria-pressed={layout === 'tabs'}
            >
              <Columns size={16} /> Tabs
            </button>
            <button
              type="button"
              className={`workspaces__layout-btn ${layout === 'grid' ? 'workspaces__layout-btn--active' : ''}`}
              onClick={() => setLayout('grid')}
              aria-pressed={layout === 'grid'}
            >
              <LayoutGrid size={16} /> Grid
            </button>
          </div>
        </div>

        <div className="workspaces__presets">
          <span className="workspaces__presets-label">
            <Sparkles size={12} /> Quick presets
          </span>
          <div className="workspaces__presets-row">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`workspaces__preset ${activePreset === preset.id ? 'workspaces__preset--active' : ''}`}
                onClick={() => selectPreset(preset)}
                title={preset.hint}
              >
                <span className="workspaces__preset-name">{preset.label}</span>
                <span className="workspaces__preset-cmd">{preset.command}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="workspaces__actions">
          <button type="button" className="workspaces__deploy" onClick={handleDeploy} disabled={!command.trim()}>
            <Play size={16} /> Deploy {count} {count === 1 ? 'workspace' : 'workspaces'}
          </button>
          <span className="workspaces__actions-note">
            <Rocket size={13} /> Each runs independently — split, maximize, or close any pane.
          </span>
        </div>
      </div>
    </div>
  );
}