import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import {
  PanelRightClose,
  PanelRightOpen,
  Code2,
  Eye,
  ListChecks,
  FileText,
  RefreshCw,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  Minimize2,
  Check,
  Circle,
  Loader2,
} from 'lucide-react';
import { useFollowPanelStore, type PanelTab, type PlanStepStatus } from '@/store/useFollowPanelStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { toast } from '@/store/useNotificationStore';
import './AgentFollowPanel.css';

type DeviceMode = 'desktop' | 'laptop' | 'tablet' | 'mobile';
const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: '100%',
  laptop: '1280px',
  tablet: '768px',
  mobile: '375px',
};

/** True when the app is in a light theme, so Monaco + UI can adapt. */
function useIsLightTheme(): boolean {
  const theme = useSettingsStore((s) => s.settings.theme);
  return theme === 'light';
}

function toMonacoLanguage(name: string): string {
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
  return map[ext] ?? 'plaintext';
}

export function AgentFollowPanel() {
  const collapsed = useFollowPanelStore((s) => s.collapsed);
  const toggleCollapsed = useFollowPanelStore((s) => s.toggleCollapsed);
  const width = useFollowPanelStore((s) => s.width);
  const setWidth = useFollowPanelStore((s) => s.setWidth);

  // Drag the left edge to resize the canvas horizontally.
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => setWidth(window.innerWidth - ev.clientX);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (collapsed) {
    return (
      <aside className="canvas-panel canvas-panel--collapsed" aria-label="Agent Canvas (collapsed)">
        <button
          type="button"
          className="canvas-panel__expand"
          title="Expand Agent Canvas"
          onClick={toggleCollapsed}
        >
          <PanelRightOpen size={16} />
          <span className="canvas-panel__expand-label">Canvas</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="canvas-panel" aria-label="Agent Canvas" style={{ width }}>
      <div
        className="canvas-panel__resizer"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onMouseDown={startResize}
      />
      <header className="canvas-panel__header">
        <span className="canvas-panel__title">Agent Canvas</span>
        <button
          type="button"
          className="canvas-panel__collapse"
          title="Collapse Agent Canvas"
          onClick={toggleCollapsed}
        >
          <PanelRightClose size={15} />
        </button>
      </header>
      <CanvasTabs />
    </aside>
  );
}

function CanvasTabs() {
  const activeTab = useFollowPanelStore((s) => s.activeTab);
  const setActiveTab = useFollowPanelStore((s) => s.setActiveTab);
  const plan = useFollowPanelStore((s) => s.plan);
  const artifacts = useFollowPanelStore((s) => s.artifacts);

  const planDone = plan ? plan.steps.filter((s) => s.status === 'done').length : 0;
  const planTotal = plan ? plan.steps.length : 0;

  const tabs: { id: PanelTab; label: string; icon: typeof Code2; badge?: string }[] = [
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'plan', label: 'Plan', icon: ListChecks, badge: planTotal ? `${planDone}/${planTotal}` : undefined },
    { id: 'artifacts', label: 'Artifacts', icon: FileText, badge: artifacts.length ? String(artifacts.length) : undefined },
  ];

  return (
    <>
      <nav className="canvas-panel__tabs" role="tablist">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`canvas-panel__tab ${activeTab === t.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon size={14} />
              <span>{t.label}</span>
              {t.badge && <span className="canvas-panel__tab-badge">{t.badge}</span>}
            </button>
          );
        })}
      </nav>
      <div className="canvas-panel__body">
        {activeTab === 'code' && <CodeTab />}
        {activeTab === 'preview' && <PreviewTab />}
        {activeTab === 'plan' && <PlanTab />}
        {activeTab === 'artifacts' && <ArtifactsTab />}
      </div>
    </>
  );
}

function CodeTab() {
  const followedFile = useFollowPanelStore((s) => s.followedFile);
  const isLight = useIsLightTheme();
  const [revealed, setRevealed] = useState<string | null>(null);
  const fullRef = useRef('');

  useEffect(() => {
    if (!followedFile) return;
    fullRef.current = followedFile.content;
    // A short "live typing" reveal of the modified side right after a write,
    // so the edit reads like the agent typed it in. Skipped when there's no
    // prior version (e.g. re-opening the same file).
    if (followedFile.original !== undefined) {
      setRevealed('');
      const total = followedFile.content.length;
      const step = Math.max(24, Math.ceil(total / 60));
      let i = 0;
      const id = setInterval(() => {
        i += step;
        if (i >= total) {
          setRevealed(fullRef.current);
          clearInterval(id);
        } else {
          setRevealed(fullRef.current.slice(0, i));
        }
      }, 24);
      return () => clearInterval(id);
    }
    setRevealed(followedFile.content);
  }, [followedFile]);

  if (!followedFile) {
    return <EmptyHint icon={Code2} title="No file followed yet" text="Enable Follow Agent and let the assistant edit a file — it appears here live." />;
  }

  const modified = revealed ?? followedFile.content;
  const lang = toMonacoLanguage(followedFile.name);
  const isDiff = followedFile.original !== undefined;

  return (
    <div className="canvas-panel__code">
      <div className="canvas-panel__code-path">
        <Code2 size={13} /> {followedFile.path}
        {isDiff && <span className="canvas-panel__diff-badge">diff</span>}
      </div>
      <div className="canvas-panel__monaco">
        {isDiff ? (
          <DiffEditor
            theme={isLight ? 'light' : 'vs-dark'}
            language={lang}
            original={followedFile.original ?? ''}
            modified={modified}
            options={{
              readOnly: true,
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              renderSideBySide: false,
              diffWordWrap: 'on',
            }}
          />
        ) : (
          <Editor
            theme={isLight ? 'light' : 'vs-dark'}
            path={`canvas:${followedFile.id}`}
            language={lang}
            value={followedFile.content}
            options={{
              readOnly: true,
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
            }}
          />
        )}
      </div>
    </div>
  );
}

function PreviewTab() {
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const url = useProjectStore((s) => s.previewUrl);
  const setUrl = useProjectStore((s) => s.setPreviewUrl);
  const isConnected = Boolean(url.trim());

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  };

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
    toast.success('Preview refreshed', 'Reloaded live preview.');
  };
  const handleOpenBrowser = () => {
    if (url) {
      window.open(url, '_blank');
      toast.success('Opening link', `Opened ${url} in your system browser.`);
    }
  };

  return (
    <div className="canvas-panel__preview">
      <div className="canvas-panel__preview-toolbar">
        <div className="canvas-panel__preview-url">
          <input
            className="canvas-panel__url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
          <button type="button" className="canvas-panel__icon-btn" disabled={!isConnected} onClick={handleRefresh} title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button type="button" className="canvas-panel__icon-btn" disabled={!isConnected} onClick={handleOpenBrowser} title="Open in browser">
            <ExternalLink size={13} />
          </button>
        </div>
        <div className="canvas-panel__device-picker">
          <button
            type="button"
            className={`canvas-panel__icon-btn ${isFullscreen ? 'is-active' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          {(['desktop', 'laptop', 'tablet', 'mobile'] as DeviceMode[]).map((d) => {
            const Icon = d === 'desktop' ? Monitor : d === 'laptop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
            return (
              <button
                key={d}
                type="button"
                className={`canvas-panel__icon-btn ${device === d ? 'is-active' : ''}`}
                onClick={() => setDevice(d)}
                title={d}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="canvas-panel__preview-canvas">
        <div className="canvas-panel__frame" style={{ maxWidth: DEVICE_WIDTHS[device] }} ref={frameRef}>
          {isConnected ? (
            <iframe
              key={iframeKey}
              className="canvas-panel__iframe"
              src={url}
              title="Live Preview"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          ) : (
            <EmptyHint
              icon={Eye}
              title="Live Preview"
              text="When the assistant starts a dev server (e.g. npm run dev), it appears here automatically."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PlanTab() {
  const plan = useFollowPanelStore((s) => s.plan);
  const setStepStatus = useFollowPanelStore((s) => s.setStepStatus);
  if (!plan) {
    return <EmptyHint icon={ListChecks} title="No plan yet" text="The assistant lays out an implementation plan here as it works." />;
  }
  return (
    <div className="canvas-panel__plan">
      <h4 className="canvas-panel__plan-title">{plan.title}</h4>
      <ul className="canvas-panel__steps">
        {plan.steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              className={`canvas-panel__step canvas-panel__step--${step.status}`}
              onClick={() => setStepStatus(step.id, nextStatus(step.status))}
              title="Click to cycle status"
            >
              <StepIcon status={step.status} />
              <span>{step.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepIcon({ status }: { status: PlanStepStatus }) {
  if (status === 'done') return <Check size={14} className="canvas-panel__step-check" />;
  if (status === 'active') return <Loader2 size={14} className="canvas-panel__step-active" />;
  return <Circle size={14} className="canvas-panel__step-pending" />;
}

function nextStatus(s: PlanStepStatus): PlanStepStatus {
  return s === 'pending' ? 'active' : s === 'active' ? 'done' : 'pending';
}

function ArtifactsTab() {
  const artifacts = useFollowPanelStore((s) => s.artifacts);
  const isLight = useIsLightTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => artifacts.find((a) => a.id === selectedId) ?? artifacts[artifacts.length - 1] ?? null,
    [artifacts, selectedId],
  );
  if (artifacts.length === 0) {
    return <EmptyHint icon={FileText} title="No artifacts yet" text="Deliverables (specs, docs, diagrams, code) the assistant creates show up here." />;
  }
  return (
    <div className="canvas-panel__artifacts">
      <div className="canvas-panel__artifact-list">
        {artifacts.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`canvas-panel__artifact-item ${selected?.id === a.id ? 'is-active' : ''}`}
            onClick={() => setSelectedId(a.id)}
          >
            <FileText size={13} />
            <span className="canvas-panel__artifact-name">{a.title}</span>
            <span className="canvas-panel__artifact-type">{a.type}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="canvas-panel__artifact-body">
          {selected.type === 'code' ? (
            <Editor
              theme={isLight ? 'light' : 'vs-dark'}
              path={`artifact:${selected.id}`}
              language="plaintext"
              value={selected.content}
              options={{ readOnly: true, fontSize: 12, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on' }}
            />
          ) : (
            <pre className="canvas-panel__artifact-pre">{selected.content}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ icon: Icon, title, text }: { icon: typeof Code2; title: string; text: string }) {
  return (
    <div className="canvas-panel__empty">
      <Icon size={30} strokeWidth={1.5} />
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  );
}
