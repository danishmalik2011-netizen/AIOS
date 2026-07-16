/* ================================================
   Plugin Registry — reactive runtime for installed plugins.
   Holds installed manifests + enabled state and the aggregated
   contributions (commands/tools/node types). Contributions are tagged
   with their owning plugin so disabling cleanly removes them.
   ================================================ */

import { create } from 'zustand';
import { toast } from '@/store/useNotificationStore';
import type {
  AiosPlugin, PluginManifest, PluginContext,
  PluginCommand, PluginTool, PluginWorkflowNodeSpec,
} from './types';

type Owned<T> = T & { owner: string };

export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
}

interface PluginStore {
  plugins: InstalledPlugin[];
  commands: Owned<PluginCommand>[];
  tools: Owned<PluginTool>[];
  nodeTypes: Owned<PluginWorkflowNodeSpec>[];

  install: (plugin: AiosPlugin) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  uninstall: (id: string) => void;
  runTool: (toolId: string, input: string) => Promise<string>;
}

/* Plugin instances hold functions, so they live outside the store. */
const instances = new Map<string, AiosPlugin>();

export const usePluginStore = create<PluginStore>((set, get) => {
  const removeContributions = (owner: string) =>
    set((s) => ({
      commands: s.commands.filter((c) => c.owner !== owner),
      tools: s.tools.filter((t) => t.owner !== owner),
      nodeTypes: s.nodeTypes.filter((n) => n.owner !== owner),
    }));

  const buildContext = (pluginId: string): PluginContext => ({
    pluginId,
    registerCommand: (command) =>
      set((s) => ({ commands: [...s.commands, { ...command, owner: pluginId }] })),
    registerTool: (tool) =>
      set((s) => ({ tools: [...s.tools, { ...tool, owner: pluginId }] })),
    registerWorkflowNode: (node) =>
      set((s) => ({ nodeTypes: [...s.nodeTypes, { ...node, owner: pluginId }] })),
    notify: (type, title, message) => toast[type](title, message),
    log: (...args) => console.info(`[plugin:${pluginId}]`, ...args),
  });

  const activate = (plugin: AiosPlugin) => {
    try {
      void plugin.activate(buildContext(plugin.manifest.id));
    } catch (err) {
      toast.error('Plugin failed to activate', (err as Error).message);
    }
  };

  return {
    plugins: [],
    commands: [],
    tools: [],
    nodeTypes: [],

    install: (plugin) => {
      const id = plugin.manifest.id;
      if (get().plugins.some((p) => p.manifest.id === id)) return;
      instances.set(id, plugin);
      set((s) => ({ plugins: [...s.plugins, { manifest: plugin.manifest, enabled: true }] }));
      activate(plugin);
    },

    setEnabled: (id, enabled) => {
      const plugin = instances.get(id);
      if (!plugin) return;
      if (enabled) {
        activate(plugin);
      } else {
        removeContributions(id);
        plugin.deactivate?.();
      }
      set((s) => ({
        plugins: s.plugins.map((p) => (p.manifest.id === id ? { ...p, enabled } : p)),
      }));
    },

    uninstall: (id) => {
      const plugin = instances.get(id);
      plugin?.deactivate?.();
      removeContributions(id);
      instances.delete(id);
      set((s) => ({ plugins: s.plugins.filter((p) => p.manifest.id !== id) }));
    },

    runTool: async (toolId, input) => {
      const tool = get().tools.find((t) => t.id === toolId);
      if (!tool) throw new Error(`Tool not found: ${toolId}`);
      return tool.run(input);
    },
  };
});

/** Read enabled contributions (used by the command palette, workflow, etc.). */
export function enabledCommands(): Owned<PluginCommand>[] {
  const { plugins, commands } = usePluginStore.getState();
  const on = new Set(plugins.filter((p) => p.enabled).map((p) => p.manifest.id));
  return commands.filter((c) => on.has(c.owner));
}
