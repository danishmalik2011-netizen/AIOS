/* ================================================
   Plugin SDK — public contracts
   Third parties implement `AiosPlugin`. On activation they receive a
   `PluginContext` through which they contribute commands, tools, and
   custom workflow node types. This is the same seam used internally,
   so first-party and third-party features are indistinguishable.
   ================================================ */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  /** Optional emoji/glyph shown in the plugins UI. */
  icon?: string;
}

export interface PluginCommand {
  id: string;
  label: string;
  category?: string;
  run: () => void | Promise<void>;
}

export interface PluginTool {
  id: string;
  name: string;
  description: string;
  /** Pure-ish transform an agent/workflow can invoke. */
  run: (input: string) => string | Promise<string>;
}

export interface PluginWorkflowNodeSpec {
  type: string;
  label: string;
  description: string;
  /** Default provider/model hint the orchestrator can use. */
  defaultModel?: string;
}

export interface PluginContext {
  readonly pluginId: string;
  registerCommand: (command: PluginCommand) => void;
  registerTool: (tool: PluginTool) => void;
  registerWorkflowNode: (node: PluginWorkflowNodeSpec) => void;
  notify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
  log: (...args: unknown[]) => void;
}

export interface AiosPlugin {
  manifest: PluginManifest;
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate?: () => void;
}
