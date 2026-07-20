import { useState, type ReactNode, useId } from 'react';
import {
  Settings,
  Palette,
  Cpu,
  KeyRound,
  Puzzle,
  Info,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Check,
  Copy,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
  Bot,
  GitBranch,
  Database,
  Boxes,
  ArrowDownCircle,
  Globe,
  RefreshCw,
  Network,
  Server,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { IconButton } from '@/components/shared/IconButton';
import { Input } from '@/components/shared/Input';
import { Badge } from '@/components/shared/Badge';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/store/useNotificationStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import {
  usePermissionsStore,
  TOOL_IDS,
  TOOL_LABELS,
  type ToolPermission,
} from '@/store/usePermissionsStore';
import { AiosLogo } from '@/components/shared/AiosLogo';
import { useMCPStore, connectServer, disconnectServer } from '@/services/mcp/registry';
import { ProviderIcon } from '@/components/shared/ProviderIcon';
import { getApiKey, setApiKey, clearApiKey } from '@/services/providers/keyVault';
import { listProviderModels } from '@/services/providers/registry';
import type { AIProvider } from '@/core/types';
import pkg from '../../../package.json';
import { Wordmark } from '@/components/shared/Wordmark';
import './SettingsView.css';

/* ============================================================
   Reusable: accessible Toggle switch
   ============================================================ */
interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`settings-toggle ${checked ? 'settings-toggle--on' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="settings-toggle__track" aria-hidden="true">
        <span className="settings-toggle__thumb" />
      </span>
    </button>
  );
}

/* ============================================================
   Reusable: Row (label + description + control)
   ============================================================ */
interface RowProps {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}

function Row({ label, description, htmlFor, children }: RowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row__info">
        <label className="settings-row__label" htmlFor={htmlFor}>
          {label}
        </label>
        {description && <p className="settings-row__desc">{description}</p>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

/* ============================================================
   Section scaffold
   ============================================================ */
interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  description: string;
}

function SectionHeader({ icon, title, description }: SectionHeaderProps) {
  return (
    <header className="settings-section__header">
      <span className="settings-section__icon">{icon}</span>
      <div>
        <h2 className="settings-section__title">{title}</h2>
        <p className="settings-section__desc">{description}</p>
      </div>
    </header>
  );
}

/* ============================================================
   Navigation model
   ============================================================ */
interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general', label: 'General', icon: <Palette size={16} /> },
  { id: 'providers', label: 'AI Providers', icon: <Cpu size={16} /> },
  { id: 'secrets', label: 'Secrets', icon: <KeyRound size={16} /> },
  { id: 'plugins', label: 'Plugins', icon: <Puzzle size={16} /> },
  { id: 'mcp', label: 'MCP Servers', icon: <Network size={16} /> },
  { id: 'releases', label: 'Release Notes', icon: <ScrollText size={16} /> },
  { id: 'permissions', label: 'Tool Permissions', icon: <ShieldCheck size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

const FONT_FAMILIES = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'SF Mono',
  'Consolas',
  'Inter',
];

const THEMES = [
  { id: 'dark-slate', name: 'Slate Dark', colors: ['#111625', '#38bdf8', '#cbd5e1'] },
  { id: 'light', name: 'Clean Light', colors: ['#ffffff', '#2563eb', '#1e2030'] },
  { id: 'claude', name: 'Claude Warm', colors: ['#fbfaf7', '#cc6b49', '#191919'] },
  { id: 'claude-dark', name: 'Claude Dark', colors: ['#181816', '#e06e43', '#f5ede3'] },
  { id: 'nord', name: 'Nordic Frost', colors: ['#2e3440', '#88c0d0', '#d8dee9'] },
  { id: 'solarized-dark', name: 'Solarized Dark', colors: ['#002b36', '#b58900', '#93a1a1'] },
  { id: 'monokai', name: 'Monokai Warm', colors: ['#272822', '#f92672', '#f8f8f2'] },
] as const;

/* ============================================================
   1. General
   ============================================================ */
function GeneralSection() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const fontSizeId = useId();
  const fontFamilyId = useId();
  const tabSizeId = useId();

  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<Palette size={18} />}
        title="General"
        description="Editor appearance and behavior preferences."
      />

      <div className="settings-group">
        <h3 className="settings-group__title">Appearance</h3>

        <Row
          label="Theme"
          description="Select a premium design palette to style your workspace."
        >
          <div className="theme-grid" role="group" aria-label="Theme selection">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-card ${
                  settings.theme === t.id ? 'theme-card--active' : ''
                }`}
                aria-pressed={settings.theme === t.id}
                onClick={() => {
                  updateSettings({ theme: t.id });
                  toast.success('Theme changed', `Switched to ${t.name}.`);
                }}
              >
                <div className="theme-card__swatches">
                  <span style={{ background: t.colors[0] }} className="theme-card__swatch" />
                  <span style={{ background: t.colors[1] }} className="theme-card__swatch" />
                  <span style={{ background: t.colors[2] }} className="theme-card__swatch" />
                </div>
                <span className="theme-card__name">{t.name}</span>
              </button>
            ))}
          </div>
        </Row>

        <div className="workspace-3d-container">
          <h4 className="workspace-3d-title">3D Workspace Preview</h4>
          <div className="workspace-3d__scene">
            <div className="workspace-3d__canvas">
              {/* Sidebar Layer */}
              <div className="workspace-3d__layer workspace-3d__layer--sidebar">
                <div className="workspace-3d__layer-content">
                  <div className="preview-nav-item" />
                  <div className="preview-nav-item" />
                  <div className="preview-nav-item" />
                </div>
              </div>
              {/* Editor Layer */}
              <div className="workspace-3d__layer workspace-3d__layer--editor">
                <div className="workspace-3d__layer-content">
                  <div className="preview-editor-header">
                    <div className="preview-tab" />
                    <div className="preview-tab" />
                  </div>
                  <div className="preview-editor-line" style={{ width: '60%' }} />
                  <div className="preview-editor-line" style={{ width: '80%' }} />
                  <div className="preview-editor-line" style={{ width: '40%' }} />
                </div>
              </div>
              {/* Terminal Layer */}
              <div className="workspace-3d__layer workspace-3d__layer--terminal">
                <div className="workspace-3d__layer-content">
                  <div className="preview-terminal-prompt">&gt;_ npm run dev</div>
                  <div className="preview-terminal-output">Ready in 240ms</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Row
          label="Font family"
          description="Typeface used across the editor surfaces."
          htmlFor={fontFamilyId}
        >
          <select
            id={fontFamilyId}
            className="settings-select glass-input"
            value={settings.fontFamily}
            onChange={(e) => updateSettings({ fontFamily: e.target.value })}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Row>

        <Row
          label="Font size"
          description="Editor font size in pixels."
          htmlFor={fontSizeId}
        >
          <div className="settings-slider">
            <input
              id={fontSizeId}
              type="range"
              min={10}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
              className="settings-slider__range"
            />
            <span className="settings-slider__value">{settings.fontSize}px</span>
          </div>
        </Row>
      </div>

      <hr className="glass-divider settings-divider" />

      <div className="settings-group">
        <h3 className="settings-group__title">Editor</h3>

        <Row
          label="Tab size"
          description="Number of spaces per indentation level."
          htmlFor={tabSizeId}
        >
          <select
            id={tabSizeId}
            className="settings-select glass-input settings-select--narrow"
            value={settings.tabSize}
            onChange={(e) => updateSettings({ tabSize: Number(e.target.value) })}
          >
            {[2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n} spaces
              </option>
            ))}
          </select>
        </Row>

        <Row
          label="Word wrap"
          description="Wrap long lines to the editor width."
        >
          <Toggle
            checked={settings.wordWrap}
            label="Word wrap"
            onChange={(next) => {
              updateSettings({ wordWrap: next });
              toast.success('Word wrap', next ? 'Enabled' : 'Disabled');
            }}
          />
        </Row>

        <Row
          label="Plan before acting"
          description="Draft an execution plan and wait for your approval before the agent edits files or runs commands."
        >
          <Toggle
            checked={settings.planBeforeAct}
            label="Plan before acting"
            onChange={(next) => {
              updateSettings({ planBeforeAct: next });
              toast.success('Plan before acting', next ? 'Enabled' : 'Disabled');
            }}
          />
        </Row>

        <Row
          label="Verify on complete"
          description="After the agent finishes a task that changed the workspace, run a verification command (typecheck, tests, etc.) and loop failures back to the agent."
        >
          <Toggle
            checked={settings.verifyOnComplete}
            label="Verify on complete"
            onChange={(next) => {
              updateSettings({ verifyOnComplete: next });
              toast.success('Verify on complete', next ? 'Enabled' : 'Disabled');
            }}
          />
        </Row>

        <Row
          label="Verify command"
          description="Command to run for self-verification. Empty = auto-detect (prefers package.json test/typecheck/build, else npx tsc --noEmit)."
        >
          <Input
            value={settings.verifyCommand}
            onChange={(e) => updateSettings({ verifyCommand: e.target.value })}
            placeholder="npm run typecheck"
          />
        </Row>
      </div>
    </section>
  );
}

/* ============================================================
    2. AI Providers
    ============================================================ */
const RECOMMENDED_PROVIDER = 'anthropic';

/** Well-known providers. When the user types a matching id (or name) in the
 *  Add Provider form, we auto-fill the correct kind + base URL so they don't
 *  have to look it up. */
const KNOWN_PROVIDERS: Record<string, { name: string; kind: 'openai-compatible' | 'ollama'; baseUrl: string; models: string[] }> = {
  openai: { name: 'OpenAI', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'] },
  anthropic: { name: 'Anthropic', kind: 'openai-compatible', baseUrl: 'https://api.anthropic.com/v1', models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'] },
  openrouter: { name: 'OpenRouter', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct'] },
  ollama: { name: 'Ollama (Local)', kind: 'ollama', baseUrl: 'http://localhost:11434/v1', models: ['llama3', 'codellama', 'mistral', 'qwen2.5-coder'] },
  groq: { name: 'Groq', kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'] },
  deepseek: { name: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'] },
  together: { name: 'Together AI', kind: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'] },
  nvidia: { name: 'NVIDIA NIM', kind: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', models: ['meta/llama-3.1-8b-instruct', 'nv-mistralai/mistral-nemo-12b-instruct'] },
  'nvidianim': { name: 'NVIDIA NIM', kind: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', models: ['meta/llama-3.1-8b-instruct'] },
  mistral: { name: 'Mistral AI', kind: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-small-latest'] },
  fireworks: { name: 'Fireworks AI', kind: 'openai-compatible', baseUrl: 'https://api.fireworks.ai/inference/v1', models: ['accounts/fireworks/models/llama-v3p1-70b-instruct'] },
  perplexity: { name: 'Perplexity', kind: 'openai-compatible', baseUrl: 'https://api.perplexity.ai', models: ['sonar', 'sonar-pro'] },
  xai: { name: 'xAI (Grok)', kind: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', models: ['grok-2', 'grok-2-mini'] },
  google: { name: 'Google AI', kind: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
  gemini: { name: 'Google Gemini', kind: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
};

function knownProviderFor(idOrName: string) {
  const key = idOrName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (KNOWN_PROVIDERS[key]) return KNOWN_PROVIDERS[key];
  for (const k of Object.keys(KNOWN_PROVIDERS)) {
    if (key.includes(k)) return KNOWN_PROVIDERS[k];
  }
  return null;
}

function ProviderCard({ provider }: { provider: AIProvider }) {
  const toggleProviderConnected = useSettingsStore((s) => s.toggleProviderConnected);
  const updateProviderApiKey = useSettingsStore((s) => s.updateProviderApiKey);
  const setProviderModels = useSettingsStore((s) => s.setProviderModels);
  const removeProvider = useSettingsStore((s) => s.removeProvider);
  const isRecommended = provider.id === RECOMMENDED_PROVIDER;
  const isLocal = !!provider.baseUrl && /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(provider.baseUrl);
  const needsKey = provider.id !== 'ollama' && !isLocal;

  const [isKeyModalOpen, setKeyModalOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const handleOpenKeyModal = () => {
    setKeyDraft(getApiKey(provider.id) ?? '');
    setKeyModalOpen(true);
  };

  const handleSaveKey = async () => {
    const key = keyDraft.trim();
    if (!key) {
      toast.warning('Missing key', 'Enter an API key before saving.');
      return;
    }
    setApiKey(provider.id, key);
    updateProviderApiKey(provider.id, true);
    setKeyModalOpen(false);
    toast.success('API key set', `${provider.name} is now configured.`);

    // Verify the key actually works against the provider (keyless/local
    // providers skip this). Surface a clear success or failure toast.
    if (needsKey) {
      try {
        const models = await listProviderModels(provider.id);
        if (models.length > 0) {
          // The provider accepted the key — auto-fetch and add every available
          // model to the system so the composer can offer the full set.
          setProviderModels(provider.id, models);
          toast.success('Key verified', `${provider.name} accepted your key — ${models.length} model(s) added to your system.`);
        } else {
          toast.warning(
            'Key saved, not verified',
            `${provider.name} accepted the key but returned no models. It may still work.`,
          );
        }
      } catch (e: any) {
        toast.error('Key rejected', `${provider.name} responded: ${e?.message || 'unknown error'}.`);
      }
    }
  };

  const handleClearKey = () => {
    clearApiKey(provider.id);
    updateProviderApiKey(provider.id, false);
    toast.warning('API key cleared', `${provider.name} key was removed.`);
  };

  return (
    <article
      className={`provider-card glass-card ${
        isRecommended ? 'provider-card--recommended' : ''
      }`}
    >
      <div className="provider-card__top">
        <div className="provider-card__identity">
          <ProviderIcon id={provider.id} name={provider.name} size={26} className="provider-card__logo" />
          <div className="provider-card__titles">
            <h3 className="provider-card__name">
              {provider.name}
              {isRecommended && (
                <Badge variant="accent">
                  <Star size={11} /> Recommended
                </Badge>
              )}
            </h3>
            <span className="provider-card__id">{provider.id}</span>
          </div>
        </div>
        <div className="provider-card__top-actions">
          <Toggle
            checked={provider.isConnected}
            label={`Connect ${provider.name}`}
            onChange={() => toggleProviderConnected(provider.id)}
          />
          <IconButton
            icon={<Trash2 size={14} />}
            tooltip="Delete provider"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm(`Delete provider "${provider.name}"?`)) {
                removeProvider(provider.id);
                toast.success('Provider deleted', provider.name);
              }
            }}
          />
        </div>
      </div>


      {provider.baseUrl && (
        <p className="provider-card__base-url" title={provider.baseUrl}>
          <Globe size={11} />
          <code>{provider.baseUrl}</code>
          <span className="provider-card__kind">{provider.kind ?? 'openai'}</span>
        </p>
      )}

      <div className="provider-card__footer">
        <Badge variant={provider.apiKeySet ? 'success' : 'warning'}>
          {provider.apiKeySet ? (
            <>
              <Check size={11} /> Key set
            </>
          ) : needsKey ? (
            'No key'
          ) : (
            'No key required'
          )}
        </Badge>
        {needsKey && (
          <Button
            variant={provider.apiKeySet ? 'ghost' : 'primary'}
            size="sm"
            icon={<KeyRound size={14} />}
            onClick={provider.apiKeySet ? handleClearKey : handleOpenKeyModal}
          >
            {provider.apiKeySet ? 'Clear key' : 'Set key'}
          </Button>
        )}
      </div>

      <Modal
        isOpen={isKeyModalOpen}
        onClose={() => setKeyModalOpen(false)}
        title={`${provider.name} API key`}
        size="sm"
      >
        <div className="secret-form">
          <div className="secret-form__field">
            <label className="secret-form__label" htmlFor={`provider-key-${provider.id}`}>
              API key
            </label>
            <Input
              id={`provider-key-${provider.id}`}
              icon={<KeyRound size={14} />}
              placeholder="sk-..."
              value={keyDraft}
              autoFocus
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
            />
          </div>
          <p className="settings-note">
            <ShieldCheck size={14} />
            Stored encrypted at rest via your OS keychain, on this device only.
          </p>
          <div className="secret-form__actions">
            <Button variant="ghost" onClick={() => setKeyModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<KeyRound size={14} />} onClick={handleSaveKey}>
              Save key
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  );
}

function ProvidersSection() {
  const providers = useSettingsStore((s) => s.providers);
  const addProvider = useSettingsStore((s) => s.addProvider);
  const setProviderModels = useSettingsStore((s) => s.setProviderModels);

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderId, setNewProviderId] = useState('');
  const [newProviderKind, setNewProviderKind] = useState<'openai-compatible' | 'ollama'>('openai-compatible');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModelsText, setNewModelsText] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const resetForm = () => {
    setNewProviderName('');
    setNewProviderId('');
    setNewProviderKind('openai-compatible');
    setNewBaseUrl('');
    setNewModelsText('');
    setNewApiKey('');
  };

  const isLocalBase = /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(newBaseUrl);

  const handleAddProvider = async () => {
    const name = newProviderName.trim();
    const rawId = newProviderId.trim().toLowerCase();
    const modelsText = newModelsText.trim();
    const baseUrl = newBaseUrl.trim().replace(/\/+$/, '');
    const apiKey = newApiKey.trim();

    if (!name || !rawId) {
      toast.warning('Incomplete form', 'Please fill in the provider name and ID.');
      return;
    }
    if (newProviderKind === 'openai-compatible' && !baseUrl) {
      toast.warning('Base URL required', 'An OpenAI-compatible provider needs a base URL (e.g. https://openrouter.ai/api/v1).');
      return;
    }

    const cleanId = rawId.replace(/[^a-z0-9_-]/g, '');

    if (providers.some((p) => p.id === cleanId)) {
      toast.error('Provider exists', `A provider with ID "${cleanId}" already exists.`);
      return;
    }

    // Manual models are optional now — if provided we seed the list, otherwise
    // we start empty and auto-fetch the live catalogue below.
    const manualModels = modelsText
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    const hasKey = newProviderKind === 'ollama' || isLocalBase || apiKey.length > 0;

    const newProvider: AIProvider = {
      id: cleanId,
      name: name,
      kind: newProviderKind,
      ...(baseUrl ? { baseUrl } : {}),
      isConfigured: hasKey,
      isConnected: false,
      models: manualModels,
      apiKeySet: hasKey,
    };

    // Persist the key (if any) into the key vault so listProviderModels can
    // authenticate against the endpoint.
    if (apiKey) setApiKey(cleanId, apiKey);

    addProvider(newProvider);
    setAddModalOpen(false);
    resetForm();
    toast.success('Provider added', `Custom provider "${name}" has been registered.`);

    // Auto-fetch the live model catalogue from the provider and add every
    // available model to the system (same behaviour as the key-accept flow).
    if (baseUrl || newProviderKind === 'ollama') {
      setIsFetchingModels(true);
      try {
        const models = await listProviderModels(cleanId);
        if (models.length > 0) {
          setProviderModels(cleanId, models);
          toast.success('Models fetched', `${name} accepted the connection — ${models.length} model(s) added to your system.`);
        } else if (manualModels.length === 0) {
          toast.warning(
            'No models returned',
            `${name} did not return any models. Add them manually in its settings.`,
          );
        }
      } catch (e: any) {
        if (manualModels.length === 0) {
          toast.error('Could not fetch models', `${name} responded: ${e?.message || 'unknown error'}.`);
        }
      } finally {
        setIsFetchingModels(false);
      }
    }
  };

  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<Cpu size={18} />}
        title="AI Providers"
        description="Connect model providers and manage their credentials."
      />
      <div className="provider-grid stagger-children">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}

        {/* Add Provider Card */}
        <button
          className="provider-card provider-card--add-dashed"
          onClick={() => setAddModalOpen(true)}
          type="button"
          aria-label="Add custom provider"
        >
          <Plus size={22} className="provider-card__add-icon" />
          <span className="provider-card__add-text">Add Custom Provider</span>
        </button>
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => { setAddModalOpen(false); resetForm(); }}
        title="Add Custom AI Provider"
        size="sm"
      >
        <div className="secret-form">
          <div className="secret-form__field">
            <label className="secret-form__label">Provider Name</label>
            <Input
              icon={<Cpu size={14} />}
              placeholder="e.g. Groq, OpenRouter"
              value={newProviderName}
              onChange={(e) => setNewProviderName(e.target.value)}
            />
          </div>

          <div className="secret-form__field">
            <label className="secret-form__label">Provider ID / Slug</label>
            <Input
              icon={<Info size={14} />}
              placeholder="e.g. groq (lowercase, no spaces)"
              value={newProviderId}
              onChange={(e) => {
                const raw = e.target.value;
                setNewProviderId(raw);
                // Auto-detect kind + base URL for well-known providers.
                const known = knownProviderFor(raw);
                if (known) {
                  setNewProviderKind(known.kind);
                  setNewBaseUrl((prev) => (prev ? prev : known.baseUrl));
                  setNewProviderName((prev) => (prev ? prev : known.name));
                }
              }}
            />
          </div>

          <div className="secret-form__field">
            <label className="secret-form__label">Type</label>
            <select
              className="secret-form__select"
              value={newProviderKind}
              onChange={(e) => setNewProviderKind(e.target.value as 'openai-compatible' | 'ollama')}
            >
              <option value="openai-compatible">OpenAI-compatible (Chat Completions)</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>

          {newProviderKind === 'openai-compatible' && (
            <div className="secret-form__field">
              <label className="secret-form__label">Base URL</label>
              <Input
                icon={<Globe size={14} />}
                placeholder="https://openrouter.ai/api/v1"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
              />
            </div>
          )}

          {newProviderKind === 'openai-compatible' && (
            <div className="secret-form__field">
              <label className="secret-form__label">API Key (optional)</label>
              <Input
                icon={<KeyRound size={14} />}
                type="password"
                placeholder="Leave blank for keyless / local gateways"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
              />
            </div>
          )}

          <div className="secret-form__field">
            <label className="secret-form__label">
              Models (Comma-separated, optional)
            </label>
            <Input
              icon={<Sparkles size={14} />}
              placeholder="Auto-fetched if left blank — e.g. llama3-70b, mixtral-8x7b"
              value={newModelsText}
              onChange={(e) => setNewModelsText(e.target.value)}
            />
          </div>

          <div className="secret-form__actions">
            <Button variant="ghost" onClick={() => { setAddModalOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={handleAddProvider} disabled={isFetchingModels}>
              {isFetchingModels ? 'Adding…' : 'Add Provider'}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

/* ============================================================
   3. Secrets
   ============================================================ */
function SecretsSection() {
  const secrets = useSettingsStore((s) => s.secrets);
  const addSecret = useSettingsStore((s) => s.addSecret);
  const removeSecret = useSettingsStore((s) => s.removeSecret);
  const toggleSecretReveal = useSettingsStore((s) => s.toggleSecretReveal);

  const [isModalOpen, setModalOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const resetForm = () => {
    setNewKey('');
    setNewValue('');
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const handleAdd = () => {
    const key = newKey.trim();
    const value = newValue.trim();
    if (!key || !value) {
      toast.warning('Missing fields', 'Both key and value are required.');
      return;
    }
    addSecret({ id: crypto.randomUUID(), key, value, isRevealed: false });
    toast.success('Secret added', `${key} stored securely.`);
    closeModal();
  };

  const handleCopy = (value: string) => {
    void navigator.clipboard?.writeText(value);
    toast.success('Copied', 'Secret value copied to clipboard.');
  };

  const handleRemove = (id: string, key: string) => {
    removeSecret(id);
    toast.warning('Secret removed', `${key} deleted from the store.`);
  };

  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<KeyRound size={18} />}
        title="Secrets"
        description="Environment variables and API keys for your workspace."
      />

      <div className="settings-section__toolbar">
        <p className="settings-note">
          <ShieldCheck size={14} />
          Secrets are stored locally and encrypted at rest — never synced to the cloud.
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setModalOpen(true)}
        >
          Add Secret
        </Button>
      </div>

      <div className="secrets-table glass-panel">
        <div className="secrets-table__head">
          <span>Key</span>
          <span>Value</span>
          <span className="secrets-table__actions-col">Actions</span>
        </div>

        {secrets.length === 0 ? (
          <div className="secrets-table__empty">
            <KeyRound size={28} />
            <p>No secrets yet. Add one to get started.</p>
          </div>
        ) : (
          secrets.map((secret) => (
            <div className="secrets-table__row" key={secret.id}>
              <span className="secrets-table__key">{secret.key}</span>
              <span className="secrets-table__value">
                {secret.isRevealed ? secret.value : '•'.repeat(12)}
              </span>
              <span className="secrets-table__actions">
                <IconButton
                  icon={secret.isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                  tooltip={secret.isRevealed ? 'Hide' : 'Reveal'}
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSecretReveal(secret.id)}
                />
                <IconButton
                  icon={<Copy size={15} />}
                  tooltip="Copy value"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(secret.value)}
                />
                <IconButton
                  icon={<Trash2 size={15} />}
                  tooltip="Delete"
                  variant="ghost"
                  size="sm"
                  className="secrets-table__delete"
                  onClick={() => handleRemove(secret.id, secret.key)}
                />
              </span>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title="Add Secret" size="sm">
        <div className="secret-form">
          <div className="secret-form__field">
            <label className="secret-form__label" htmlFor="secret-key">
              Key
            </label>
            <Input
              id="secret-key"
              icon={<KeyRound size={14} />}
              placeholder="MY_API_KEY"
              value={newKey}
              autoFocus
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            />
          </div>
          <div className="secret-form__field">
            <label className="secret-form__label" htmlFor="secret-value">
              Value
            </label>
            <Input
              id="secret-value"
              icon={<ShieldCheck size={14} />}
              placeholder="sk-..."
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <p className="settings-note">
            <ShieldCheck size={14} />
            This value is encrypted and kept on this device only.
          </p>
          <div className="secret-form__actions">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={handleAdd}>
              Add Secret
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

/* ============================================================
   4. Plugins
   ============================================================ */
interface PluginItem {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  tag: string;
}

const SAMPLE_PLUGINS: PluginItem[] = [
  {
    id: 'copilot-bridge',
    name: 'Copilot Bridge',
    description: 'Blend inline completions from multiple models into a single stream.',
    icon: <Bot size={18} />,
    tag: 'AI',
  },
  {
    id: 'git-flow',
    name: 'Git Flow Pro',
    description: 'Visual branch orchestration with AI-authored commit messages.',
    icon: <GitBranch size={18} />,
    tag: 'VCS',
  },
  {
    id: 'schema-sync',
    name: 'Schema Sync',
    description: 'Introspect databases and generate typed clients on the fly.',
    icon: <Database size={18} />,
    tag: 'Data',
  },
  {
    id: 'turbo-lint',
    name: 'Turbo Lint',
    description: 'Zero-config, incremental linting with auto-fix suggestions.',
    icon: <Zap size={18} />,
    tag: 'Quality',
  },
];

function PluginsSection() {
  const installedPlugins = useSettingsStore((s) => s.installedPlugins);
  const installPlugin = useSettingsStore((s) => s.installPlugin);
  const uninstallPlugin = useSettingsStore((s) => s.uninstallPlugin);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  const handleInstall = (id: string, name: string) => {
    setInstallingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      installPlugin(id);
      toast.success('Plugin installed', `${name} is now active.`);
    }, 1500);
  };

  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<Puzzle size={18} />}
        title="Plugins"
        description="Extend AIOS with community and first-party integrations."
      />

      <div className="plugins-banner glass-card-accent">
        <div className="plugins-banner__icon">
          <Boxes size={22} />
        </div>
        <div className="plugins-banner__text">
          <h3>Marketplace coming soon</h3>
          <p>
            A curated ecosystem of extensions is on the way. Here is a preview of what
            you will be able to install.
          </p>
        </div>
        <Badge variant="accent">
          <Sparkles size={11} /> Preview
        </Badge>
      </div>

      <div className="plugins-grid stagger-children">
        {SAMPLE_PLUGINS.map((plugin) => {
          const isInstalled = installedPlugins.includes(plugin.id);
          const isInstalling = installingIds.has(plugin.id);

          return (
            <article key={plugin.id} className="plugin-card glass-card">
              <div className="plugin-card__head">
                <span className="plugin-card__icon">{plugin.icon}</span>
                <Badge variant={isInstalled ? 'success' : 'default'}>
                  {isInstalled ? 'Active' : plugin.tag}
                </Badge>
              </div>
              <h4 className="plugin-card__name">{plugin.name}</h4>
              <p className="plugin-card__desc">{plugin.description}</p>
              {isInstalled ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => {
                    uninstallPlugin(plugin.id);
                    toast.warning('Plugin removed', `${plugin.name} is disabled.`);
                  }}
                >
                  Uninstall
                </Button>
              ) : (
                <Button
                  variant={isInstalling ? 'ghost' : 'primary'}
                  size="sm"
                  loading={isInstalling}
                  disabled={isInstalling}
                  icon={!isInstalling && <Plus size={14} />}
                  onClick={() => handleInstall(plugin.id, plugin.name)}
                >
                  {isInstalling ? 'Installing...' : 'Install'}
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   4b. MCP Servers
   ============================================================ */
function MCPServersSection() {
  const servers = useMCPStore((s) => s.servers);
  const addServer = useMCPStore((s) => s.addServer);
  const removeServer = useMCPStore((s) => s.removeServer);
  const updateServer = useMCPStore((s) => s.updateServer);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) {
      toast.warning('Name and URL required', 'Both fields are needed to add a server.');
      return;
    }
    addServer({ name: name.trim(), url: url.trim(), token: token.trim() || undefined });
    setName('');
    setUrl('');
    setToken('');
    toast.success('MCP server added', 'Tools will be fetched when the fleet or chat runs.');
  };

  const handleTest = async (id: string) => {
    const cfg = useMCPStore.getState().servers.find((s) => s.id === id);
    if (!cfg) return;
    setTesting(id);
    setStatus((s) => ({ ...s, [id]: 'Connecting…' }));
    try {
      const tools = await connectServer(cfg, true);
      setStatus((s) => ({ ...s, [id]: `✓ Connected — ${tools.length} tool(s)` }));
    } catch (e) {
      setStatus((s) => ({ ...s, [id]: `✗ ${(e as Error).message}` }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<Network size={18} />}
        title="MCP Servers"
        description="Connect external Model Context Protocol servers to give your agents real-world tools (browsers, databases, deploy hooks, custom integrations)."
      />

      <div className="mcp-add glass-card">
        <h4 className="settings-group__title">Add a server</h4>
        <div className="mcp-add__row">
          <Input
            placeholder="Display name (e.g. GitHub)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Streamable HTTP URL (…/mcp)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            placeholder="Token (optional)"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button variant="primary" icon={<Plus size={14} />} onClick={handleAdd}>
            Add
          </Button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="billing-stat">
          <span className="billing-stat__label" style={{ color: 'var(--text-tertiary)' }}>
            No MCP servers configured. Add one above to extend your agents' toolset.
          </span>
        </div>
      ) : (
        <div className="mcp-list stagger-children">
          {servers.map((srv) => (
            <article key={srv.id} className="mcp-card glass-card">
              <div className="mcp-card__head">
                <span className="mcp-card__name">
                  <Server size={15} /> {srv.name}
                </span>
                <Badge variant={srv.enabled ? 'success' : 'default'}>
                  {srv.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <p className="mcp-card__url">{srv.url}</p>
              {status[srv.id] && <p className="mcp-card__status">{status[srv.id]}</p>}
              <div className="mcp-card__actions">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={testing === srv.id}
                  disabled={testing === srv.id}
                  icon={<RefreshCw size={13} />}
                  onClick={() => handleTest(srv.id)}
                >
                  Test connection
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateServer(srv.id, { enabled: !srv.enabled })}
                >
                  {srv.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => {
                    removeServer(srv.id);
                    disconnectServer(srv.id);
                    toast.warning('Server removed', srv.name);
                  }}
                >
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   4c. Release Notes
   ============================================================ */
interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

const RELEASES: ReleaseEntry[] = [
  {
    version: '1.2.3',
    date: '2026-07-16',
    title: 'MCP tool servers, smarter fleet & reliability fixes',
    notes: [
      'MCP Servers: connect external Model Context Protocol servers so agents gain real-world tools (browsers, databases, deploy hooks) — no recompile needed.',
      'Fleet now honors each agent’s roster provider/model (no silent ollama fallback) and can actually call tools, including MCP, during background runs.',
      'CrewAI-style backstory + explicit role contracts and LangGraph-style handoffs make multi-agent runs more focused and isolated.',
      'Typed upstream context: prior agents hand off labelled, summarized deliverables instead of one raw text blob.',
      'Empty-response recovery: a truncated/empty model reply now auto-compacts history and retries instead of dead-ending.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-07-14',
    title: 'Self-verification & stability',
    notes: [
      'Self-verification: agents auto-run a verify command after mutating the workspace and loop failures back to the model (Settings → toggle + custom command).',
      'Fixed a stale-closure bug where switching models mid-run caused HTTP 400s.',
      'Hardened 400 → context-overflow detection with automatic history tightening and tool-result truncation.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-07-14',
    title: 'Reliability pass',
    notes: [
      'Stale-closure fix in submitTurn and setTimeout wrappers.',
      'Overflow detection hardening for long agent runs.',
    ],
  },
];

function ReleaseNotesSection() {
  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<ScrollText size={18} />}
        title="Release Notes"
        description="What's new in AIOS — features, fixes, and improvements shipped in recent releases."
      />

      <div className="releases stagger-children">
        {RELEASES.map((rel) => (
          <article key={rel.version} className="release-card glass-card">
            <div className="release-card__head">
              <span className="release-card__version">v{rel.version}</span>
              <span className="release-card__date">{rel.date}</span>
            </div>
            <h4 className="release-card__title">{rel.title}</h4>
            <ul className="release-card__notes">
              {rel.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
    5. About
    ============================================================ */
const TECH_STACK = ['React 19', 'TypeScript', 'Vite', 'Zustand', 'lucide-react'];

function AboutSection() {
  const updateStatus = useSettingsStore((s) => s.updateStatus);
  const checkForUpdates = useSettingsStore((s) => s.checkForUpdates);
  const downloadUpdate = useSettingsStore((s) => s.downloadUpdate);
  const quitAndInstall = useSettingsStore((s) => s.quitAndInstall);

  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<Info size={18} />}
        title="About"
        description="Version details and project credits."
      />

      <div className="about-hero glass-card">
        <div className="about-hero__mark" style={{ background: 'transparent', boxShadow: 'none' }}>
          <AiosLogo size={72} style={{ color: 'var(--logo-color)' }} />
        </div>
        <h1 className="about-hero__title"><Wordmark aSize="0.85em" /></h1>
        <p className="about-hero__subtitle">AI Agent Operating System</p>
        <Badge variant="accent">v{pkg.version}</Badge>
        <p className="about-hero__desc">
          A premium, agent-native IDE that unifies planning, building, reviewing, and
          shipping into one fluid, dark-mode workspace — designed for developers who
          orchestrate fleets of AI agents.
        </p>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Built with</h3>
        <div className="about-stack">
          {TECH_STACK.map((t) => (
            <span key={t} className="provider-chip glass-badge">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Updates</h3>
        <div className="about-update">
          <div className="about-update__row">
            <Button
              variant="secondary"
              onClick={checkForUpdates}
              disabled={updateStatus.status === 'checking' || updateStatus.status === 'downloading'}
              icon={
                <RefreshCw
                  size={14}
                  className={updateStatus.status === 'checking' ? 'animate-spin' : ''}
                />
              }
            >
              {updateStatus.status === 'checking' ? 'Checking…' : 'Check for updates'}
            </Button>

            {updateStatus.status === 'not-available' && (
              <span className="about-update__status">You're up to date (v{pkg.version})</span>
            )}
            {updateStatus.status === 'available' && (
              <span className="about-update__status about-update__status--available">
                v{updateStatus.version} is available
              </span>
            )}
            {updateStatus.status === 'downloaded' && (
              <span className="about-update__status about-update__status--available">
                Update ready to install
              </span>
            )}
            {updateStatus.status === 'error' && (
              <span className="about-update__status about-update__status--error">
                {updateStatus.error || 'Update check failed'}
              </span>
            )}
          </div>

          {updateStatus.status === 'available' && (
            <Button
              variant="primary"
              onClick={downloadUpdate}
              icon={<ArrowDownCircle size={14} />}
            >
              Download update
            </Button>
          )}

          {updateStatus.status === 'downloading' && (
            <div className="about-update__progress">
              <span>Downloading… {updateStatus.percent || 0}%</span>
              <div className="about-update__progressbar">
                <div
                  className="about-update__progressbar-fill"
                  style={{ width: `${updateStatus.percent || 0}%` }}
                />
              </div>
            </div>
          )}

          {updateStatus.status === 'downloaded' && (
            <Button
              variant="primary"
              onClick={quitAndInstall}
              icon={<ArrowDownCircle size={14} />}
            >
              Restart to install
            </Button>
          )}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Credits</h3>
        <p className="about-credits">
          Crafted by the AIOS team. Icons by lucide-react. Built for the next
          generation of AI-first development.
        </p>
        <p className="about-copyright">© 2026 AIOS. All rights reserved.</p>
      </div>
    </section>
  );
}

/* ============================================================
   Tool Permissions
   ============================================================ */
const PERMISSION_OPTION_LABELS: Record<ToolPermission, string> = {
  allow: 'Allow (no prompt)',
  ask: 'Ask every time',
  deny: 'Deny (blocked)',
};

function ToolPermissionsSection() {
  const modes = usePermissionsStore((s) => s.modes);
  const setMode = usePermissionsStore((s) => s.setMode);
  const reset = usePermissionsStore((s) => s.reset);

  return (
    <section className="settings-section animate-fade-in">
      <SectionHeader
        icon={<ShieldCheck size={18} />}
        title="Tool Permissions"
        description="Control what the agent is allowed to do on your machine — à la Claude Code's permission matrix. Read-only tools are allowed by default; mutating tools ask first."
      />

      <div className="settings-group">
        <div className="tool-perm-table" role="table" aria-label="Tool permissions">
          <div className="tool-perm-row tool-perm-row--head" role="row">
            <span className="tool-perm-cell tool-perm-cell--name">Tool</span>
            <span className="tool-perm-cell tool-perm-cell--mode">Permission</span>
          </div>
          {TOOL_IDS.map((id) => (
            <div className="tool-perm-row" role="row" key={id}>
              <span className="tool-perm-cell tool-perm-cell--name">{TOOL_LABELS[id]}</span>
              <span className="tool-perm-cell tool-perm-cell--mode">
                <select
                  className="tool-perm-select"
                  value={modes[id]}
                  onChange={(e) => setMode(id, e.target.value as ToolPermission)}
                  aria-label={`Permission for ${TOOL_LABELS[id]}`}
                >
                  {(['allow', 'ask', 'deny'] as ToolPermission[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {PERMISSION_OPTION_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          ))}
        </div>

        <div className="settings-section__toolbar">
          <Button variant="secondary" onClick={reset} icon={<RefreshCw size={14} />}>
            Reset to defaults
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Root
   ============================================================ */
const SECTION_MAP: Record<string, () => ReactNode> = {
  general: GeneralSection,
  providers: ProvidersSection,
  secrets: SecretsSection,
  plugins: PluginsSection,
  mcp: MCPServersSection,
  releases: ReleaseNotesSection,
  permissions: ToolPermissionsSection,
  about: AboutSection,
};

export function SettingsView() {
  const activeSection = useSettingsStore((s) => s.activeSection);
  const setActiveSection = useSettingsStore((s) => s.setActiveSection);

  const ActiveSection = SECTION_MAP[activeSection] ?? GeneralSection;

  return (
    <div className="settings-view">
      <aside className="settings-nav" aria-label="Settings sections">
        <div className="settings-nav__brand">
          <span className="settings-nav__brand-icon">
            <Settings size={18} />
          </span>
          <div className="settings-nav__brand-text">
            <span className="settings-nav__brand-title">Settings</span>
            <span className="settings-nav__brand-sub">Configure AIOS</span>
          </div>
        </div>
        <nav className="settings-nav__list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav__item ${
                activeSection === item.id ? 'settings-nav__item--active' : ''
              }`}
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => setActiveSection(item.id)}
            >
              <span className="settings-nav__item-icon">{item.icon}</span>
              <span className="settings-nav__item-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="settings-content">
        <ActiveSection />
      </main>
    </div>
  );
}
