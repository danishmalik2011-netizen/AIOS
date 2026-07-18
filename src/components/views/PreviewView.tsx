import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  Globe,
  ExternalLink,
  Maximize2,
  Minimize2,
  Plus,
  X,
  ArrowLeft,
  ArrowRight,
  Download,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/shared/IconButton';
import { toast } from '@/store/useNotificationStore';
import { useProjectStore } from '@/store/useProjectStore';
import './PreviewView.css';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';
const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

interface PreviewTabState {
  id: string;
  url: string;
  device: DeviceMode;
}

export function PreviewView() {
  const [tabs, setTabs] = useState<PreviewTabState[]>(() => [
    { id: '1', url: '', device: 'desktop' },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const globalUrl = useProjectStore((s) => s.previewUrl);
  const setGlobalUrl = useProjectStore((s) => s.setPreviewUrl);
  const projectRoot = useProjectStore((s) => s.projectRoot);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const url = activeTab.url;
  const device = activeTab.device;

  const setUrl = (newUrl: string) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, url: newUrl } : t)));
    setGlobalUrl(newUrl);
  };

  const setDevice = (newDevice: DeviceMode) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, device: newDevice } : t)));
  };

  // Sync global preview URL updates from agent dev servers
  useEffect(() => {
    if (globalUrl && globalUrl !== activeTab.url) {
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, url: globalUrl } : t)));
    }
  }, [globalUrl]);

  // Sync tab switch back to global URL
  useEffect(() => {
    setGlobalUrl(activeTab.url);
  }, [activeTabId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
    toast.success('Preview refreshed', 'Reloaded iframe content.');
  };

  const handleOpenBrowser = () => {
    if (url) {
      window.open(url, '_blank');
      toast.success('Opening link', `Opened ${url} in your system browser.`);
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRefresh();
    }
  };

  const goBack = () => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch (e) {
      console.warn("Iframe back failed:", e);
    }
  };

  const goForward = () => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch (e) {
      console.warn("Iframe forward failed:", e);
    }
  };

  const handleDownloadProject = async () => {
    if (!projectRoot) {
      toast.error('Download failed', 'No active project folder open.');
      return;
    }
    toast.info('Exporting...', 'Creating ZIP archive of project files...');
    try {
      const savedPath = await (window as any).aios.fs.zipProject(projectRoot);
      if (savedPath) {
        toast.success('Project exported', `Saved to ${savedPath}`);
      }
    } catch (e: any) {
      console.error("Export failed:", e);
      toast.error('Export failed', e.message || 'Could not zip project.');
    }
  };

  const isConnected = Boolean(url.trim());

  return (
    <div className="preview">
      {/* Tab bar header */}
      <div className="preview__tabbar">
        {tabs.map((t, idx) => (
          <div
            key={t.id}
            className={`preview__tab-chip ${t.id === activeTabId ? 'is-active' : ''}`}
            onClick={() => setActiveTabId(t.id)}
          >
            <Globe size={11} style={{ marginRight: '6px' }} />
            <span>
              {t.url
                ? (() => {
                    try {
                      const u = new URL(t.url);
                      return u.host + (u.pathname === '/' ? '' : u.pathname);
                    } catch {
                      return t.url;
                    }
                  })()
                : `Preview ${idx + 1}`}
            </span>
            {tabs.length > 1 && (
              <button
                type="button"
                className="preview__tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  const remaining = tabs.filter((x) => x.id !== t.id);
                  setTabs(remaining);
                  if (activeTabId === t.id) {
                    setActiveTabId(remaining[0].id);
                  }
                }}
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="preview__add-tab"
          onClick={() => {
            const nextId = crypto.randomUUID();
            setTabs((prev) => [
              ...prev,
              { id: nextId, url: '', device: 'desktop' },
            ]);
            setActiveTabId(nextId);
          }}
          title="Open new preview tab"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Toolbar */}
      <header className="preview__toolbar">
        <div className="preview__toolbar-left">
          <IconButton
            icon={<ArrowLeft size={14} />}
            tooltip="Back"
            variant="ghost"
            size="sm"
            disabled={!isConnected}
            onClick={goBack}
          />
          <IconButton
            icon={<ArrowRight size={14} />}
            tooltip="Forward"
            variant="ghost"
            size="sm"
            disabled={!isConnected}
            onClick={goForward}
          />
          <IconButton
            icon={<RefreshCw size={14} />}
            tooltip="Refresh"
            variant="ghost"
            size="sm"
            disabled={!isConnected}
            onClick={handleRefresh}
          />
          <div className="preview__url-bar-container">
            <Globe size={13} className="preview__url-icon" />
            <input
              className="preview__url-input glass-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              placeholder="http://localhost:3000"
              spellCheck={false}
            />
          </div>
          <IconButton
            icon={<ExternalLink size={14} />}
            tooltip="Open in browser"
            variant="ghost"
            size="sm"
            disabled={!isConnected}
            onClick={handleOpenBrowser}
          />
          <IconButton
            icon={<Download size={14} />}
            tooltip="Download project as ZIP"
            variant="ghost"
            size="sm"
            onClick={handleDownloadProject}
          />
        </div>

        <div className="preview__toolbar-right">
          <IconButton
            icon={isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            tooltip={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            variant="ghost"
            size="sm"
            active={isFullscreen}
            onClick={toggleFullscreen}
          />
          <div className="preview__device-picker">
            <IconButton
              icon={<Monitor size={15} />}
              tooltip="Desktop"
              variant="ghost"
              size="sm"
              active={device === 'desktop'}
              onClick={() => setDevice('desktop')}
            />
            <IconButton
              icon={<Tablet size={15} />}
              tooltip="Tablet"
              variant="ghost"
              size="sm"
              active={device === 'tablet'}
              onClick={() => setDevice('tablet')}
            />
            <IconButton
              icon={<Smartphone size={15} />}
              tooltip="Mobile"
              variant="ghost"
              size="sm"
              active={device === 'mobile'}
              onClick={() => setDevice('mobile')}
            />
          </div>
        </div>
      </header>

      {/* Preview Frame */}
      <div className="preview__canvas">
        <div
          className={`preview__frame ${isFullscreen ? 'is-fullscreen' : ''}`}
          style={{ maxWidth: DEVICE_WIDTHS[device] }}
          ref={frameRef}
        >
          {isFullscreen && (
            <div className="canvas-panel__fullscreen-controls">
              {(['desktop', 'tablet', 'mobile'] as DeviceMode[]).map((d) => {
                const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`canvas-panel__icon-btn ${device === d ? 'is-active' : ''}`}
                    onClick={() => setDevice(d)}
                    title={d}
                  >
                    <Icon size={12} />
                  </button>
                );
              })}
              <div className="fullscreen-divider" />
              <button
                type="button"
                className="canvas-panel__icon-btn text-accent"
                onClick={toggleFullscreen}
                title="Exit fullscreen"
              >
                <Minimize2 size={12} />
              </button>
            </div>
          )}

          {isConnected ? (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              className="preview__iframe"
              src={url}
              title="Live Preview"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          ) : (
            <div className="preview__placeholder">
              <div className="preview__placeholder-glow" />
              <div className="preview__placeholder-icon">
                <Monitor size={48} strokeWidth={1.5} />
              </div>
              <h3 className="preview__placeholder-title">Live Preview</h3>
              <p className="preview__placeholder-text">
                Connect a running dev server to preview your project in real-time.
                AIOS will auto-detect frameworks and start the server for you.
              </p>
              <div className="preview__placeholder-steps">
                <div className="preview__step">
                  <span className="preview__step-num">1</span>
                  <span>Open a project folder</span>
                </div>
                <div className="preview__step">
                  <span className="preview__step-num">2</span>
                  <span>Run the dev server in Terminal</span>
                </div>
                <div className="preview__step">
                  <span className="preview__step-num">3</span>
                  <span>Preview appears here automatically</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
