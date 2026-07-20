/* ================================================================== */
/*  Core domain types — shared across stores, services and views.    */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Providers                                                          */
/* ------------------------------------------------------------------ */

export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'openai-compatible'
  | 'ollama';

/** Provider id. Built-ins are listed below; custom user-added providers use
 *  arbitrary string ids (a `Record<string, …>` still satisfies `ProviderType`). */
export type ProviderType = string;

export interface AIProvider {
  id: ProviderType;
  name: string;
  /** Protocol/driver to use. Built-in ids resolve to dedicated drivers; any
   *  `openai-compatible` provider with a `baseUrl` is served by the generic
   *  OpenAI-compatible driver. */
  kind?: ProviderKind;
  /** Base URL for `openai-compatible` providers, e.g. https://openrouter.ai/api/v1. */
  baseUrl?: string;
  /** When false, the OpenAI-compatible driver does NOT send native
   *  function-calling `tools`/`tool_choice` to the endpoint. Use this for
   *  providers that reject `tool_choice: "auto"` (e.g. NVIDIA NIM, which runs
   *  on vLLM without --enable-auto-tool-choice). The agent runtime then uses
   *  its XML `<tool_call>` fallback instead. Defaults to true. */
  nativeTools?: boolean;
  isConfigured: boolean;
  isConnected: boolean;
  models: string[];
  apiKeySet: boolean;
}

/* ------------------------------------------------------------------ */
/*  Agents & chat                                                      */
/* ------------------------------------------------------------------ */

export type AgentRole =
  | 'planner'
  | 'builder'
  | 'reviewer'
  | 'tester'
  | 'deployer'
  | 'custom';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'error'
  | 'completed';

export interface AgentMetrics {
  tasksCompleted: number;
  tokensUsed: number;
  avgResponseTime: number;
  successRate: number;
  linesWritten: number;
  filesModified: number;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  avatar: string;
  description: string;
  model: string;
  provider: ProviderType;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  currentTask: string | null;
  metrics: AgentMetrics;
  createdAt: number;
  lastActiveAt: number;
}

export type ToolCallStatus =
  | 'running'
  | 'awaiting-approval'
  | 'success'
  | 'rejected'
  | 'failed'
  | 'error';

export interface ToolCallDiff {
  path?: string;
  additions: number;
  deletions: number;
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments string. */
  arguments: string;
  status: ToolCallStatus;
  output?: string;
  error?: string;
  diff?: ToolCallDiff;
}

export interface CodeBlock {
  lang: string;
  code: string;
  filename?: string;
}

export type ChatMessageStatus = 'streaming' | 'complete' | 'error';

export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  id: string;
  agentId: string;
  role: ChatMessageRole;
  content: string;
  timestamp: number;
  status?: ChatMessageStatus;
  toolCalls?: ToolCall[];
  /** Links a tool-result message back to the originating tool call (native providers). */
  toolCallId?: string;
  /** Paths of workspace files attached to a user message (model context only). */
  files?: string[];
  /** Hidden background context appended for the model but never shown in the thread. */
  hidden?: string;
  /** Wall-clock time (ms) the agent spent producing this response, across all
   *  tool rounds. Set on the assistant message when the turn completes. */
  durationMs?: number;
  /** Token usage reported (or estimated) for the turn that produced this message. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/* ------------------------------------------------------------------ */
/*  Navigation                                                         */
/* ------------------------------------------------------------------ */

export type SidebarView =
  | 'dashboard'
  | 'agents'
  | 'workflow'
  | 'files'
  | 'preview'
  | 'git'
  | 'memory'
  | 'prompts'
  | 'terminal'
  | 'workspaces'
  | 'settings'
  | 'notifications'
  | 'account'
  | 'web';

export interface Command {
  id: string;
  label: string;
  category: string;
  icon: string;
  shortcut?: string;
  action: () => void;
}

/* ------------------------------------------------------------------ */
/*  Files                                                              */
/* ------------------------------------------------------------------ */

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  size?: number;
  isExpanded?: boolean;
  isModified?: boolean;
  children?: ProjectFile[];
}

/* ------------------------------------------------------------------ */
/*  Memory                                                             */
/* ------------------------------------------------------------------ */

export type MemoryCategory =
  | 'architecture'
  | 'requirements'
  | 'conventions'
  | 'decisions'
  | 'bugs'
  | 'tasks'
  | 'documentation'
  | 'conversations';

export type MemoryImportance = 'low' | 'medium' | 'high' | 'critical';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  source: string;
  importance: MemoryImportance;
}

/* ------------------------------------------------------------------ */
/*  Prompts                                                            */
/* ------------------------------------------------------------------ */

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  usageCount: number;
  isFavorite: boolean;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/*  Git                                                               */
/* ------------------------------------------------------------------ */

export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface GitFileChange {
  path: string;
  status: GitChangeStatus;
  additions?: number;
  deletions?: number;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: number;
  files: number;
}

/* ------------------------------------------------------------------ */
/*  Workflow                                                           */
/* ------------------------------------------------------------------ */

export type WorkflowNodeType =
  | 'planner'
  | 'builder'
  | 'reviewer'
  | 'tester'
  | 'deployer'
  | 'condition'
  | 'parallel'
  | 'custom';

export interface WorkflowNodeData {
  [key: string]: unknown;
  label: string;
  type: WorkflowNodeType;
  description: string;
  status: AgentStatus;
  progress: number;
  agentId?: string;
  config?: Record<string, unknown>;
}

export type WorkflowStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

/* ------------------------------------------------------------------ */
/*  Fleet Director (auto-orchestration)                               */
/* ------------------------------------------------------------------ */

/** A single auto-assigned unit of work routed to one specialised agent. */
export interface SubTask {
  id: string;
  role: AgentRole;
  label: string;
  intent: string;
  /** Subtask ids this one depends on — their outputs are threaded in. */
  dependsOn: string[];
  /** Override the auto-picked agent (user editable before/while running). */
  agentId?: string;
  status: AgentStatus;
  output?: string;
  error?: string;
}

/** A goal decomposed by the Director into role-assigned subtasks. */
export interface OrchestrationPlan {
  goal: string;
  subtasks: SubTask[];
  createdAt: number;
  /** True when an LLM refined the decomposition; false for the heuristic path. */
  llmAssisted: boolean;
}

/**
 * Shared context bus. Every agent in a run receives the same `sharedBrief`
 * + `memory`, so the fleet shares one reality instead of working in silos.
 * `priorOutputs` carries each completed agent's result forward to its
 * dependents (prior-agent context).
 */
export interface DirectorContext {
  projectName?: string;
  goal: string;
  sharedBrief: string;
  memory: string;
  priorOutputs: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Terminal                                                           */
/* ------------------------------------------------------------------ */

export interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
  isDead: boolean;
  initialCommand?: string;
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  timestamp: number;
  duration?: number;
  read?: boolean;
  type: NotificationType;
  title: string;
  message?: string;
}

/* ------------------------------------------------------------------ */
/*  Settings & updates                                                 */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  sidebarVisible: boolean;
  sidebarWidth: number;
  activeView: SidebarView;
  /** Draft an execution plan and wait for approval before the agent
   *  mutates the workspace (plan-then-act). Off by default;
   *  the `/plan` slash command force-enables it for one send. */
  planBeforeAct: boolean;
  /** After a turn that changed files/ran commands, auto-run a
   *  verification command and loop the errors back to the agent
   *  until it passes (enforced self-verification). */
  verifyOnComplete: boolean;
  /** Command run for self-verification when verifyOnComplete is on.
   *  Empty = auto-detect (prefer package.json `test`, then
   *  `typecheck`/`build`, then `npx tsc --noEmit`). */
  verifyCommand: string;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatusPayload {
  status: UpdateStatus;
  version?: string;
  percent?: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Dashboard activity                                                 */
/* ------------------------------------------------------------------ */

export type ActivityType =
  | 'task'
  | 'commit'
  | 'review'
  | 'test'
  | 'deploy'
  | 'error'
  | 'info';

export interface ActivityItem {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  detail: string;
  timestamp: number;
  type: ActivityType;
}
