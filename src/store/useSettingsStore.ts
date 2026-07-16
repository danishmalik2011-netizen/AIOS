import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, AIProvider, SidebarView, UpdateStatusPayload } from '@/core/types';

export interface SecretEntry {
  id: string;
  key: string;
  value: string;
  isRevealed: boolean;
}

interface SettingsStore {
  /* ---- Editor / app preferences ---- */
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;

  /* ---- Navigation (flattened — consumed across the layout) ---- */
  activeView: SidebarView;
  setActiveView: (view: SidebarView) => void;

  /* ---- Sidebar ---- */
  sidebarVisible: boolean;
  sidebarWidth: number;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarWidth: (width: number) => void;

  /* ---- Command palette ---- */
  commandPaletteOpen: boolean;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  /* ---- Settings sub-navigation & modal ---- */
  activeSection: string;
  setActiveSection: (section: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  /* ---- Providers & secrets ---- */
  providers: AIProvider[];
  secrets: SecretEntry[];
  addProvider: (provider: AIProvider) => void;
  removeProvider: (id: string) => void;
  updateProviderApiKey: (id: string, hasKey: boolean) => void;
  toggleProviderConnected: (id: string) => void;
  addSecret: (secret: SecretEntry) => void;
  removeSecret: (id: string) => void;
  toggleSecretReveal: (id: string) => void;

  /* ---- Plugins ---- */
  installedPlugins: string[];
  installPlugin: (id: string) => void;
  uninstallPlugin: (id: string) => void;

  /* ---- Auto-Updater ---- */
  updateStatus: UpdateStatusPayload;
  setUpdateStatus: (status: UpdateStatusPayload) => void;
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  quitAndInstall: () => void;
}

const defaultSettings: AppSettings = {
  theme: 'dark-slate',
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  tabSize: 2,
  wordWrap: true,
  minimap: true,
  sidebarVisible: true,
  sidebarWidth: 260,
  activeView: 'dashboard',
  planBeforeAct: false,
  verifyOnComplete: true,
  verifyCommand: '',
};

const defaultProviders: AIProvider[] = [
  { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', isConfigured: false, isConnected: false, models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'], apiKeySet: false },
  { id: 'openai', name: 'OpenAI', kind: 'openai', isConfigured: false, isConnected: false, models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'], apiKeySet: false },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', isConfigured: false, isConnected: false, models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct', 'google/gemini-pro-1.5'], apiKeySet: false },
  { id: 'ollama', name: 'Ollama (Local)', kind: 'ollama', isConfigured: true, isConnected: false, models: ['llama3', 'codellama', 'mistral', 'qwen2.5-coder'], apiKeySet: true },
];

const defaultSecrets: SecretEntry[] = [
  { id: 's1', key: 'ANTHROPIC_API_KEY', value: '', isRevealed: false },
  { id: 's2', key: 'OPENAI_API_KEY', value: '', isRevealed: false },
  { id: 's3', key: 'DATABASE_URL', value: '', isRevealed: false },
];

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),

      activeView: 'dashboard',
      setActiveView: (view) => set({ activeView: view }),

      sidebarVisible: true,
      sidebarWidth: 260,
      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(480, width)) }),

      commandPaletteOpen: false,
      toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      activeSection: 'general',
      setActiveSection: (section) => set({ activeSection: section }),
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),

      providers: defaultProviders,
      secrets: defaultSecrets,
      installedPlugins: [],
      installPlugin: (id) => set((state) => ({ installedPlugins: [...state.installedPlugins, id] })),
      uninstallPlugin: (id) => set((state) => ({ installedPlugins: state.installedPlugins.filter((x) => x !== id) })),

      updateProviderApiKey: (id, hasKey) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === id ? { ...p, apiKeySet: hasKey, isConfigured: hasKey } : p,
          ),
        })),

      toggleProviderConnected: (id) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === id ? { ...p, isConnected: !p.isConnected } : p,
          ),
        })),

      addProvider: (provider) =>
        set((state) => ({ providers: [...state.providers, provider] })),

      removeProvider: (id) =>
        set((state) => ({ providers: state.providers.filter((p) => p.id !== id) })),

      addSecret: (secret) => set((state) => ({ secrets: [...state.secrets, secret] })),
      removeSecret: (id) => set((state) => ({ secrets: state.secrets.filter((s) => s.id !== id) })),
      toggleSecretReveal: (id) =>
        set((state) => ({
          secrets: state.secrets.map((s) =>
            s.id === id ? { ...s, isRevealed: !s.isRevealed } : s,
          ),
        })),

      updateStatus: { status: 'idle' },
      setUpdateStatus: (status) => set({ updateStatus: status }),
      checkForUpdates: () => {
        if (window.aios) {
          void window.aios.updater.checkForUpdates();
        }
      },
      downloadUpdate: () => {
        if (window.aios) {
          void window.aios.updater.downloadUpdate();
        }
      },
      quitAndInstall: () => {
        if (window.aios) {
          void window.aios.updater.quitAndInstall();
        }
      },
    }),
    {
      name: 'aios-settings',
      partialize: (state) => ({
        settings: state.settings,
        activeView: state.activeView,
        sidebarVisible: state.sidebarVisible,
        sidebarWidth: state.sidebarWidth,
        installedPlugins: state.installedPlugins,
        providers: state.providers,
      }),
    },
  ),
);
