import { useMemo } from 'react';
import { User, Shield, FolderGit2, Sparkles, Server, MessagesSquare, Bot } from 'lucide-react';
import { Badge } from '@/components/shared/Badge';
import { ModelProviderDropdown } from '@/components/shared/ModelProviderDropdown';
import { useAgentStore } from '@/store/useAgentStore';
import { useChatStore } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProjectStore } from '@/store/useProjectStore';
import { BUILTIN_MODELS } from '@/constants/models';
import './AccountView.css';

export function AccountView() {
  const agents = useAgentStore((s) => s.agents);
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const sessions = useChatStore((s) => s.sessions);
  const dynamicModels = useChatStore((s) => s.dynamicModels);
  const projects = useChatStore((s) => s.projects);
  const providers = useSettingsStore((s) => s.providers);
  const projectRoot = useProjectStore((s) => s.projectRoot);

  const stats = useMemo(() => {
    const messageCount = sessions.reduce((sum, s) => sum + s.messages.length, 0);
    const assistantReplies = sessions.reduce(
      (sum, s) => sum + s.messages.filter((m) => m.role === 'assistant').length,
      0,
    );
    return {
      agentCount: agents.length,
      conversationCount: sessions.length,
      projectCount: projects.length,
      messageCount,
      assistantReplies,
    };
  }, [agents, sessions, projects]);

  const connectedProviders = providers.filter((p) => p.isConnected);

  // The desktop bridge stores secrets in the OS keychain; the plain browser
  // build falls back to localStorage. Report whichever is actually in use.
  const hasNativeBridge =
    typeof window !== 'undefined' && Boolean(window.aios);

  return (
    <div className="account-view animate-fade-in">
      {/* Header */}
      <header className="account-view__header">
        <div className="account-view__title-row">
          <User className="account-view__title-icon" size={20} />
          <h1 className="account-view__title">Workspace</h1>
        </div>
      </header>

      <div className="account-view__grid">
        {/* Profile / workspace identity */}
        <div className="account-view__card glass-card">
          <div className="account-view__avatar-row">
            <div className="account-view__avatar">👤</div>
            <div>
              <h2 className="account-view__username">Local User</h2>
              <p className="account-view__user-id">
                <code>{hasNativeBridge ? 'AIOS Desktop' : 'AIOS Web'}</code>
              </p>
            </div>
          </div>
          <div className="account-view__badge-row">
            <Badge variant="accent">
              <Sparkles size={11} style={{ marginRight: 4 }} />
              Local Workspace
            </Badge>
            <Badge variant={connectedProviders.length > 0 ? 'success' : 'default'}>
              {connectedProviders.length > 0
                ? `${connectedProviders.length} provider${connectedProviders.length === 1 ? '' : 's'} connected`
                : 'No provider connected'}
            </Badge>
          </div>
        </div>

        {/* Workspace activity (real, derived from stores) */}
        <div className="account-view__card glass-card">
          <h3 className="account-card__title">
            <MessagesSquare size={15} /> Activity
          </h3>
          <div className="billing-stat">
            <span className="billing-stat__label">Agents in roster:</span>
            <span className="billing-stat__val">{stats.agentCount}</span>
          </div>
          <div className="billing-stat">
            <span className="billing-stat__label">Conversations:</span>
            <span className="billing-stat__val">{stats.conversationCount}</span>
          </div>
          <div className="billing-stat">
            <span className="billing-stat__label">Chat projects:</span>
            <span className="billing-stat__val">{stats.projectCount}</span>
          </div>
          <div className="billing-stat">
            <span className="billing-stat__label">Total messages:</span>
            <span className="billing-stat__val">{stats.messageCount}</span>
          </div>
          <div className="billing-stat">
            <span className="billing-stat__label">Assistant replies:</span>
            <span className="billing-stat__val">{stats.assistantReplies}</span>
          </div>
        </div>

        {/* Security & storage (reflects real runtime state) */}
        <div className="account-view__card glass-card">
          <h3 className="account-card__title">
            <Shield size={15} /> Security & Storage
          </h3>
          <div className="billing-stat">
            <span className="billing-stat__label">API key storage:</span>
            <span className="billing-stat__val">
              {hasNativeBridge ? 'OS keychain' : 'Browser localStorage'}
            </span>
          </div>
          <div className="billing-stat">
            <span className="billing-stat__label">Native shell access:</span>
            <span
              className="billing-stat__val"
              style={{ color: hasNativeBridge ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}
            >
              {hasNativeBridge ? 'Available' : 'Unavailable (web)'}
            </span>
          </div>
          <div className="billing-stat">
            <span className="billing-stat__label">Data persistence:</span>
            <span className="billing-stat__val">Local (this device)</span>
          </div>
        </div>

        {/* Open workspace folder */}
        <div className="account-view__card glass-card">
          <h3 className="account-card__title">
            <FolderGit2 size={15} /> Workspace Folder
          </h3>
          {projectRoot ? (
            <div className="billing-stat">
              <span className="billing-stat__label">Root:</span>
              <span className="billing-stat__val" title={projectRoot}>
                {projectRoot}
              </span>
            </div>
          ) : (
            <div className="billing-stat">
              <span className="billing-stat__label">Root:</span>
              <span className="billing-stat__val" style={{ color: 'var(--text-tertiary)' }}>
                No folder open
              </span>
            </div>
          )}
        </div>

        {/* Configured AI providers (real settings state) */}
        <div className="account-view__card glass-card">
          <h3 className="account-card__title">
            <Server size={15} /> AI Providers
          </h3>
          {providers.length === 0 ? (
            <div className="billing-stat">
              <span className="billing-stat__label" style={{ color: 'var(--text-tertiary)' }}>
                No providers registered.
              </span>
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="billing-stat">
                <span className="billing-stat__label">{p.name}</span>
                <span
                  className="billing-stat__val"
                  style={{
                    color: p.isConnected
                      ? 'var(--status-success)'
                      : p.isConfigured
                        ? 'var(--accent-primary)'
                        : 'var(--text-tertiary)',
                  }}
                >
                  {p.isConnected
                    ? 'Connected'
                    : p.isConfigured
                      ? 'Configured'
                      : 'Not configured'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Model roster (real agents) */}
        <div className="account-view__card glass-card">
          <h3 className="account-card__title">
            <Bot size={15} /> Agent Roster
          </h3>
          {agents.length === 0 ? (
            <div className="billing-stat">
              <span className="billing-stat__label" style={{ color: 'var(--text-tertiary)' }}>
                No agents configured.
              </span>
            </div>
          ) : (
            agents.map((a) => (
              <div key={a.id} className="billing-stat billing-stat--agent">
                <div className="billing-stat__agent-meta">
                  <span className="billing-stat__label">{a.name}</span>
                  <span className="billing-stat__role">{a.role}</span>
                </div>
                <ModelProviderDropdown
                  providers={providers}
                  dynamicModels={dynamicModels}
                  builtinModels={BUILTIN_MODELS}
                  activeProvider={a.provider}
                  activeModel={a.model}
                  onSelect={(prov, mod) => updateAgent(a.id, { provider: prov, model: mod })}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
