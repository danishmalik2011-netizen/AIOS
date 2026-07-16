import { Monitor, Smartphone, Tablet, RefreshCw, Globe, ExternalLink } from 'lucide-react';
import { useState } from 'react';
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

export function PreviewView() {
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const url = useProjectStore((s) => s.previewUrl);
  const setUrl = useProjectStore((s) => s.setPreviewUrl);
  const [iframeKey, setIframeKey] = useState(0);

  const isConnected = Boolean(url.trim());

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

  return (
    <div className="preview">
      {/* Toolbar */}
      <header className="preview__toolbar">
        <div className="preview__toolbar-left">
          <Globe size={16} className="preview__url-icon" />
          <input
            className="preview__url-input glass-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
          <IconButton
            icon={<RefreshCw size={14} />}
            tooltip="Refresh"
            variant="ghost"
            size="sm"
            disabled={!isConnected}
            onClick={handleRefresh}
          />
          <IconButton
            icon={<ExternalLink size={14} />}
            tooltip="Open in browser"
            variant="ghost"
            size="sm"
            disabled={!isConnected}
            onClick={handleOpenBrowser}
          />
        </div>

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
      </header>

      {/* Preview Frame */}
      <div className="preview__canvas">
        <div
          className="preview__frame"
          style={{ maxWidth: DEVICE_WIDTHS[device] }}
        >
          {isConnected ? (
            <iframe
              key={iframeKey}
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
