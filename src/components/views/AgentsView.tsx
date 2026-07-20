import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import {
  Send,
  Square,
  LayoutDashboard,
  Plus,
  Bot,
  Network,
  PanelLeftOpen,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  Search,
  FolderOpen,
  Folder,
  Eye,
  Settings2,
  Copy,
  Terminal,
  Activity,
  History,
  Zap,
  Archive,
  Trash2,
  ChevronRight,
  ChevronDown,
  Pencil,
  Crosshair,
  Undo2,
  AlertCircle,
  Settings,
  Paperclip,
  ChevronUp,
  Pin,
  Target,
  X,
  Cpu,
  Check,
  Sparkles,
  Copy as DuplicateIcon,
  MoreVertical,
  Share2,
  ClipboardCopy,
  Link2,
  Clock,
  Wrench,
  Loader2,
  RefreshCw,
  Volume2,
  VolumeX,
  Download,
  ArrowDownCircle,
} from 'lucide-react';
import { useChatStore, getSessionById, type ChatSession, DEFAULT_PROJECT_ID } from '@/store/useChatStore';
import { useAgentStore } from '@/store/useAgentStore';
import { useFollowPanelStore, type ArtifactType, type PlanStep, type PlanStepStatus } from '@/store/useFollowPanelStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useMemoryStore } from '@/store/useMemoryStore';
import { useOrchestratorStore } from '@/store/useOrchestratorStore';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import {
  planGoal,
  buildTaskPrompt,
  asGraph,
  summarize,
  type StructuredOutput,
} from '@/services/orchestration/director';
import { runAgentTurn } from '@/services/agentRuntime';
import { executeFleetTool } from '@/services/fleetTools';
import { getActiveToolDefinitions, executeMCPTool } from '@/services/mcp/registry';
import { useTerminalStore } from '@/store/useTerminalStore';
import { toast } from '@/store/useNotificationStore';
import { Button } from '@/components/shared/Button';
import { IconButton } from '@/components/shared/IconButton';
import { Input } from '@/components/shared/Input';
import { Badge } from '@/components/shared/Badge';
import { Modal } from '@/components/shared/Modal';
import { AgentAvatar } from '@/components/shared/AgentAvatar';
import { Dropdown, type DropdownOption } from '@/components/shared/Dropdown';
import { complete, listProviderModels } from '@/services/providers/registry';
import { getApiKey } from '@/services/providers/keyVault';
import { AGENT_TOOLS, toolsToXmlPromptDoc } from '@/services/providers/toolSchemas';
import type { ProviderMessage, ProviderToolCall, ToolDefinition } from '@/services/providers/types';
import { gatherContext } from '@/services/retrieval';
import { ProviderIcon } from '@/components/shared/ProviderIcon';
import { ModelProviderDropdown } from '@/components/shared/ModelProviderDropdown';
import { BUILTIN_MODELS } from '@/constants/models';
import { useDiffReviewStore } from '@/store/useDiffReviewStore';
import { useCommandApprovalStore } from '@/store/useCommandApprovalStore';
import { useAutoAccessStore } from '@/store/useAutoAccessStore';
import { usePermissionsStore } from '@/store/usePermissionsStore';
import { useRunStore } from '@/store/useRunStore';
import { getRun, type QueuedItem } from '@/services/runManager';
import { usePlanStore } from '@/store/usePlanStore';
import type { ChatMessage, CodeBlock, ToolCall, ProjectFile, Agent, AIProvider, AgentRole } from '@/core/types';
import { AgentFollowPanel } from './AgentFollowPanel';
import './AgentsView.css';

/* Built-in model fallbacks, merged with Settings + runtime-discovered lists. */
/** Cooldown (ms) before a queued message is released to a freed agent. */
const QUEUE_COOLDOWN = 700;

const ROLE_LABELS: Record<AgentRole, string> = {
  planner: 'Planner',
  builder: 'Builder',
  reviewer: 'Reviewer',
  tester: 'Tester',
  deployer: 'Deployer',
  custom: 'Agent',
};

/** Providers that authenticate with an API key (vs. local/offline drivers).
 *  A custom provider pointing at a local server (Ollama's /v1, vLLM, â€¦) is
 *  keyless; everything else (OpenRouter, Groq, DeepSeek, â€¦) needs a key. */
function providerNeedsKey(id: string): boolean {
  if (id === 'ollama') return false;
  const provider = useSettingsStore.getState().providers.find((p) => p.id === id);
  if (provider?.baseUrl && /localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal/.test(provider.baseUrl)) {
    return false;
  }
  return true;
}

/** First model advertised for a provider, falling back to built-ins. */
function defaultModelFor(providerId: string, providers: AIProvider[]): string {
  const fromSettings = providers.find((p) => p.id === providerId)?.models?.[0];
  return fromSettings ?? BUILTIN_MODELS[providerId]?.[0] ?? '';
}

/**
 * Pick a sensible starting provider for a brand-new chat: a cloud provider the
 * user has actually keyed, then any explicitly connected provider, else the
 * first configured cloud provider. Ollama is treated as a last resort â€” never
 * a default â€” so a fresh chat doesn't silently target a local server that may
 * not be running.
 */
function pickDefaultProvider(providers: AIProvider[]): string {
  const cloud = (p: AIProvider) => p.kind !== 'ollama';
  const keyed = providers.find((p) => cloud(p) && providerNeedsKey(p.id) && getApiKey(p.id));
  if (keyed) return keyed.id;
  const connected = providers.find((p) => cloud(p) && p.isConnected);
  if (connected) return connected.id;
  const configured = providers.find((p) => cloud(p) && p.isConfigured);
  if (configured) return configured.id;
  return providers[0]?.id ?? 'openai';
}

/* ------------------------------------------------------------------ */
/*  Helper functions for parsing and rendering                        */
/* ------------------------------------------------------------------ */

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Compact elapsed-time label: "5s", "45s", "1m 20s", "3m". */
function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Best-effort context-window size (tokens) for a model id. */
function getContextWindow(model: string): number {
  const m = (model || '').toLowerCase();
  if (m.includes('gemini-1.5-pro') || m.includes('gemini-2')) return 2_000_000;
  if (m.includes('gemini')) return 1_000_000;
  if (m.includes('claude')) return 200_000;
  if (m.includes('gpt-3.5')) return 16_385;
  if (
    m.includes('gpt-4o') ||
    m.includes('gpt-4.1') ||
    m.includes('gpt-4-turbo') ||
    m.includes('gpt-4') ||
    m.includes('o1') ||
    m.includes('o3')
  )
    return 128_000;
  if (m.includes('deepseek')) return 128_000;
  if (
    m.includes('qwen') ||
    m.includes('llama') ||
    m.includes('mistral') ||
    m.includes('codellama')
  )
    return 32_768;
  return 128_000;
}

type Segment =
  | { type: 'text'; value: string }
  | { type: 'code'; lang: string; code: string; filename?: string };

/** Simple markdown code block parser */
function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```(\w*)[^\S\r\n]*\r?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim()) segments.push({ type: 'text', value: text });
    }
    segments.push({
      type: 'code',
      lang: match[1] || 'text',
      code: match[2].replace(/\n$/, ''),
    });
    lastIndex = fence.lastIndex;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text.trim()) segments.push({ type: 'text', value: text });
  }

  if (segments.length === 0) segments.push({ type: 'text', value: content });
  return segments;
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'para'; text: string };

/** Lightweight block-level markdown parser: headings, bullet/ordered lists,
 *  blockquotes and paragraphs. Keeps the assistant's replies scannable. */
function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s|>)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'para', text: paraLines.join(' ') });
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key++} className="agents-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function recursiveGetFiles(nodes: ProjectFile[]): ProjectFile[] {
  const result: ProjectFile[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push(node);
    } else if (node.children) {
      result.push(...recursiveGetFiles(node.children));
    }
  }
  return result;
}

/** Thrown by a tool when the user rejects a proposed edit via diff review. */
class ToolRejectedError extends Error {}

/** Derive a concise, human-readable conversation title from the first prompt
 *  and the working project â€” e.g. "Refactor auth flow Â· my-app". Strips code
 *  fences/markup and caps length so the sidebar stays tidy. */
function generateSmartTitle(text: string, project?: string | null): string {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').slice(0, 9).join(' ').trim();
  let title = words || 'New Conversation';
  title = title.charAt(0).toUpperCase() + title.slice(1);

  if (project) title = `${title} Â· ${project}`;

  const MAX = 56;
  if (title.length > MAX) {
    // Prefer trimming the prompt part, keeping the project suffix if present.
    if (project && title.endsWith(`Â· ${project}`)) {
      const base = title.slice(0, title.length - project.length - 3).trim();
      title = `${base.slice(0, MAX - project.length - 4).trimEnd()}â€¦ Â· ${project}`;
    } else {
      title = `${title.slice(0, MAX - 1).trimEnd()}â€¦`;
    }
  }
  return title;
}

/** Convert the display ChatMessage history into provider messages (text only).
 *  The `hidden` background context is appended for the model but is never
 *  shown in the thread. */
function chatHistoryToProviderMsgs(messages: ChatMessage[]): ProviderMessage[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.hidden ? `${m.content}\n\n${m.hidden}` : m.content,
  }));
}

/**
 * Build the provider message history for a *new* turn, preserving the agent's
 * memory of what it actually did in prior turns. Unlike `chatHistoryToProviderMsgs`
 * (text-only), this reconstructs each assistant message's tool calls as native
 * `tool_calls` plus a following `role: 'tool'` result per call. Without this, a
 * follow-up question ("what did you do?", "is everything done?") arrives with no
 * record of the tools run or files written, so the model has to re-investigate.
 *
 * `toolCalls` live on the assistant ChatMessage (with outputs/errors); they are
 * not separate messages, so they must be replayed into the provider shape here.
 */
function buildProviderHistory(messages: ChatMessage[]): ProviderMessage[] {
  const out: ProviderMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') continue; // tool results live inside assistant.toolCalls

    const content = m.hidden ? `${m.content}\n\n${m.hidden}` : m.content;
    const calls = m.toolCalls && m.toolCalls.length > 0 ? m.toolCalls : undefined;

    if (calls) {
      out.push({
        role: 'assistant',
        content,
        toolCalls: calls.map((c) => ({
          id: c.id,
          name: c.name,
          arguments: c.arguments || '{}',
        })),
      });
      for (const c of calls) {
        const resultText =
          c.status === 'success' ? c.output || '' : c.error || 'Tool failed.';
        out.push({ role: 'tool', content: resultText, toolCallId: c.id });
      }
    } else {
      out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
    }
  }
  return out;
}

/**
 * Keep a provider request within the model's context budget. The agent loop
 * appends an assistant `tool_calls` message + tool-result messages for every
 * tool round and re-sends the whole history each round, so an unbounded
 * history eventually overflows the context window â€” which many OpenAI-compatible
 * providers report as a bare `invalid_request_error` 400.
 *
 * `level` is the compaction level (0 = gentle steady-state cap, higher = more
 * aggressive, used when a request still overflows and we retry). It:
 *  - keeps only the most recent `N` messages (so the latest context survives),
 *  - drops any orphan `tool` messages left at the head after trimming (their
 *    assistant `tool_calls` parent was cut, which the API would reject), and
 *  - truncates oversized tool-result payloads so a single huge file read or
 *    command output can't dominate later rounds.
 */
const PROVIDER_MSG_CAP = [40, 26, 15, 6];
const TOOL_CONTENT_CAP = [6000, 3000, 1500, 600];
/**
 * Max times we re-prompt the model with the exact tool-call format when it
 * emits a malformed/non-parsing tool intent (instead of leaking raw text).
 * Bounded so a genuinely broken model can't loop forever.
 */
const MAX_TOOL_REPAIR = 2;

function capProviderHistory(history: ProviderMessage[], level = 0): ProviderMessage[] {
  const lvl = Math.max(0, Math.min(level, PROVIDER_MSG_CAP.length - 1));
  const maxMsgs = PROVIDER_MSG_CAP[lvl];
  const maxContent = TOOL_CONTENT_CAP[lvl];

  let msgs = history.slice(-maxMsgs);
  // Drop orphan tool messages at the head (parent assistant tool_calls trimmed).
  while (msgs.length && msgs[0].role === 'tool') msgs = msgs.slice(1);

  return msgs.map((m) => {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > maxContent) {
      const half = Math.floor(maxContent / 2);
      const head = m.content.slice(0, half);
      const tail = m.content.slice(-half);
      return {
        ...m,
        content: `${head}\nâ€¦[tool result truncated: ${m.content.length - maxContent} chars]â€¦\n${tail}`,
      };
    }
    return m;
  });
}

/** Map native provider tool calls into the display ToolCall shape. */
function nativeToToolCalls(calls: ProviderToolCall[]): ToolCall[] {
  return calls.map((c) => ({
    id: c.id,
    name: c.name,
    arguments: c.arguments,
    status: 'running' as const,
  }));
}

/** Cheap line-level add/remove counts via an LCS table (capped for size). */
function computeLineDiff(
  original: string,
  proposed: string,
): { path?: string; additions: number; deletions: number } {
  const a = original.length ? original.split('\n') : [];
  const b = proposed.length ? proposed.split('\n') : [];
  if (a.length > 4000 || b.length > 4000) {
    return { additions: Math.max(0, b.length - a.length), deletions: Math.max(0, a.length - b.length) };
  }
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const common = dp[0][0];
  return { additions: n - common, deletions: m - common };
}

/**
 * Parse <tool_call> XML tags out of model text (fallback for providers without
 * native tools). Tolerant of the malformations weak tool-calling models emit:
 *   - unquoted / bare names:        <tool_call name=run_command>
 *   - `>` instead of `/>` for self-close
 *   - a stray prefix/wrapper before the tag (e.g. `]<]minimax[>[<tool_call ...`)
 *   - missing `</tool_call>` close (body captured up to the next tag or EOS)
 *
 * Returns the parsed calls plus a `malformed` flag: true when the text clearly
 * *intended* a tool call (a `<tool_call` fragment, or a known tool name wrapped
 * in a non-standard bracket) but none parsed cleanly. The caller uses this to
 * repair/re-prompt instead of leaking the raw text to the user as narration.
 */
function parseXmlToolCalls(
  content: string,
  knownToolNames: string[] = [],
): { calls: ToolCall[]; malformed: boolean } {
  const calls: ToolCall[] = [];
  // name may be quoted or bare; body optional; close may be `/>`, `>`, or a
  // separate `</tool_call>`. The prefix before `<tool_call` is ignored.
  const toolRegex =
    /<tool_call\s+name\s*=\s*"?([\w.-]+)"?\s*([^>]*?)(?:\/>|>([\s\S]*?)<\/tool_call>|>)/gi;
  let match: RegExpExecArray | null;
  while ((match = toolRegex.exec(content)) !== null) {
    const name = match[1];
    const attributesStr = match[2] || '';
    const bodyContent = match[3] || '';
    if (!name) continue;

    const argMap: Record<string, string> = {};
    const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
      argMap[attrMatch[1]] = attrMatch[2];
    }
    if (bodyContent.trim()) argMap['content'] = bodyContent.trim();

    calls.push({
      id: crypto.randomUUID(),
      name,
      arguments: JSON.stringify(argMap),
      status: 'running',
    });
  }

  // Detect a malformed tool-call *intent* the regex above failed to parse:
  // a literal `<tool_call` fragment, or a known tool name sitting inside a
  // suspicious bracket wrapper (the `]<]minimax[>[` class of leak).
  const hasFragment = /<tool_call/i.test(content);
  const bracketWrap = /[\]<\]\)\}>\s]{2,}/.test(content);
  const nameInWrap = knownToolNames.some(
    (n) => new RegExp('\b' + escapeRegExp(n) + '\b').test(content) && bracketWrap,
  );
  const malformed = calls.length === 0 && (hasFragment || nameInWrap);

  return { calls, malformed };
}

/** Escape a string for safe use inside a RegExp literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function AgentsView() {
  // Chat store
  const {
    sessions,
    projects,
    activeSessionId,
    searchQuery: sessionSearchQuery,
    createSession,
    removeSession,
    renameSession,
    autoTitleSession,
    duplicateSession,
    togglePinSession,
    toggleArchiveSession,
    setActiveSessionId,
    setSearchQuery: setSessionSearchQuery,
    setGoal,
    addMessage,
    updateMessage,
    createProject,
    removeProject,
    renameProject,
    setActiveProject,
    dynamicModels,
    updateDiscoveredModels,
  } = useChatStore();

  // Settings & Context
  const agents = useAgentStore((s) => s.agents);
  const providers = useSettingsStore((s) => s.providers);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const updateStatus = useSettingsStore((s) => s.updateStatus);
  const quitAndInstall = useSettingsStore((s) => s.quitAndInstall);
  const checkForUpdates = useSettingsStore((s) => s.checkForUpdates);
  const downloadUpdate = useSettingsStore((s) => s.downloadUpdate);
  const setActiveView = useSettingsStore((s) => s.setActiveView);
  const setActiveSection = useSettingsStore((s) => s.setActiveSection);
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const fileTree = useProjectStore((s) => s.fileTree);
  const openFolder = useProjectStore((s) => s.openFolder);
  const addMemory = useMemoryStore((s) => s.addEntry);
  const addTerminalSession = useTerminalStore((s) => s.addSession);

  // Auto-access ("trust mode") â€” uninterrupted agent access to the workspace.
  const autoAccessEnabled = useAutoAccessStore((s) => s.enabled);
  const autoAccessCommands = useAutoAccessStore((s) => s.commands);
  const autoAccessEdits = useAutoAccessStore((s) => s.edits);
  const setAutoAccessEnabled = useAutoAccessStore((s) => s.setEnabled);
  const setAutoAccessCommands = useAutoAccessStore((s) => s.setCommands);
  const setAutoAccessEdits = useAutoAccessStore((s) => s.setEdits);

  const projectName = projectRoot
    ? projectRoot.split(/[\\/]/).filter(Boolean).pop() || projectRoot
    : null;

  // Local state
  const [draft, setDraft] = useState('');

  // Per-session run state: the composer's Stop button and Working indicator
  // must only ever reflect the *active* chat, and each chat carries its own
  // queue + turn flags so two conversations can run in parallel.
  const runUI = useRunStore((s) => (activeSessionId ? s.ui[activeSessionId] : undefined));
  const isGenerating = runUI?.isGenerating ?? false;
  const turnStartAt = runUI?.turnStartedAt ?? null;
  const queuedItems = runUI?.queuedItems ?? [];

  const runOf = getRun;
  const setGen = (sid: string, v: boolean) => useRunStore.getState().setGenerating(sid, v);
  const setTurnStart = (sid: string, v: number | null) =>
    useRunStore.getState().setTurnStart(sid, v);
  const setQueue = (sid: string, q: QueuedItem[]) =>
    useRunStore.getState().setQueuedItems(sid, q);

  // Plan-then-act gate: when a plan is pending for the active chat,
  // the composer shows Approve / Discard instead of Send.
  const [planForced, setPlanForced] = useState(false);
  const [planning, setPlanning] = useState(false);
  const pendingPlan = usePlanStore((s) => (activeSessionId ? s.pending[activeSessionId] : undefined));

  // Default a fresh chat to whatever the user has actually configured in
  // Settings (not a hardcoded openai/gpt-4o that would fail without a key).
  const [activeProvider, setActiveProvider] = useState(() => pickDefaultProvider(providers));
  const [activeModel, setActiveModel] = useState(() =>
    defaultModelFor(pickDefaultProvider(providers), providers),
  );
  const [activeAgentId, setActiveAgentId] = useState('agent-architect');
  const [errorState, setErrorState] = useState<{
    message: string;
    statusText?: string;
  } | null>(null);

  // File Attachments
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState('');

  const handleSystemFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const filePath = (files[i] as any).path;
      if (filePath && !attachedFiles.includes(filePath)) {
        paths.push(filePath);
      }
    }
    if (paths.length > 0) {
      setAttachedFiles((prev) => [...prev, ...paths]);
    }
    e.target.value = '';
    setIsFilePickerOpen(false);
  };

  // Slash commands
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);

  // Auto-access popover + chat sidebar collapse
  const [isAutoAccessOpen, setIsAutoAccessOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Chat project groupings in the sidebar.
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => new Set());

  const toggleProjectCollapsed = (id: string) =>
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRenameProject = (id: string, current: string) => {
    setRenamingProjectId(id);
    setRenameValue(current);
  };
  const confirmRenameProject = (id: string) => {
    const name = renameValue.trim();
    if (name) renameProject(id, name);
    setRenamingProjectId(null);
    setRenameValue('');
  };
  const handleDeleteProject = (id: string, name: string) => {
    if (window.confirm(`Delete project "${name}"? Its conversations will become folder-less.`)) {
      removeProject(id);
    }
  };

  const copyConversationId = useCallback((id: string) => {
    const token = `@conv:${id}`;
    void navigator.clipboard?.writeText(token);
    toast.success('Conversation reference copied', 'Paste it into any chat to give the agent full context.');
  }, []);

  const copyTranscript = useCallback((id: string) => {
    const s = getSessionById(id);
    if (!s) return;
    const text = s.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const who = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'You' : m.role;
        return `### ${who}\n${(m.content || '').trim()}`;
      })
      .join('\n\n');
    void navigator.clipboard?.writeText(text);
    toast.success('Transcript copied', 'Conversation copied as plain text.');
  }, []);

  const shareSessionAsPdf = useCallback((id: string) => {
    const s = getSessionById(id);
    if (!s) return;
    const esc = (str: string) =>
      str.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string);
    const title = s.title || 'Conversation';
    const rows = s.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const who = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'You' : m.role;
        return `<div class="msg"><div class="who">${esc(who)}</div><div class="body">${esc(m.content || '').replace(/\n/g, '<br/>')}</div></div>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#111;line-height:1.55}
      h1{font-size:20px}.msg{margin:14px 0;padding:10px 12px;border:1px solid #e3e3e3;border-radius:8px}.who{font-weight:600;font-size:12px;text-transform:uppercase;color:#666;margin-bottom:4px}.body{white-space:pre-wrap;font-size:14px}
      @media print{body{margin:0}}</style></head><body><h1>${esc(title)}</h1>${rows}<script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Popup blocked', 'Allow popups to export the PDF.');
      return;
    }
    w.document.write(html);
    w.document.close();
  }, []);

  const generateConversationTitle = useCallback(
    async (id: string) => {
      const session = getSessionById(id);
      if (!session || !session.isAutoTitle || session.title) return;
      const nonSys = session.messages.filter((m) => m.role !== 'system');
      if (nonSys.length < 3) return;
      try {
        const history = chatHistoryToProviderMsgs(session.messages);
        const res = await complete(
          {
            model: activeModel,
            system:
              'Summarize the conversation into a single concise one-line title (max 50 characters). Capture what was done and discussed, not the first message verbatim. No quotes, no markdown.',
            messages: [{ role: 'user', content: JSON.stringify(history.slice(-8)) }],
            maxTokens: 48,
            temperature: 0,
          },
          { preferred: activeProvider as any },
        );
        const title = (res.content || '')
          .replace(/^["'\n]+|["'\n]+$/g, '')
          .trim()
          .slice(0, 60);
        if (title) autoTitleSession(id, title);
      } catch {
        /* ignore â€” will retry on the next completed turn */
      }
    },
    [activeProvider, activeModel],
  );

  /* ------------------------------------------------------------------ */
  /*  Plan-then-act gate â€” explore/ propose BEFORE mutating the
      workspace, and wait for the user to approve.                         */
  /* ------------------------------------------------------------------ */

  const looksLikeQuestion = (text: string): boolean => {
    const t = text.trim();
    if (/[??]/.test(t)) return true;
    return /^(what|why|how|who|when|where|can you explain|is there|do you know|explain|describe|what's|which|tell me)\b/i.test(
      t,
    );
  };

  /** Parse a model-produced numbered/bulleted list into step labels. */
  const parsePlanSteps = (text: string): string[] => {
    const out: string[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const m =
        line.match(/^(\d+)[.)-]\s+(.*)$/) || line.match(/^[-*]\s+(.*)$/);
      const label = m ? (m[2] ?? m[1] ?? '').trim() : line;
      if (label) out.push(label.slice(0, 200));
    }
    if (out.length === 0 && text.trim()) out.push(text.trim().slice(0, 200));
    return out;
  };

  /**
   * Draft an execution plan for `text` and stash it (per session). The agent
   * does NOT run yet â€” the composer shows Approve / Discard and the plan
   * is rendered in the Agent Canvas. On approve we re-run with the plan
   * injected as hidden context.
   */
  const generatePlan = async (text: string, files: string[]): Promise<void> => {
    if (!activeSessionId) return;
    const sid = activeSessionId;
    setPlanning(true);
    try {
      // Light environment grounding so the plan fits the real project.
      let env = '';
      if (projectRoot && window.aios) {
        try {
          const pkg = await window.aios.fs.readFile(projectRoot, 'package.json', { numbered: false });
          env += `\nProject package.json (excerpt):\n${pkg.slice(0, 1400)}`;
        } catch {
          /* no package.json */
        }
        try {
          const tree = await window.aios.fs.readTree(projectRoot);
          const top = tree
            .slice(0, 40)
            .map((n: ProjectFile) => (n.type === 'directory' ? `[dir] ${n.name}` : n.name))
            .join('\n');
          if (top) env += `\nFile tree (top-level):\n${top}`;
        } catch {
          /* no tree */
        }
      }

      const res = await complete(
        {
          model: activeModel,
          system:
            'You are a senior software engineer. Given a coding task and the project context, produce a concise, ordered execution plan as a numbered checklist. Each item = ONE concrete action (a file to read/edit/create, a command to run, or a check to verify). No prose preamble, no explanations. If the task is trivial, return a single step. Example:\n1. Read src/foo.ts to understand the current flow.\n2. Add a validate() helper that ...\n3. Wire validate() into the submit handler.\n4. Run npm test to confirm green.',
          messages: [
            {
              role: 'user',
              content: `Task:\n${text}${
                files.length ? `\n\nReferenced files: ${files.join(', ')}` : ''
              }\n\nProject context:${env || ' (no folder open)'}`,
            },
          ],
          temperature: 0.2,
          maxTokens: 800,
        },
        { preferred: activeProvider as any },
      );

      const planText = (res.content || '').trim();
      const steps = parsePlanSteps(planText).map((label, i) => ({
        id: `plan-step-${i}`,
        text: label,
        status: 'pending' as PlanStepStatus,
      }));

      useFollowPanelStore.getState().setPlan(`Plan: ${text.slice(0, 48)}`, steps);
      usePlanStore.getState().setPending(sid, {
        prompt: text,
        files,
        plan: steps,
        planText,
      });
    } catch {
      toast.error('Planning failed', 'Could not draft a plan â€” sending the task directly.');
      await submitTurn(text, files);
    } finally {
      setPlanning(false);
    }
  };

  const handleApprovePlan = () => {
    if (!activeSessionId) return;
    const pend = usePlanStore.getState().pending[activeSessionId];
    if (!pend) return;
    usePlanStore.getState().clearPending(activeSessionId);
    if (activeSessionId) runOf(activeSessionId).isSending = true;
    setDraft('');
    setAttachedFiles([]);
    // Re-run the original prompt with the approved plan injected as context.
    void submitTurn(pend.prompt, pend.files, pend.planText);
  };

  const handleDiscardPlan = () => {
    if (!activeSessionId) return;
    usePlanStore.getState().clearPending(activeSessionId);
    useFollowPanelStore.getState().clearPlan();
  };

  // Prompt history
  const [draftHistory, setDraftHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Thread scroll refs
  const threadEndRef = useRef<HTMLDivElement>(null);
  const autoAccessRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  // Scroll throttle guard.
  const scrollScheduled = useRef(false);

  // (Per-session in-flight turn is tracked in the run manager â€” see getRun().lastTurn.)

  // Live "thinking" timer tick â€” drives the per-second counter in the
  // Working indicator for whichever chat is currently generating.
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Collapsible "what it's doing" panel under the Working indicator.
  const [showWorkingDetail, setShowWorkingDetail] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  // "Follow Agent" keeps the UI synced to what the agent is doing live
  // (open the file it edits, surface the terminal for a command it runs).
  const [followAgent, setFollowAgent] = useState(false);

  // "Run with Fleet" â€” route this goal through the background Director, which
  // auto-assigns it across the specialised agents (Architect plans, CodeSmith
  // builds, â€¦) and threads shared + prior-agent context between them.
  const [fleetMode, setFleetMode] = useState(false);
  const panelCollapsed = useFollowPanelStore((s) => s.collapsed);
  // Fleet run progress (for the composer Stop button + pipeline strip).
  const orchestratorRunning = useOrchestratorStore((s) => s.isRunning);

  // Close the auto-access popover on outside click.
  useEffect(() => {
    if (!isAutoAccessOpen) return;
    const onDown = (e: MouseEvent) => {
      if (autoAccessRef.current && !autoAccessRef.current.contains(e.target as Node)) {
        setIsAutoAccessOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isAutoAccessOpen]);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Token/context stats for the most recent completed interaction â€” shown in the
  // subtle status bar under the composer (keeps raw numbers out of the bubbles).
  const contextStats = useMemo(() => {
    const contextWindow = getContextWindow(activeModel);
    if (!activeSession) return { tokens: null as number | null, contextWindow };
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      const m = activeSession.messages[i];
      if (m.role === 'assistant' && m.usage) {
        const tokens = (m.usage.inputTokens ?? 0) + (m.usage.outputTokens ?? 0);
        return { tokens, contextWindow };
      }
    }
    return { tokens: null as number | null, contextWindow };
  }, [activeSession, activeModel]);

  // Sync session's model/provider/agent with local select state when session switches
  useEffect(() => {
    if (activeSession) {
      setActiveModel(activeSession.model);
      setActiveProvider(activeSession.provider);
      setActiveAgentId(activeSession.activeAgentId);
      setErrorState(null);
    }
  }, [activeSessionId]);

  // Load the FULL model list on startup/provider switch. Works for every
  // provider (OpenAI, Anthropic, Ollama, OpenRouter/Groq/â€¦) by asking
  // the driver to fetch its live /models (or /api/tags) endpoint â€” free
  // and paid models together, no curated subset.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const models = await listProviderModels(activeProvider);
      if (!cancelled && models.length > 0) {
        updateDiscoveredModels(activeProvider, models);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProvider]);

  // Scroll to bottom helper (rAF-throttled so streaming deltas don't thrash layout).
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'auto') => {
    if (scrollScheduled.current) return;
    scrollScheduled.current = true;
    requestAnimationFrame(() => {
      scrollScheduled.current = false;
      threadEndRef.current?.scrollIntoView({ behavior });
    });
  };

  useEffect(() => {
    scrollToBottom('auto');
    return () => {
      isMounted.current = false;
    };
  }, [activeSessionId]);

  // "Follow Agent" â€” when enabled, keep the thread pinned to the newest
  // message so the view tracks the agent's live output. When disabled,
  // leave scrolling entirely to the user (no forced jumps).
  useEffect(() => {
    if (followAgent) scrollToBottom('auto');
  }, [activeSession?.messages.length, followAgent]);

  // Reset the Agent Canvas content when switching conversations (keeps the
  // collapse state and the global preview URL intact).
  useEffect(() => {
    if (activeSessionId) {
      useFollowPanelStore.getState().resetForSession(activeSessionId);
      setIsWarningDismissed(false);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setSpeakingMessageId(null);
    }
  }, [activeSessionId]);

  const activeAgent = useMemo(() => {
    return agents.find((a) => a.id === activeAgentId) || agents[0];
  }, [agents, activeAgentId]);

  // Merge runtime-discovered models, the provider's Settings models, and the
  // built-in fallbacks so the picker always reflects what Settings advertises.
  const modelOptions = useMemo(() => {
    const discovered = dynamicModels[activeProvider] || [];
    const fromSettings = providers.find((p) => p.id === activeProvider)?.models || [];
    const builtin = BUILTIN_MODELS[activeProvider] || [];
    const merged = [...new Set([...discovered, ...fromSettings, ...builtin])];
    return merged.length > 0 ? merged : [''];
  }, [activeProvider, dynamicModels, providers]);

  // Composer dropdown options ---------------------------------------------
  const providerDropdownOptions = useMemo<DropdownOption[]>(
    () =>
      providers.map((p) => {
        const needsKey = providerNeedsKey(p.id);
        const ready = !needsKey || !!getApiKey(p.id);
        return {
          value: p.id,
          label: p.name,
          description: needsKey ? (ready ? 'Key set' : 'Needs API key') : 'No key required',
          leading: <ProviderIcon id={p.id} name={p.name} size={18} />,
        };
      }),
    [providers],
  );

  const modelDropdownOptions = useMemo<DropdownOption[]>(
    () => modelOptions.map((m) => ({ value: m, label: m })),
    [modelOptions],
  );

  const agentDropdownOptions = useMemo<DropdownOption[]>(
    () =>
      agents.map((a) => ({
        value: a.id,
        label: a.name,
        description: ROLE_LABELS[a.role] ?? 'Agent',
        leading: <AgentAvatar role={a.role} size={26} glow={false} />,
      })),
    [agents],
  );

  // Working-project dropdown shown at the input corner.
  const projectDropdownOptions = useMemo<DropdownOption[]>(() => {
    const opts: DropdownOption[] = [];
    if (projectName) {
      opts.push({
        value: 'current',
        label: projectName,
        description: projectRoot || 'Current working project',
        leading: <Folder size={12} />,
      });
    }
    opts.push({
      value: '__open__',
      label: projectName ? 'Open different folderâ€¦' : 'Open folderâ€¦',
      description: 'Switch the assistantâ€™s working project',
      leading: <FolderOpen size={12} />,
    });
    return opts;
  }, [projectName, projectRoot]);

  const allWorkspaceFiles = useMemo(() => {
    return recursiveGetFiles(fileTree);
  }, [fileTree]);

  const filteredFiles = useMemo(() => {
    const query = fileFilter.toLowerCase().trim();
    if (!query) return allWorkspaceFiles.slice(0, 10);
    return allWorkspaceFiles.filter((f) => f.path.toLowerCase().includes(query)).slice(0, 10);
  }, [allWorkspaceFiles, fileFilter]);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    const q = sessionSearchQuery.toLowerCase().trim();
    return sessions.filter((s) => {
      const matchSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q));
      return matchSearch;
    });
  }, [sessions, sessionSearchQuery]);

  const unsortedSessions = useMemo(
    () => filteredSessions.filter((s) => !s.projectId),
    [filteredSessions],
  );

  const pinnedSessions = useMemo(() => filteredSessions.filter((s) => s.isPinned && !s.isArchived), [filteredSessions]);
  const activeSessions = useMemo(() => filteredSessions.filter((s) => !s.isPinned && !s.isArchived), [filteredSessions]);
  const archivedSessions = useMemo(() => filteredSessions.filter((s) => s.isArchived), [filteredSessions]);

  // Tool Executor Loop
  const executeLocalTool = async (
    name: string,
    args: Record<string, any>,
    sessionId?: string,
  ): Promise<string> => {
    // Permission matrix (Claude-Code-style): deny blocks, allow bypasses any
    // prompt, ask keeps the default gating (diff review for file writes).
    const permMode = usePermissionsStore.getState().getMode(name);
    if (permMode === 'deny') {
      throw new ToolRejectedError(
        `Tool "${name}" is disabled by your Tool Permissions settings (set to Deny). Do not retry unless the user changes the permission.`,
      );
    }
    const autoAllowed = permMode === 'allow';

    // `wait` is a pure timer â€” it needs no OS bridge and works in every mode
    // (including the web/demo build), so handle it before the aios guard.
    if (name === 'wait') {
      const seconds = Math.min(600, Math.max(1, Math.round(Number(args.seconds) || 5)));
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return `Waited ${seconds}s.`;
    }

    if (!window.aios) {
      throw new Error('OS bridge not available (requires AIOS desktop app).');
    }
    const root = projectRoot || '';

    switch (name) {
      case 'read_file': {
        const filePath = args.path;
        if (!filePath) throw new Error('Missing file path parameter.');
        const offset = typeof args.offset === 'number' ? args.offset : undefined;
        const limit = typeof args.limit === 'number' ? args.limit : undefined;
        return await window.aios.fs.readFile(root, filePath, { offset, limit });
      }
      case 'search_code': {
        const query = args.query;
        const isRegex = !!args.isRegex;
        if (!query) throw new Error('Missing query parameter.');
        const matches = await window.aios.fs.search(root, query, { isRegex, maxResults: 40 });
        if (!matches.length) return `No matches found for "${query}".`;
        const formatted = matches
          .slice(0, 40)
          .map((m) => `${m.path}:${m.line}:${m.preview}`)
          .join('\n');
        return `Found ${matches.length} match(es) for "${query}":\n${formatted}`;
      }
      case 'write_file': {
        const filePath = args.path;
        const content = args.content || '';
        if (!filePath) throw new Error('Missing file path parameter.');

        let original = '';
        try {
          original = await window.aios.fs.readFile(root, filePath, { numbered: false });
        } catch {
          original = '';
        }

        // Diff-review unless auto-apply is on, the permission is Allow, or the
        // user has enabled uninterrupted auto-access for edits.
        const autoAccessEdits =
          useAutoAccessStore.getState().enabled && useAutoAccessStore.getState().edits;
        if (!useDiffReviewStore.getState().autoApply && !autoAllowed && !autoAccessEdits) {
          const decision = await useDiffReviewStore.getState().requestApproval({
            id: crypto.randomUUID(),
            path: filePath,
            original,
            proposed: content,
          });
          if (decision === 'rejected') {
            throw new ToolRejectedError(`Edit to ${filePath} was rejected. Do not retry unless asked.`);
          }
        }

        const ok = await window.aios.fs.writeFile(root, filePath, content);
        if (!ok) throw new Error('Failed to write file after approval.');
        if (followAgent) {
          const name = filePath.split(/[\\/]/).pop() || filePath;
          useFollowPanelStore.getState().followFile({
            id: filePath,
            path: filePath,
            name,
            content,
            original,
          });
        }
        return `Successfully wrote ${content.length} characters to ${filePath}`;
      }
      case 'patch_file': {
        const filePath = args.path;
        const oldStr = args.old_str;
        const newStr = args.new_str;
        if (!filePath) throw new Error('Missing file path parameter.');
        if (oldStr === undefined || newStr === undefined) {
          throw new Error('Missing old_str or new_str parameters.');
        }

        let original = '';
        try {
          original = await window.aios.fs.readFile(root, filePath, { numbered: false });
        } catch (err: any) {
          throw new Error(`Could not read file for patching: ${err.message}`);
        }

        if (!original.includes(oldStr)) {
          throw new Error(`Could not find old_str in ${filePath}. Check if formatting or whitespace matches exactly.`);
        }

        const patched = original.replace(oldStr, newStr);

        const autoAccessEdits =
          useAutoAccessStore.getState().enabled && useAutoAccessStore.getState().edits;
        if (!useDiffReviewStore.getState().autoApply && !autoAllowed && !autoAccessEdits) {
          const decision = await useDiffReviewStore.getState().requestApproval({
            id: crypto.randomUUID(),
            path: filePath,
            original,
            proposed: patched,
          });
          if (decision === 'rejected') {
            throw new ToolRejectedError(`Patch to ${filePath} was rejected.`);
          }
        }

        const ok = await window.aios.fs.writeFile(root, filePath, patched);
        if (!ok) throw new Error('Failed to write patched file.');

        if (followAgent) {
          const name = filePath.split(/[\\/]/).pop() || filePath;
          useFollowPanelStore.getState().followFile({
            id: filePath,
            path: filePath,
            name,
            content: patched,
            original,
          });
        }

        return `Successfully patched ${filePath}`;
      }
      case 'append_file': {
        const filePath = args.path;
        const content = args.content || '';
        if (!filePath) throw new Error('Missing file path parameter.');

        let original = '';
        try {
          original = await window.aios.fs.readFile(root, filePath, { numbered: false });
        } catch {
          original = '';
        }

        const combined = original ? original + '\n' + content : content;

        const autoAccessEdits =
          useAutoAccessStore.getState().enabled && useAutoAccessStore.getState().edits;
        if (!useDiffReviewStore.getState().autoApply && !autoAllowed && !autoAccessEdits) {
          const decision = await useDiffReviewStore.getState().requestApproval({
            id: crypto.randomUUID(),
            path: filePath,
            original,
            proposed: combined,
          });
          if (decision === 'rejected') {
            throw new ToolRejectedError(`Append to ${filePath} was rejected.`);
          }
        }

        const ok = await window.aios.fs.writeFile(root, filePath, combined);
        if (!ok) throw new Error('Failed to append to file.');

        if (followAgent) {
          const name = filePath.split(/[\\/]/).pop() || filePath;
          useFollowPanelStore.getState().followFile({
            id: filePath,
            path: filePath,
            name,
            content: combined,
            original,
          });
        }

        return `Successfully appended content to ${filePath}`;
      }
      case 'list_dir': {
        const dirPath = args.path || '.';
        const files = await window.aios.fs.readTree(root);
        return JSON.stringify(files, null, 2);
      }
      case 'run_command': {
        const command = args.command;
        if (!command) throw new Error('Missing command parameter.');

        // Gate shell commands behind a single, clear approval popup the first
        // time the agent tries to run one. Permission policy still wins: 'deny'
        // blocks outright, 'allow' runs immediately. Once the user approves the
        // whole session â€” or switches on uninterrupted auto-access â€” we skip the
        // prompt for the remainder of the chat.
        const autoAccessCommands =
          useAutoAccessStore.getState().enabled && useAutoAccessStore.getState().commands;
        if (
          sessionId &&
          permMode !== 'allow' &&
          !autoAccessCommands &&
          !useCommandApprovalStore.getState().approvedSessions.includes(sessionId)
        ) {
          const decision = await useCommandApprovalStore.getState().requestApproval({
            id: crypto.randomUUID(),
            command,
            sessionId,
          });
          if (decision.decision === 'allow-session') {
            useCommandApprovalStore.getState().approveSession(sessionId);
          } else if (decision.decision === 'reject') {
            const note = decision.instruction?.trim();
            throw new ToolRejectedError(
              note
                ? `The command "${command}" was rejected by the user. They asked you to: ${note}`
                : `The command "${command}" was rejected by the user. Do not retry it unless they ask.`,
            );
          }
          // 'allow-once' falls through and runs.
        }

        // Capture output so the model can act on the result (Claude-Code-style
        // CLI loop). Falls back to opening a visible terminal tab when the
        // desktop shell bridge is unavailable (web / demo mode).
        if (window.aios?.shell?.exec) {
          const timeout = typeof args.timeout === 'number' ? args.timeout : undefined;
          const res = await window.aios.shell.exec(
            command,
            root || undefined,
            timeout ? { timeout } : undefined,
          );
          const out = (res.output || '').trim() || '(no output)';
          if (followAgent) {
            // Surface a dev server in the Agent Canvas preview when the command
            // prints a localhost URL (mirrors the terminal's live-preview detect).
            const urlMatch = out.match(
              /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i,
            );
            if (urlMatch) {
              useProjectStore.getState().setPreviewUrl(urlMatch[0]);
              useFollowPanelStore.getState().setActiveTab('preview');
            }
          }
          return `Ran: ${command}\nExit code: ${res.exitCode ?? 0}${
            res.error ? `\nError: ${res.error}` : ''
          }\n\nOutput:\n${out}`;
        }

        addTerminalSession({ initialCommand: command, name: `AI Run: ${command.slice(0, 15)}` });
        return `Successfully started command "${command}" in a new terminal tab (output capture unavailable in this mode).`;
      }
      case 'git_status': {
        const status = await window.aios.git.status(root);
        return JSON.stringify(status, null, 2);
      }
      case 'git_commit': {
        const msg = args.message;
        if (!msg) throw new Error('Missing commit message.');
        const hash = await window.aios.git.commit(root, msg);
        return `Successfully created git commit: ${hash}`;
      }
      case 'create_artifact': {
        const title = typeof args.title === 'string' ? args.title : 'Untitled';
        const type = (typeof args.type === 'string' ? args.type : 'doc') as ArtifactType;
        const content = typeof args.content === 'string' ? args.content : '';
        useFollowPanelStore.getState().addArtifact({ title, type, content });
        return `Artifact "${title}" (${type}) recorded in the Agent Canvas.`;
      }
      case 'update_plan': {
        const raw = Array.isArray(args.steps) ? (args.steps as any[]) : [];
        const steps: PlanStep[] = raw.map((s) => {
          if (typeof s === 'string') {
            return { id: crypto.randomUUID(), text: s, status: 'pending' as PlanStepStatus };
          }
          const obj = s as { text?: string; status?: string };
          return {
            id: crypto.randomUUID(),
            text: typeof obj.text === 'string' ? obj.text : '',
            status: (obj.status === 'active' || obj.status === 'done' ? obj.status : 'pending') as PlanStepStatus,
          };
        });
        const title = typeof args.title === 'string' ? args.title : 'Implementation Plan';
        useFollowPanelStore.getState().setPlan(title, steps);
        return `Plan updated with ${steps.length} step(s).`;
      }
      default:
        // External MCP tools are namespaced (mcp__<server>__<tool>); route them
        // to the MCP registry instead of treating them as unknown built-ins.
        if (name.startsWith('mcp__')) {
          return await executeMCPTool(name, args);
        }
        throw new Error(`Tool "${name}" is not supported.`);
    }
  };

  // ---------------------------------------------------------------
  //  Self-verification
  //  After a turn that mutated the workspace, optionally run a
  //  verification command and loop any failures back to the model
  //  so it self-corrects before the turn is declared done.
  // ---------------------------------------------------------------

  /** Freeze the thinking timer, record token usage, and close the turn. */
  const finalizeTurn = (sid: string, msgId: string) => {
    const durationMs =
      runOf(sid).turnStart != null ? Date.now() - runOf(sid).turnStart! : undefined;
    updateMessage(sid, msgId, { durationMs, usage: { ...runOf(sid).turnTokens } });
    runOf(sid).turnStart = null;
    setTurnStart(sid, null);
    setGen(sid, false);
    useFollowPanelStore.getState().clearLiveText();
    scheduleNext();
  };

  /** Pick a verification command when the user left verifyCommand empty. */
  const autoDetectVerifyCommand = async (root: string): Promise<string> => {
    if (!root || !window.aios?.fs) return 'npx tsc --noEmit';
    try {
      const raw = await window.aios.fs.readFile(root, 'package.json', { numbered: false });
      const pkg = JSON.parse(raw);
      const scripts = pkg.scripts || {};
      if (scripts.test) return 'npm test';
      if (scripts.typecheck) return 'npm run typecheck';
      if (scripts.build) return 'npm run build';
    } catch {
      /* no package.json or unreadable â€” fall through to default */
    }
    return 'npx tsc --noEmit';
  };

  /** Run the verification step (if enabled and the turn made changes),
   *  then finalize. On failure, feed the output back to the model and
   *  re-run the turn so it can fix the issues itself. */
  const runSelfVerification = async (
    sid: string,
    msgId: string,
    providerHistory: ProviderMessage[],
    compactLevel: number,
  ) => {
    const settings = useSettingsStore.getState().settings;
    const MAX_VERIFY_LOOPS = 3;

    if (!settings.verifyOnComplete || !runOf(sid).madeChanges) {
      finalizeTurn(sid, msgId);
      return;
    }
    if (runOf(sid).verifyAttempts >= MAX_VERIFY_LOOPS) {
      finalizeTurn(sid, msgId);
      return;
    }

    const root = projectRoot || '';
    const command = settings.verifyCommand?.trim() || (await autoDetectVerifyCommand(root));
    if (!command || !window.aios?.shell?.exec) {
      finalizeTurn(sid, msgId);
      return;
    }

    try {
      setGen(sid, true);
      const res = await window.aios.shell.exec(command, root || undefined);
      if ((res.exitCode ?? 0) === 0) {
        finalizeTurn(sid, msgId);
        return;
      }
      // Failure â†’ loop back to the model with the output as a user message.
      runOf(sid).madeChanges = false;
      runOf(sid).verifyAttempts = runOf(sid).verifyAttempts + 1;
      const out = (res.output || '').trim() || '(no output)';
      const feedback =
        `Self-verification failed (exit code ${res.exitCode ?? 0}). ` +
        `Inspect the output, fix the root cause in the workspace, then respond again.\n\n` +
        `Verification command: ${command}\n\n${out}`;
      addMessage(sid, {
        id: crypto.randomUUID(),
        agentId: activeAgentId,
        role: 'user',
        content: feedback,
        timestamp: Date.now(),
        status: 'complete',
      });
      runCompletionTurn(
        sid,
        [...providerHistory, { role: 'user', content: feedback }],
        0,
        undefined,
        '',
        [],
        compactLevel,
      );
    } catch {
      finalizeTurn(sid, msgId);
    }
  };

  const handleToolCalls = async (
    sessionId: string,
    messageId: string,
    toolCalls: ToolCall[],
    providerHistory: ProviderMessage[],
    nativeCalls: ProviderToolCall[] | null,
    toolRound: number,
    priorToolCalls: ToolCall[],
    currentText: string,
    compactLevel = 0,
  ) => {
    const updatedCalls = [...toolCalls];
    const toolResultMessages: ProviderMessage[] = [];
    const root = projectRoot || '';

    for (let i = 0; i < updatedCalls.length; i++) {
      const call = updatedCalls[i];
      const isFileEdit = call.name === 'write_file' || call.name === 'patch_file' || call.name === 'append_file';

      let diff: { path?: string; additions: number; deletions: number } | undefined = undefined;
      if (isFileEdit) {
        try {
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(call.arguments);
          } catch {
            const cleaned = call.arguments.replace(/'/g, '"');
            args = JSON.parse(cleaned);
          }
          const filePath = args.path || '';
          if (filePath) {
            let original = '';
            let proposed = '';
            try {
              original = await window.aios!.fs.readFile(root, filePath, { numbered: false });
            } catch {
              original = '';
            }
            if (call.name === 'write_file') {
              proposed = args.content || '';
            } else if (call.name === 'patch_file') {
              const oldStr = args.old_str || '';
              const newStr = args.new_str || '';
              proposed = original.includes(oldStr) ? original.replace(oldStr, newStr) : original;
            } else if (call.name === 'append_file') {
              const content = args.content || '';
              proposed = original ? original + '\n' + content : content;
            }
            diff = {
              path: filePath,
              ...computeLineDiff(original, proposed),
            };
          }
        } catch (e) {
          console.error("Diff pre-calculation failed:", e);
        }
      }

      updatedCalls[i] = {
        ...call,
        status: isFileEdit ? 'awaiting-approval' : 'running',
        diff,
      };
      updateMessage(sessionId, messageId, { toolCalls: [...priorToolCalls, ...updatedCalls] });

      try {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(call.arguments);
        } catch {
          const cleaned = call.arguments.replace(/'/g, '"');
          args = JSON.parse(cleaned);
        }

        const toolOutput = await executeLocalTool(call.name, args, sessionId);
        const patch: ToolCall = {
          ...call,
          status: 'success',
          output: toolOutput,
          diff: updatedCalls[i].diff,
        };

        // Track that this turn mutated the workspace so the self-verification
        // step at turn end knows there is something to verify.
        if (call.name === 'write_file' || call.name === 'run_command' || call.name === 'git_commit') {
          runOf(sessionId).madeChanges = true;
        }
        updatedCalls[i] = patch;
      } catch (err) {
        if (err instanceof ToolRejectedError) {
          updatedCalls[i] = { ...call, status: 'rejected', error: (err as Error).message };
        } else {
          updatedCalls[i] = { ...call, status: 'error', error: (err as Error).message };
        }
      }
      updateMessage(sessionId, messageId, { toolCalls: [...priorToolCalls, ...updatedCalls] });

      const statusNow = updatedCalls[i].status;
      const sig = `${call.name}::${call.arguments}`;
      const streak = runOf(sessionId).failedToolStreak;
      if (statusNow === 'success') {
        streak.sig = '';
        streak.count = 0;
      } else if (streak.sig === sig) {
        streak.count += 1;
      } else {
        streak.sig = sig;
        streak.count = 1;
      }

      const resultText =
        updatedCalls[i].status === 'success'
          ? updatedCalls[i].output || ''
          : updatedCalls[i].error || 'Tool failed.';
      toolResultMessages.push({
        role: 'tool',
        content: resultText,
        toolCallId: nativeCalls?.[i]?.id || call.id,
      });
    }

    const nextProviderHistory: ProviderMessage[] = [...providerHistory];

    if (nativeCalls) {
      nextProviderHistory.push({
        role: 'assistant',
        content: '',
        toolCalls: nativeCalls.map((c) => ({
          id: c.id,
          name: c.name,
          arguments: c.arguments,
        })),
      });
      nextProviderHistory.push(...toolResultMessages);
    } else {
      nextProviderHistory.push({ role: 'user', content: `Tool Execution Results:\n${updatedCalls
        .map((c) => `Tool: ${c.name}\nStatus: ${c.status}\nOutput: ${c.output || c.error}\n---`)
        .join('\n')}` });
    }

    const backoff = 400 * Math.min(runOf(sessionId).failedToolStreak.count, 8);
    const merged = [...priorToolCalls, ...updatedCalls];
    setTimeout(() => {
      // A successful tool round resets the malformed-tool-call repair counter.
      runCompletionTurn(sessionId, nextProviderHistory, toolRound + 1, messageId, currentText, merged, compactLevel, 0);
    }, backoff);
  };

  // Turn Runner
  const runCompletionTurn = async (
    sessionId: string,
    providerHistory: ProviderMessage[],
    toolRound = 0,
    assistantMsgId?: string,
    priorText = '',
    priorToolCalls: ToolCall[] = [],
    compactLevel = 0,
    toolRepairAttempts = 0,
  ) => {
    setGen(sessionId, true);
    runOf(sessionId).isSending = false;
    setErrorState(null);

    // Remember this attempt so a manual "Retry Turn" can resume it exactly where
    // it broke (preserving already-executed tool work) rather than restarting.
    runOf(sessionId).lastTurn = {
      sessionId,
      providerHistory,
      toolRound,
      assistantMsgId,
      priorText,
      priorToolCalls,
      compactLevel,
    };

    // Start the "thinking" clock and reset the per-turn token tally on the
    // first round of a fresh turn (tool-round continuations keep the same clock).
    if (toolRound === 0) {
      const startedAt = Date.now();
      runOf(sessionId).turnStart = startedAt;
      setTurnStart(sessionId, startedAt);
      runOf(sessionId).turnTokens = { inputTokens: 0, outputTokens: 0 };
      runOf(sessionId).madeChanges = false;
      // NOTE: verifyAttempts is reset only at a genuine turn start (submitTurn),
      // not here, so it survives the self-verification re-runs of this same turn.
      useFollowPanelStore.getState().clearLiveText();
    }

    const controller = new AbortController();
    runOf(sessionId).controller = controller;

    const msgId = assistantMsgId ?? crypto.randomUUID();
    let accumulatedText = priorText;
    let lastFlushRef = { current: 0 } as { current: number };
    let started = Boolean(assistantMsgId);

    // Eagerly create the assistant bubble for a fresh turn so the user always
    // sees a response. Some providers (under the forced tool-choice the agent
    // loop requires) stream a tool-only payload with no text delta â€” if we
    // waited for the first content delta to spawn the bubble, the reply would
    // be silently dropped and the turn would end with "working" but no message.
    if (!started) {
      started = true;
      addMessage(sessionId, {
        id: msgId,
        agentId: activeAgentId,
        role: 'assistant',
        content: accumulatedText,
        timestamp: Date.now(),
        status: 'streaming',
      });
    }

    const ensureMsgBubble = (text: string) => {
      if (started) {
        updateMessage(sessionId, msgId, { content: text });
      }
    };

    // Native tool schemas are sent to the provider; the XML doc is a fallback
    // for models/drivers without native tool-calling support.
    const platform =
      typeof navigator !== 'undefined' ? navigator.platform || 'unknown OS' : 'unknown OS';
    const aa = useAutoAccessStore.getState();

    // Inject relevant project memories as hard operating rules
    const memoryEntries = useMemoryStore.getState().entries;
    const relevantMemories = memoryEntries
      .filter((m) => m.importance === 'high' || m.importance === 'critical')
      .slice(0, 8)
      .map((m) => `- [${m.category.toUpperCase()}] ${m.title}: ${m.content}`)
      .join('\n');
    const memoryRules = relevantMemories
      ? `\n# Project Memory Rules (must follow)\n${relevantMemories}\n`
      : '';

    const runtimeContext = `

# Operating Environment
You are running inside AIOS, an agentic coding OS. You act on the user's real workspace through tools â€” not by describing actions you never took.
- Agent identity: ${activeAgent.name} (role: ${activeAgent.role})
- Provider / model serving this session: ${activeProvider} / ${activeModel}
  â†’ If the user asks which model you are, answer exactly "${activeModel}" (served by ${activeProvider}). Never claim to be Claude, GPT, or any other model.
- Operating system: ${platform}
- Working directory (project root): ${projectRoot || '(none â€” open a folder to act on files)'}
- Active workspace project: ${projectName || '(none)'}
- Auto-access (trust mode): ${aa.enabled ? 'ON â€” you may run shell commands and write/edit files directly without per-step approval' : 'OFF â€” mutating tools wait for the userâ€™s approval; read-only tools run automatically'}${activeSession?.goal ? `\n- Goal for this conversation: ${activeSession.goal}\n  â†’ Every action you take should move this objective forward. If a request conflicts with the goal, flag it.` : ''}
${memoryRules}

# How You Operate
1. Act with tools, don't narrate. When the task requires reading, searching, editing, or running something in the workspace, CALL THE TOOL. Never describe an action in text and claim it is done. Only say a file was written, a command ran, or a change was applied AFTER the tool call returns success. If a tool fails or is rejected, say so honestly and either retry once with corrected arguments or ask the user â€” never pretend it succeeded.
2. Finish the job. Keep using tools until the user's request is fully satisfied. Don't stop early. If you genuinely cannot proceed, explain the blocker concretely and tell the user exactly what they need to do.
3. Be economical. No "Sure!", no restating the task, no long summaries. Prefer short sentences, bullet points, and code.
4. One response, one voice. Reply exactly once per turn, in a single consistent tone that fits your agent role. Do not repeat yourself, and do not give the same answer in two different styles or voices.
5. One path. Prefer the native tool-calling interface. Do not both call a tool AND narrate the same action as text.
6. Close every turn by calling the respond_to_user tool with a brief status: what you completed, what (if anything) remains, and any blockers/decisions. Keep it short â€” a few bullets, not a wall of text. This is how the user (and your later self, on the next turn) tracks progress without re-running tools. Never end a turn with bare narration â€” always route your reply through respond_to_user.

# Agent Canvas
The user watches a live **Agent Canvas** panel beside this chat. Keep it oriented:
- For any multi-step task, FIRST call \`create_artifact\` with type "plan" (or \`update_plan\`) to lay out a checklist of todos. Then advance each step (pending â†’ active â†’ done) with \`update_plan\` as you work.
- Call \`create_artifact\` for any deliverable worth keeping beyond the transcript: a spec, doc, design notes, diagram, or code snippet.
- File edits are shown in the canvas automatically (do not describe them), and a dev server you start appears there as a live preview. Use the canvas to structure work â€” not to narrate.

# Choosing a Tech Stack (do NOT default to one)
Match the task, never a favourite stack. You have no house framework.
- Working in an existing project: detect the current stack first (read package.json / requirements.txt / go.mod / Cargo.toml / etc. and the file tree) and follow the conventions already there. Do not introduce React, Three.js, Tailwind, or any new framework/library unless the user asks or the project already uses it.
- Starting something new: pick the SIMPLEST thing that satisfies what was actually requested. A static page is plain HTML/CSS/JS; a CLI is a single script; a script is a script. Only reach for React (or any SPA framework) when the request truly calls for it, and only add 3D/Three.js/WebGL when the user explicitly wants 3D or animation.
- If the desired language or framework is genuinely ambiguous for a non-trivial new project, ask one short clarifying question (or state the minimal stack you're about to use) before scaffolding â€” don't assume React + Three.js.`;

    // Built-in tools plus any enabled MCP server tools, so external
    // integrations are callable from the chat composer too.
    const activeTools = await getActiveToolDefinitions().catch(() => AGENT_TOOLS);

    const systemPromptWithTools = `${activeAgent.systemPrompt}${runtimeContext}

You can act on the workspace using the provided tools. Only invoke tools when you need to read, search, edit, or run something in the workspace.

# Tool-call format (STRICT â€” read carefully)
You MUST emit tool calls in EXACTLY this XML form, with NO surrounding wrapper, NO prefix, and NO commentary around the tag:
  <tool_call name="tool_name" arg1="value" arg2="value"/>
When a tool takes a free-form body (e.g. file contents), put it between the tags:
  <tool_call name="tool_name" arg="value">body text here</tool_call>
Rules:
- The tag name is literally \`<tool_call\` (lowercase, with the underscore). Do NOT wrap it in other brackets, arrows, or markers (e.g. never \`]<]...[>[<tool_call\`).
- The \`name\` attribute is required and MUST be double-quoted.
- Emit ONE tool call (or a short sequence of them) per turn, then call \`respond_to_user\`. Do not narrate the command as plain text â€” the tool call IS the action.
- Any deviation from this exact format will NOT be executed and will be treated as an error; you will be asked to re-issue it correctly.

Available tools:
${toolsToXmlPromptDoc(activeTools)}`;

    try {
      const res = await complete(
        {
          model: activeModel,
          system: systemPromptWithTools,
          messages: capProviderHistory(providerHistory, compactLevel),
          temperature: activeAgent.temperature,
          maxTokens: activeAgent.maxTokens || 4096,
          tools: activeTools,
        },
        {
          preferred: activeProvider as any,
          strict: true,
          signal: controller.signal,
          onDelta: (delta) => {
            accumulatedText += delta;
            // Throttle store writes during streaming. Writing the full chat
            // store on EVERY token delta re-renders the whole app shell and
            // (via persist) serialises all sessions to localStorage per token
            // — the main cause of the UI freezing mid-response. Flush at most
            // ~10x/sec; a final flush happens when the turn completes.
            const now = performance.now();
            if (now - lastFlushRef.current >= 100) {
              lastFlushRef.current = now;
              ensureMsgBubble(accumulatedText);
              useFollowPanelStore.getState().setLiveText(accumulatedText);
            }
            scrollToBottom();
          },
        },
      );

      // Final flush of any text streamed since the last throttled write,
      // so the completed message always contains the full response.
      lastFlushRef.current = 0;
      ensureMsgBubble(accumulatedText);
      useFollowPanelStore.getState().setLiveText(accumulatedText);
      // Prefer native tool calls; fall back to parsing <tool_call> XML tags.
      const nativeCalls = res.toolCalls && res.toolCalls.length > 0 ? res.toolCalls : null;
      const parsed = nativeCalls
        ? { calls: nativeToToolCalls(nativeCalls), malformed: false }
        : parseXmlToolCalls(res.content, activeTools.map((t) => t.name));
      const toolCalls: ToolCall[] = parsed.calls;

      // The model emitted something that *looks* like a tool call but did not
      // parse into a valid call (malformed XML / wrong wrapper / stray prefix
      // such as `]<]minimax[>[<tool_call ...`). Do NOT leak that raw text to the
      // user as narration â€” repair by re-prompting with the exact required
      // format and retrying (bounded), so a weak tool-calling model gets a
      // second chance before we give up.
      if (toolCalls.length === 0 && parsed.malformed && toolRepairAttempts < MAX_TOOL_REPAIR) {
        const repairNote =
          'Your last message was NOT a valid tool call and was ignored. You MUST emit EXACTLY this format with no extra wrapper, prefix, or commentary:\n' +
          '<tool_call name="tool_name" arg="value"/>\n' +
          'or, when the tool takes a body:\n' +
          '<tool_call name="tool_name">body text here</tool_call>\n' +
          'Re-issue your intended tool call now and output nothing else.';
        providerHistory.push({ role: 'user', content: repairNote });
        runCompletionTurn(
          sessionId,
          providerHistory,
          toolRound,
          assistantMsgId,
          priorText,
          priorToolCalls,
          compactLevel,
          toolRepairAttempts + 1,
        );
        return;
      }

      const mergedToolCalls = [...priorToolCalls, ...toolCalls];

      // Empty-but-successful response: the provider streamed a 200 with neither
      // text nor tool calls. Under `tool_choice: required` the model MUST emit a
      // tool call, so an empty payload almost always means the provider
      // truncated the request (context overflow it didn't surface as a 400) or
      // dropped the stream. Treat it like the 400-overflow path: tighten the
      // history window and retry, instead of handing the user a dead-end
      // "empty response" placeholder. Only give up once every compact level
      // has been tried.
      if (!res.content.trim() && toolCalls.length === 0) {
        if (compactLevel < PROVIDER_MSG_CAP.length - 1) {
          runCompletionTurn(
            sessionId,
            providerHistory,
            toolRound,
            assistantMsgId,
            priorText,
            priorToolCalls,
            compactLevel + 1,
            toolRepairAttempts,
          );
          return;
        }
        updateMessage(sessionId, msgId, {
          content:
            '_(The model returned an empty response â€” the request was likely truncated after a long run. Try starting a fresh session or shortening the task.)_',
          status: 'complete',
          toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
        });
        void generateConversationTitle(sessionId);
        void runSelfVerification(sessionId, msgId, providerHistory, compactLevel);
        return;
      }

      // If the model chose to respond to the user (final answer / summary /
      // "done") instead of taking another workspace action, surface that message
      // and end the turn. Under forced tool choice the model can NEVER end a
      // turn with bare narration â€” it must either call an action tool or this.
      const respondCall = toolCalls.find((c) => c.name === 'respond_to_user');
      if (respondCall) {
        let msg = '';
        try {
          const args = JSON.parse(respondCall.arguments || '{}');
          msg = typeof args.message === 'string' ? args.message : '';
        } catch {
          /* ignore malformed args */
        }
        const displayCalls = mergedToolCalls.filter((c) => c.name !== 'respond_to_user');
        const finalMsg =
          (msg || accumulatedText).trim() ||
          (displayCalls.length > 0
            ? '_(completed tool actions â€” see above)_'
            : '_(The model returned an empty response. Try rephrasing, or switch the model.)_');
        updateMessage(sessionId, msgId, {
          content: finalMsg,
          status: 'complete',
          toolCalls: displayCalls.length > 0 ? displayCalls : undefined,
        });
        void generateConversationTitle(sessionId);
        // If the model declared the task done but the turn mutated the
        // workspace, run self-verification before finalizing.
        void runSelfVerification(sessionId, msgId, providerHistory, compactLevel);
        return;
      }

      // Tally token usage for this round (estimate output from text when the
      // provider doesn't report usage, so the context bar is never blank).
      const rtTokens = runOf(sessionId).turnTokens;
      rtTokens.inputTokens += res.usage?.inputTokens ?? 0;
      rtTokens.outputTokens +=
        res.usage?.outputTokens ?? Math.ceil((res.content?.length ?? 0) / 4);

      // Derive a smart one-line summary title once the thread has enough
      // context. generateConversationTitle waits for ~3 messages, then asks the
      // model for a summary (and respects a manual rename via isAutoTitle).
      void generateConversationTitle(sessionId);

      // Some providers return a tool-only / empty payload (notably right after a
      // mid-session model switch, where the new model streams a tool call with
      // no text). Keep the bubble visible with a short note instead of a blank
      // message so the user always gets feedback that the turn ran.
      const finalContent =
        accumulatedText.trim() ||
        (mergedToolCalls.length > 0
          ? '_(completed tool actions â€” see above)_'
          : '_(The model returned an empty response. Try rephrasing, or switch the model.)_');

      // Update turn status â€” keep one assistant bubble for the whole task.
      updateMessage(sessionId, msgId, {
        content: finalContent,
        status: 'complete',
        toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
      });

      // Save memories if important
      if (
        res.content.toLowerCase().includes('conventions') ||
        res.content.toLowerCase().includes('decision') ||
        res.content.toLowerCase().includes('lessons learned')
      ) {
        addMemory({
          id: crypto.randomUUID(),
          category: 'decisions',
          title: `Decision from session ${activeSession?.title || 'Chat'}`,
          content: res.content.slice(0, 300),
          tags: ['assistant-extracted', activeAgent.role],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: activeAgent.name,
          importance: 'medium',
        });
      }

      if (toolCalls.length > 0) {
        await handleToolCalls(sessionId, msgId, toolCalls, providerHistory, nativeCalls, toolRound, priorToolCalls, accumulatedText, compactLevel);
      } else {
        // Final round of the turn: if the workspace was mutated, run the
        // self-verification step (which finalizes the turn when it passes or
        // loops failures back to the model to fix).
        void runSelfVerification(sessionId, msgId, providerHistory, compactLevel);
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        runOf(sessionId).turnStart = null;
        setTurnStart(sessionId, null);
        setGen(sessionId, false);
        runOf(sessionId).isSending = false;
        // Finalize the (eagerly created) bubble so it doesn't stay stuck in
        // the "streaming" state with no content after a manual stop.
        updateMessage(sessionId, msgId, {
          status: 'complete',
          content: accumulatedText || '_(stopped)_',
        });
        return;
      }
      // Context overflow is reported by many OpenAI-compatible providers as a
      // generic 400 `invalid_request_error`. Instead of failing the whole task,
      // retry the same turn with a tighter history window (and keep tightening
      // up to the most aggressive level) before giving up.
      const errMsg = err?.message || '';
      // Many providers (especially OpenAI-compatible / custom gateways) return a
      // generic 400 with no "context length" wording â€” e.g. "Provider error 400:
      // Provider returned error". A bare 400 on a request that previously worked
      // (i.e. the format is valid) is, in practice, a context-window overflow, so
      // treat HTTP 400 as an overflow signal and tighten the history. Genuine
      // format/400 errors will simply fail again at the tightest level and then
      // surface the real error.
      const isContextOverflow =
        err?.status === 400 ||
        /context length|maximum context|exceeded.{0,12}context|too many tokens|token.{0,6}limit|input.{0,12}too long|invalid_request_error|bad request|request (?:too large|entity too large)|provider returned error|provider error|\b400\b/i.test(
          errMsg,
        );
      if (isContextOverflow && compactLevel < PROVIDER_MSG_CAP.length - 1) {
        runCompletionTurn(
          sessionId,
          providerHistory,
          toolRound,
          assistantMsgId,
          priorText,
          priorToolCalls,
          compactLevel + 1,
          toolRepairAttempts,
        );
        return;
      }
      runOf(sessionId).turnStart = null;
      setTurnStart(sessionId, null);
      setGen(sessionId, false);
      runOf(sessionId).isSending = false;
      useFollowPanelStore.getState().clearLiveText();
      setErrorState({
        message: err.message || 'An error occurred during completion.',
        statusText: err.status ? `HTTP ${err.status}` : 'Request failed',
      });
      // Set error flag on streaming message if spawned
      if (started) {
        updateMessage(sessionId, msgId, { status: 'error' });
      }
      scheduleNext();
    }
  };

  /**
   * Core send. Returns true if a turn was actually scheduled (so the send lock
   * can be held until generation begins), false if it bailed early (e.g. missing
   * API key) â€” in which case the lock must be released by the caller.
   */
  const submitTurn = async (
    text: string,
    files: string[],
    planText?: string,
  ): Promise<boolean> => {
    if (activeSessionId) runOf(activeSessionId).isSending = true;
    try {
      // `/goal <objective>` sets the conversation objective without sending a
      // standalone message â€” it's stored on the session and injected as context.
      const goalMatch = text.match(/^\/goal\s+([\s\S]+)$/);
      if (goalMatch) {
        const goal = goalMatch[1].trim();
        let sid = activeSessionId;
        if (!sid) {
          sid = createSession(activeAgentId, activeProvider, activeModel, 'New Conversation');
        }
        setGoal(sid, goal);
        setGen(sid, false);
        runOf(sid).isSending = false;
        toast.success('Goal set', goal);
        return false;
      }

      // Honour the selected provider: if it authenticates with a key and none is
      // configured, surface a clear, actionable error instead of firing a request
      // that would fail (or, previously, silently reroute to Ollama).
      if (providerNeedsKey(activeProvider) && !getApiKey(activeProvider)) {
        const providerName =
          providers.find((p) => p.id === activeProvider)?.name ?? activeProvider;
        setErrorState({
          statusText: 'API key required',
          message: `No API key is configured for ${providerName}. Add it in Settings â†’ AI Providers, or switch to a local/offline provider.`,
        });
        return false;
      }

      let finalSessionId = activeSessionId;

      // Attach file contents context block â€” kept out of the visible bubble and
      // fed to the model only (see `hidden` on the message).
      let fileContextBlock = '';
      if (files.length > 0) {
        fileContextBlock += '\n\n=== Referencing Files ===\n';
        for (const f of files) {
          let content = useProjectStore.getState().fileContents[f] || '';
          if (!content) {
            try {
              if (window.aios) {
                content = await window.aios.fs.readFile(projectRoot || '', f, { numbered: false });
              } else {
                content = `(File reading not supported in browser environment: ${f})`;
              }
            } catch (err: any) {
              content = `(Error reading file: ${err.message || String(err)})`;
            }
          }
          fileContextBlock += `\nFile path: ${f}\n\`\`\`\n${content}\n\`\`\`\n`;
        }
      }

      // Auto-retrieve relevant project context (lexical; offline, no API cost).
      // Stays hidden from the thread and is sent to the model as background.
      let contextBlock = '';
      if (projectRoot && text) {
        try {
          const ctx = await gatherContext({ query: text, projectRoot, fileTree, maxChunks: 8 });
          if (ctx) contextBlock = `\n\n=== Auto-retrieved Project Context ===\n${ctx}`;
        } catch {
          contextBlock = '';
        }
      }

      // Background context that travels to the model but is never shown to the user.
      // "Copy conversation ID" produces a `@conv:<id>` token. When the user pastes
      // it into any chat, expand it to that conversation's full transcript and feed
      // it as hidden context so the agent gets the complete prior context.
      let referencedContext = '';
      const convRefs = [...text.matchAll(/@conv:([0-9a-fA-F-]+)/g)].map((m) => m[1]);
      for (const refId of convRefs) {
        const ref = getSessionById(refId);
        if (!ref) continue;
        const transcript = ref.messages
          .filter((m) => m.role !== 'system')
          .map((m) => {
            const who = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'You' : m.role;
            return `### ${who}\n${(m.content || '').trim()}`;
          })
          .join('\n\n');
        referencedContext += `\n\n=== Referenced Conversation (${ref.title || ref.id}) ===\n${transcript}`;
      }

      const planBlock = planText
        ? `\n\n=== Approved Execution Plan (follow it step by step) ===\n${planText}`
        : '';

      const hiddenContext = (fileContextBlock + contextBlock + referencedContext + planBlock).trim() || undefined;

      // Create session if none is selected â€” seed it with a smart title derived
      // from the first prompt (and the working project), not the raw text.
      if (!finalSessionId) {
        finalSessionId = createSession(
          activeAgentId,
          activeProvider,
          activeModel,
          generateSmartTitle(text, projectName),
        );
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        agentId: 'user',
        role: 'user',
        content: text,
        timestamp: Date.now(),
        files: files.length > 0 ? [...files] : undefined,
        hidden: hiddenContext,
      };

      // Save prompt to draft history
      setDraftHistory((prev) => [text, ...prev.slice(0, 49)]);
      setHistoryIndex(-1);

      addMessage(finalSessionId, userMessage);

      // Fresh turn â€” reset the runaway-failure detector and the
      // self-verification attempt counter.
      runOf(finalSessionId).failedToolStreak = { sig: '', count: 0 };
      runOf(finalSessionId).verifyAttempts = 0;

      // Retrieve full updated session history
      const sessionHistory =
        useChatStore.getState().sessions.find((s) => s.id === finalSessionId)?.messages || [];

// Trigger Turn
       runCompletionTurn(finalSessionId!, buildProviderHistory(sessionHistory), 0);
      return true;
    } catch {
      return false;
    }
  };

  /** Release the next queued message once the agent is free (after a breather). */
  // Promote the head of the queue into a real turn (only when the agent is
  // free), then schedule the next item. Re-arms itself while the agent is busy.
  const promoteHead = () => {
    if (!activeSessionId) return;
    const run = runOf(activeSessionId);
    const head = run.queue[0];
    if (!head) return;
    const busy = useRunStore.getState().ui[activeSessionId]?.isGenerating || run.isSending;
    if (busy) {
      run.scheduleTimer = window.setTimeout(promoteHead, 300);
      return;
    }
    const started = submitTurn(head.text, head.files);
    if (!started) run.isSending = false;
    const next = run.queue.filter((it) => it.id !== head.id);
    run.queue = next;
    setQueue(activeSessionId, next);
    scheduleNext();
  };

  const scheduleNext = () => {
    if (!activeSessionId) return;
    const run = runOf(activeSessionId);
    if (run.scheduleTimer != null) {
      window.clearTimeout(run.scheduleTimer);
      run.scheduleTimer = null;
    }
    const head = run.queue[0];
    if (!head) return;
    const busy = useRunStore.getState().ui[activeSessionId]?.isGenerating || run.isSending;
    if (busy) {
      run.scheduleTimer = window.setTimeout(scheduleNext, 300);
      return;
    }
    // Stamp the head with its promotion time so the UI can show a live countdown.
    if (head.promoteAt == null) {
      const next = [{ ...head, promoteAt: Date.now() + QUEUE_COOLDOWN }, ...run.queue.slice(1)];
      run.queue = next;
      setQueue(activeSessionId, next);
    }
    run.scheduleTimer = window.setTimeout(promoteHead, QUEUE_COOLDOWN);
  };

  const enqueueMessage = (text: string, files: string[]) => {
    if (!activeSessionId) return;
    const item: QueuedItem = { id: crypto.randomUUID(), text, files, promoteAt: null };
    const next = [...runOf(activeSessionId).queue, item];
    runOf(activeSessionId).queue = next;
    setQueue(activeSessionId, next);
    scheduleNext();
  };


  /**
   * Resolve the best Groq audio-transcription model at request time.
   * Groq exposes its model catalogue via the OpenAI-compatible /models
   * endpoint; we filter for Whisper-style transcription models and prefer
   * the largest/fastest generally-available one. Falls back to a known-good
   * model id if the live list is unreachable or returns nothing.
   */
  const pickGroqTranscriptionModel = async (key: string): Promise<string> => {
    const FALLBACK = 'whisper-large-v3';
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return FALLBACK;
      const data = await res.json();
      const ids: string[] = (data?.data ?? [])
        .map((m: any) => m?.id ?? '')
        .filter((id: string) => /whisper/i.test(id));
      if (ids.length === 0) return FALLBACK;
      const rank = (id: string) => {
        if (id.includes('large-v3-turbo')) return 0;
        if (id.includes('large-v3')) return 1;
        if (id.includes('distil')) return 2;
        return 3;
      };
      ids.sort((a, b) => rank(a) - rank(b));
      return ids[0];
    } catch {
      return FALLBACK;
    }
  };

  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    const getApiKeyAsync = async (p: string): Promise<string | null> => {
      const cached = getApiKey(p);
      if (cached) return cached;
      if (typeof window !== 'undefined' && window.aios) {
        try {
          const val = await window.aios.secrets.get(p);
          if (val && val.trim().length >= 12 && !val.includes('xxxx') && !val.includes('...')) {
            return val.trim();
          }
        } catch {}
      }
      return null;
    };

    const groqKey = await getApiKeyAsync('groq');
    const openaiKey = await getApiKeyAsync('openai');
    const geminiKey = (await getApiKeyAsync('gemini')) || (await getApiKeyAsync('google')) || (await getApiKeyAsync('openrouter'));

    if (!groqKey && !openaiKey && !geminiKey) {
      // No cloud key configured â€” fall back to the OS-native offline engine
      // (Windows SAPI dictation) so the mic still works with zero setup.
      return localTranscribe();
    }

    const blobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const base64 = base64data.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    // 1. Try Groq Whisper (blazing fast and free developer tier).
    // Pick the best available transcription model dynamically instead of
    // hardcoding it, so we survive renames/deprecations. Falls back to a
    // known-good model if the live list can't be fetched.
    if (groqKey) {
      try {
        const groqModel = await pickGroqTranscriptionModel(groqKey);
        const formData = new FormData();
        formData.append('file', audioBlob, 'speech.webm');
        formData.append('model', groqModel);
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
          },
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          return data.text || '';
        }
      } catch (e) {
        console.error("Groq Whisper transcription failed:", e);
      }
    }

    // 2. Try Gemini Multimodal (completely free and costless developer tier)
    if (geminiKey) {
      try {
        const base64Audio = await blobToBase64(audioBlob);
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'audio/webm',
                      data: base64Audio,
                    },
                  },
                  {
                    text: 'Transcribe this audio exactly. Do not add any introductory or explanatory text. Just return the spoken words.',
                  },
                ],
              },
            ],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return candidateText.trim();
        }
      } catch (e) {
        console.error("Gemini transcription failed:", e);
      }
    }

    // 3. Try OpenAI Whisper (paid fallback)
    if (openaiKey) {
      const formData = new FormData();
      formData.append('file', audioBlob, 'speech.webm');
      formData.append('model', 'whisper-1');
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        return data.text || '';
      }
    }

    // All cloud providers failed (or were unavailable) â€” try the offline
    // OS-native engine as a last resort before giving up.
    try {
      const local = await localTranscribe();
      if (local && local.trim().length > 0) return local;
    } catch (le) {
      console.error("Local transcription fallback failed:", le);
    }

    throw new Error("Speech transcription failed. Please verify your Gemini or Groq API keys in Settings, or use a Windows PC for offline dictation.");
  };

  /**
   * Offline, OS-native transcription via the electron main process
   * (Windows SAPI dictation). Used when no cloud API key is configured or
   * when every cloud provider fails. Returns "" if nothing was recognized.
   */
  const localTranscribe = async (): Promise<string> => {
    if (typeof window === 'undefined' || !window.aios || !window.aios.stt) {
      throw new Error("Offline speech recognition is not available in this build.");
    }
    const res = await window.aios.stt.transcribe();
    if (res && res.ok && res.text) return res.text;
    // Non-fatal: surface a helpful message but don't crash the mic flow.
    throw new Error(res?.error || "Offline speech recognition did not return any text.");
  };

  const toggleSpeechRecognition = () => {
    try {
      if (isRecording) {
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
      } else {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then((stream) => {
            const mediaRecorder = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
              }
            };

            mediaRecorder.onstop = async () => {
              const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              
              // Stop all audio tracks in the stream to release the mic
              stream.getTracks().forEach((track) => track.stop());

              // Decide the message up-front: if no cloud key is configured we
              // go straight to the offline OS engine, so don't say "Whisper".
              const hasCloudKey = !!(getApiKey('groq') || getApiKey('openai') || getApiKey('gemini') || getApiKey('google'));
              toast.info('Transcribing voice', hasCloudKey ? 'Sending audio to Whisper...' : 'Listening via offline speech engine...');
              try {
                const text = await transcribeAudio(audioBlob);
                if (text && text.trim()) {
                  setDraft((prev) => {
                    const cleanPrev = prev.trim();
                    return cleanPrev ? cleanPrev + ' ' + text.trim() : text.trim();
                  });
                  toast.success('Transcribed successfully', 'Voice input appended.');
                } else {
                  // Engine ran but heard nothing â€” non-fatal, just inform.
                  toast.info('No speech detected', 'Try speaking a little closer to the microphone and tap the mic again.');
                }
              } catch (err: any) {
                console.error("Transcription error:", err);
                toast.error("Voice input error", err.message || "Failed to transcribe audio.");
              }
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            setIsRecording(true);
          })
          .catch((err) => {
            console.error("Microphone access failed:", err);
            toast.error("Microphone Access", "Could not access microphone. Please check system permissions.");
            setIsRecording(false);
          });
      }
    } catch (err: any) {
      console.error("Speech recognition failed:", err);
      toast.error("Voice input failure", err.message || "Could not start recording.");
      setIsRecording(false);
    }
  };

  const toggleReadAloud = (messageId: string, content: string) => {
    try {
      // If this message is already being read, stop it.
      if (speakingMessageId === messageId) {
        if (window.aios?.tts) {
          void window.aios.tts.cancel();
        } else if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        setSpeakingMessageId(null);
        return;
      }

      // Cancel anything currently playing, then start the new message.
      if (window.aios?.tts) {
        void window.aios.tts.cancel();
        const cleanText = content
          .replace(/```[\s\S]*?```/g, '[code block]')
          .replace(/[*_#`\-]/g, '');
        setSpeakingMessageId(messageId);
        void window.aios.tts.speak({ text: cleanText, rate: 1.25 }).then((res) => {
          if (!res?.ok) {
            console.warn('TTS failed:', res?.error);
            setSpeakingMessageId(null);
            toast.error('Speech Output Error', res?.error || 'Text-to-speech is unavailable on this system.');
          }
        });
        return;
      }

      // Fallback: in-browser Web Speech API (works only where Chromium has voices).
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const cleanText = content.replace(/```[\s\S]*?```/g, '[code block]').replace(/[*_#`\-]/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.25; // Bit faster
        utterance.onend = () => setSpeakingMessageId(null);
        utterance.onerror = () => setSpeakingMessageId(null);
        setSpeakingMessageId(messageId);
        window.speechSynthesis.speak(utterance);
      } else {
        toast.error('Speech Output Error', 'Text-to-speech is not available.');
        setSpeakingMessageId(null);
      }
    } catch (err: any) {
      console.error('Speech synthesis failed:', err);
      toast.error('Speech Output Error', 'Speech synthesis failed or was blocked.');
      setSpeakingMessageId(null);
    }
  };

  // Keep the UI in sync with the OS speech engine: clear the "speaking"
  // highlight when playback finishes naturally or errors out.
  useEffect(() => {
    if (!window.aios?.tts?.onEnd) return;
    const off = window.aios.tts.onEnd((payload) => {
      if (payload?.error) {
        console.warn('TTS ended with error:', payload.error);
      }
      setSpeakingMessageId(null);
    });
    return off;
  }, []);

  const handlePolishPrompt = async () => {
    const text = draft.trim();
    if (!text) {
      toast.error("Text required", "Please enter or record some text first.");
      return;
    }

    setIsPolishing(true);
    try {
      const res = await complete(
        {
          model: activeModel,
          system: "You are an expert AI prompt optimizer and editor. Your task is to analyze the user's input, correct any speech-to-text transcription errors, repair typos, fix grammar, and restate it as a clear, well-structured prompt for an AI coding assistant. Make sure to keep the user's original core intention intact but state it much better. Return ONLY the final polished text. Do not add any conversational framing, preamble, postamble, or surrounding quotes. If the prompt is already perfect, return it exactly as is.",
          messages: [
            {
              role: 'user',
              content: text,
            },
          ],
          temperature: 0.2,
          maxTokens: 500,
        },
        { preferred: activeProvider as any },
      );

      const polishedText = (res.content || '').trim();
      if (polishedText) {
        setDraft(polishedText);
      }
    } catch (err: any) {
      console.error("Polishing prompt failed:", err);
      toast.error("Polishing failed", err.message || 'Unknown error');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleSend = async () => {
    const trimmed = draft.trim();
    const filesToSend = [...attachedFiles];
    if (!trimmed && filesToSend.length === 0) return;

    // "Run with Fleet": route the goal through the background Director instead
    // of a single-agent turn. Works offline (heuristic routing); the optional
    // planning LLM uses the active session's provider/model.
    if (fleetMode) {
      setDraft('');
      setAttachedFiles([]);
      setIsFilePickerOpen(false);
      void runFleet(trimmed);
      return;
    }

    // Plan-then-act gate: for a non-trivial task (or when forced
    // via the /plan command), draft an execution plan and wait for the
    // user's approval before the agent touches the workspace.
    const wantPlan = useSettingsStore.getState().settings.planBeforeAct || planForced;
    if (wantPlan && activeSessionId && !looksLikeQuestion(trimmed)) {
      setPlanForced(false);
      setDraft('');
      setAttachedFiles([]);
      setIsFilePickerOpen(false);
      void generatePlan(trimmed, filesToSend);
      return;
    }

    // If the agent is mid-turn (streaming or running a tool/command), queue the
    // message so it's delivered only once the agent is free â€” never interrupt an
    // in-flight command or edit.
    if (isGenerating || (activeSessionId ? runOf(activeSessionId).isSending : false)) {
      enqueueMessage(trimmed, filesToSend);
      setDraft('');
      setAttachedFiles([]);
      setIsFilePickerOpen(false);
      toast.info('Queued', 'Message queued â€” it will send when the agent is free.');
      return;
    }

    if (activeSessionId) runOf(activeSessionId).isSending = true;

    // Clear the composer immediately (optimistic) so a copy of the prompt never
    // lingers in the input while the (possibly slow) context gathering runs.
    setDraft('');
    setAttachedFiles([]);
    setIsFilePickerOpen(false);

    const started = await submitTurn(trimmed, filesToSend);
    // submitTurn returns true when it scheduled a turn; runCompletionTurn then
    // releases the lock when generation actually starts. If it bailed early,
    // release the lock and restore the draft so the user can retry / edit.
    if (!started) {
      if (activeSessionId) runOf(activeSessionId).isSending = false;
      setDraft(trimmed);
      setAttachedFiles(filesToSend);
    }
  };

  const handleStop = () => {
    if (!activeSession) return;
    const run = runOf(activeSession.id);
    if (run.controller) {
      run.controller.abort();
    }
    // Freeze the elapsed time onto the streaming message so it still shows a
    // "Thought:"/"Worked for" summary even when the user stops it early.
    if (run.turnStart != null) {
      const durationMs = Date.now() - run.turnStart;
      const streaming = [...activeSession.messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.status === 'streaming');
      if (streaming) {
        updateMessage(activeSession.id, streaming.id, {
          durationMs,
          usage: { ...run.turnTokens },
        });
      }
    }
    run.turnStart = null;
    setTurnStart(activeSession.id, null);
    setGen(activeSession.id, false);
    run.isSending = false;
    // A stopped turn frees the agent â€” release any queued message.
    scheduleNext();
  };

  /**
   * Fleet run: hand the goal to the background Director. It auto-assigns the
   * work across the specialised agents (by role), threads the SAME shared
   * context plus each prior agent's output into every agent's structured task
   * prompt, and posts each deliverable into the chat. The optional planning
   * LLM â€” like every LLM call â€” uses the active session's provider/model.
   */
  const runFleet = useCallback(
    async (goal: string) => {
      const orchestrator = useOrchestratorStore.getState();
      if (orchestrator.isRunning) return;

      // Ensure a session exists so results have a home in the thread.
      let sid = activeSessionId;
      if (!sid) {
        sid = createSession(
          activeAgentId,
          activeProvider,
          activeModel,
          generateSmartTitle(goal, projectName),
        );
      }
      orchestrator.setActiveSession(sid);

      // Surface the goal itself in the thread so the run is traceable and the
      // chat never looks empty while the fleet works in the background.
      addMessage(sid, {
        id: crypto.randomUUID(),
        agentId: 'user',
        role: 'user',
        content: goal,
        timestamp: Date.now(),
        status: 'complete',
      });

      const controller = orchestrator.beginRun();

      // Shared context the WHOLE fleet receives â€” one reality for every agent.
      // Note: each agent executes on its OWN configured provider/model (set in
      // the Agent Roster); only the optional planning LLM uses the session's.
      const memoryEntries = useMemoryStore.getState().entries.slice(0, 8);
      const memory = memoryEntries
        .map((m) => `- [${m.category}] ${m.title}: ${m.content.slice(0, 200)}`)
        .join('\n');
      const sharedBrief =
        `Project: ${projectName || '(none)'}\n` +
        `Goal: ${goal}\n` +
        `Each agent runs on its own configured provider/model.`;

      // Each agent executes on the provider/model configured for it in the
      // Agent Roster (Account page). The roster setting is authoritative â€” the
      // fleet never silently rewrites it to a different provider. If an agent's
      // configured provider needs a key and none is set, we surface a clear
      // error for that subtask instead of routing it to ollama/session default.
      const effectiveOverride = (agent: (typeof agents)[number]) => ({
        provider: agent.provider as any,
        model: agent.model,
      });

      try {
        orchestrator.setDirectorThinking(
          'Director is decomposing the goal into agent tasksâ€¦',
        );
        const plan = await planGoal(goal, agents, controller.signal);
        orchestrator.setPlan(plan);
        orchestrator.setDirectorThinking(
          plan.llmAssisted
            ? 'Director refined the plan with the session model.'
            : 'Director assigned tasks by role (offline heuristic).',
        );

        // Surface the auto-generated plan in the Workflow canvas (visibility).
        const { nodes, edges } = asGraph(plan);
        useWorkflowStore.getState().setNodes(nodes);
        useWorkflowStore.getState().setEdges(edges);

        const priorOutputs: Record<string, StructuredOutput> = {};

        // Resolve the tool set once for the whole run: built-in tools plus any
        // enabled MCP server's tools. Passed to every agent turn so the fleet
        // can actually invoke tools (including external MCP integrations).
        let fleetTools: ToolDefinition[] | undefined =
          await getActiveToolDefinitions().catch(() => undefined);
        if (fleetTools && fleetTools.length === 0) fleetTools = undefined;

        for (const task of plan.subtasks) {
          if (controller.signal.aborted) break;
          const agent =
            agents.find((a) => a.id === task.agentId) ??
            agents.find((a) => a.role === task.role);
          if (!agent) {
            orchestrator.updateSubtask(task.id, {
              status: 'error',
              error: `No agent available for role "${task.role}"`,
            });
            continue;
          }

          orchestrator.updateSubtask(task.id, { status: 'running' });
          useAgentStore.getState().updateAgentStatus(agent.id, 'running');

          const prompt = buildTaskPrompt(task, agent, { sharedBrief, memory, priorOutputs });
          try {
            const result = await runAgentTurn(
              agent,
              [
                {
                  id: crypto.randomUUID(),
                  agentId: agent.id,
                  role: 'user',
                  content: prompt,
                  timestamp: Date.now(),
                },
              ],
              { signal: controller.signal },
              // Each agent executes on its OWN roster-configured model (with a
              // session fallback when its provider has no key).
              effectiveOverride(agent),
              // Built-in + MCP tools, executed with visual canvas and approval integrations.
              fleetTools,
              async (name: string, args: Record<string, any>) => executeLocalTool(name, args, sid),
            );
            // Hand the typed deliverable forward to dependent agents.
            priorOutputs[task.id] = {
              taskId: task.id,
              role: task.role,
              agentName: agent.name,
              deliverable: summarize(result.content),
              content: result.content,
            };
            orchestrator.updateSubtask(task.id, {
              status: 'completed',
              output: result.content,
            });
            useAgentStore.getState().updateAgentStatus(agent.id, 'completed');

            // Post the deliverable into the chat thread, attributed to the agent.
            addMessage(sid, {
              id: crypto.randomUUID(),
              agentId: agent.id,
              role: 'assistant',
              content: `**${agent.name} â€” ${task.role}**\n\n${result.content}`,
              timestamp: Date.now(),
              status: 'complete',
            });
          } catch (err: any) {
            orchestrator.updateSubtask(task.id, {
              status: 'error',
              error: err?.message || 'Agent failed',
            });
            useAgentStore.getState().updateAgentStatus(agent.id, 'error');
            // Surface the failure in the thread too, so it's never silent.
            addMessage(sid, {
              id: crypto.randomUUID(),
              agentId: agent.id,
              role: 'assistant',
              content: `**${agent.name} â€” ${task.role}** âš ï¸ failed: ${err?.message || 'Agent failed'}`,
              timestamp: Date.now(),
              status: 'error',
            });
            if (controller.signal.aborted) break;
          }
        }

        if (!controller.signal.aborted) {
          toast.success('Fleet run complete', `${plan.subtasks.length} agent tasks finished.`);
        }
      } catch (err: any) {
        toast.error('Fleet run failed', err?.message || 'Unknown error');
      } finally {
        orchestrator.setRunning(false);
        orchestrator.setDirectorThinking(null);
        // Clear the plan so the pipeline panel disappears once the run is done
        // (it no longer lingers across chat sessions). The dispatch results
        // remain in the chat thread.
        orchestrator.setPlan(null);
      }
    },
    [activeSessionId, activeAgentId, activeProvider, activeModel, agents, projectName, addMessage],
  );

  const handleComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash commands listener
    if (e.key === '/') {
      setIsSlashMenuOpen(true);
    } else if (e.key === ' ' || e.key === 'Escape') {
      setIsSlashMenuOpen(false);
    }

    // Enter sends prompt (unless Shift+Enter is pressed)
    if (e.key === 'Enter' && !e.shiftKey && !isSlashMenuOpen) {
      e.preventDefault();
      handleSend();
    }

    // Up/Down arrows navigate history
    if (e.key === 'ArrowUp' && draft.trim() === '') {
      e.preventDefault();
      if (draftHistory.length > 0 && historyIndex < draftHistory.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setDraft(draftHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      if (nextIdx === -1) {
        setDraft('');
      } else {
        setDraft(draftHistory[nextIdx]);
      }
    }
  };

  const applySlashCommand = (cmd: string) => {
    // `/goal` replaces the draft so the user can type the objective directly.
    if (cmd === '/goal') {
      setDraft('/goal ');
    } else if (cmd === '/plan') {
      // Force the plan-then-act gate for the current draft, then send.
      if (!draft.trim()) {
        toast.info('Plan mode', 'Type your task first, then /plan to draft an execution plan.');
        return;
      }
      setPlanForced(true);
      setIsSlashMenuOpen(false);
      void handleSend();
      return;
    } else {
      setDraft((prev) => (prev.startsWith('/') ? cmd + ' ' : prev + ' ' + cmd + ' '));
    }
    setIsSlashMenuOpen(false);
  };

  const handleRetry = () => {
    if (!activeSession) return;
    setErrorState(null);

    // Resume the failed turn from exactly where it broke, preserving all the
    // in-thread tool work already done (instead of wiping the thread back to
    // the last user prompt and re-drafting/re-running everything).
    const last = getRun(activeSession.id).lastTurn;
    if (last && last.sessionId === activeSession.id && last.assistantMsgId) {
// Clear the error flag so the stalled assistant bubble can stream again.
       updateMessage(last.sessionId, last.assistantMsgId, {
         status: 'streaming',
       });
       runCompletionTurn(
         last.sessionId,
         last.providerHistory,
         last.toolRound,
         last.assistantMsgId,
         last.priorText,
         last.priorToolCalls,
       );
      return;
    }

    // Fallback (error before any turn started): original truncate-to-prompt behaviour.
    const msgs = activeSession.messages;
    const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx !== -1) {
      const actualIdx = msgs.length - 1 - lastUserIdx;
      const cleanHistory = msgs.slice(0, actualIdx + 1);
      useChatStore.setState((s) => ({
        sessions: s.sessions.map((x) =>
          x.id === activeSession.id ? { ...x, messages: cleanHistory } : x,
        ),
      }));
runCompletionTurn(activeSession.id, buildProviderHistory(cleanHistory), 0);
    }
  };

  /**
   * Regenerate the assistant's response for a given message: cut the thread
   * back to just before that assistant message (keeping the user prompt that
   * produced it) and re-run the turn from there.
   */
  const handleRegenerate = (messageId: string) => {
    if (!activeSession) return;
    const targetSessionId = activeSession.id;
    const idx = activeSession.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    // Find the user prompt that preceded this assistant message.
    let promptIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (activeSession.messages[i].role === 'user') {
        promptIdx = i;
        break;
      }
    }
    if (promptIdx === -1) return;

    const clean = activeSession.messages.slice(0, promptIdx + 1);
    const promptText = clean[promptIdx].content;
    const promptFiles = clean[promptIdx].files ?? [];
    useChatStore.setState((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === targetSessionId ? { ...x, messages: clean } : x,
      ),
    }));
    setErrorState(null);

    const runTurn = () => {
      // Only regenerate if the user is still on the same conversation â€” if they
      // navigated away, drop the request instead of hijacking another chat.
      if (activeSessionId !== targetSessionId) return;
      void submitTurn(promptText, promptFiles);
    };

    if (isGenerating || runOf(targetSessionId).isSending) {
      // Wait for the in-flight turn to free up, then regenerate.
      const timer = window.setInterval(() => {
        const busy =
          useRunStore.getState().ui[targetSessionId]?.isGenerating ||
          runOf(targetSessionId).isSending;
        if (!busy) {
          window.clearInterval(timer);
          runTurn();
        }
      }, 300);
      return;
    }
    runTurn();
  };

  // Persist a session field when the composer selectors change.
  const patchActiveSession = useCallback(
    (patch: Partial<ChatSession>) => {
      if (!activeSession) return;
      useChatStore.setState((s) => ({
        sessions: s.sessions.map((x) => (x.id === activeSession.id ? { ...x, ...patch } : x)),
      }));
    },
    [activeSession],
  );

  const handleProviderChange = useCallback(
    (prov: string) => {
      const fallback = defaultModelFor(prov, providers);
      setActiveProvider(prov);
      setActiveModel(fallback);
      setErrorState(null);
      patchActiveSession({ provider: prov, model: fallback });
    },
    [providers, patchActiveSession],
  );

  const handleModelChange = useCallback(
    (mod: string) => {
      setActiveModel(mod);
      patchActiveSession({ model: mod });
    },
    [patchActiveSession],
  );

  const handleAgentChange = useCallback(
    (aid: string) => {
      setActiveAgentId(aid);
      patchActiveSession({ activeAgentId: aid });
    },
    [patchActiveSession],
  );

  return (
    <div className="agents-view">
      {/* ---- LEFT RAIL: CHATS & AGENTS LIST ---- */}
      <aside
        className={`agents-rail${railCollapsed ? ' agents-rail--collapsed' : ''}`}
        aria-label="Conversation workspace"
      >
        <div className="agents-rail__header">
          {!railCollapsed && <h2 className="agents-rail__title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Chats</h2>}
          <IconButton
            icon={railCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            tooltip={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            variant="ghost"
            size="sm"
            onClick={() => setRailCollapsed((c) => !c)}
          />
        </div>

        <div className="agents-rail__new-btn-wrap">
          {!railCollapsed ? (
            <button
              type="button"
              className="new-chat-btn"
              onClick={() => createSession(activeAgentId, activeProvider, activeModel, undefined, null)}
            >
              <Plus size={16} />
              <span>New Chat</span>
            </button>
          ) : (
            <IconButton
              icon={<Plus size={16} />}
              tooltip="New Chat"
              variant="accent"
              size="md"
              onClick={() => createSession(activeAgentId, activeProvider, activeModel, undefined, null)}
            />
          )}
        </div>

        {!railCollapsed && (
          <div className="agents-rail__search">
            <Input
              icon={<Search size={14} />}
              placeholder="Search conversationsâ€¦"
              value={sessionSearchQuery}
              aria-label="Search chat sessions"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSessionSearchQuery(e.target.value)}
            />
          </div>
        )}

        <div className="agents-rail__list">
          {/* Pinned conversations */}
          {pinnedSessions.length > 0 && (
            <div className="session-section">
              <span className="session-section__title">
                <Pin size={11} style={{ transform: 'rotate(45deg)' }} /> Pinned
              </span>
              {pinnedSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  activeId={activeSessionId}
                  onSelect={setActiveSessionId}
                  onRename={renameSession}
                  onDelete={removeSession}
                  onPin={togglePinSession}
                  onArchive={toggleArchiveSession}
                  onDuplicate={duplicateSession}
                  onCopyId={copyConversationId}
                  onCopyTranscript={copyTranscript}
                  onSharePdf={shareSessionAsPdf}
                />
              ))}
            </div>
          )}

          {/* Recents conversations */}
          {activeSessions.length > 0 && (
            <div className="session-section">
              <span className="session-section__title">
                <Clock size={11} /> Recents
              </span>
              {activeSessions.slice(0, 10).map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  activeId={activeSessionId}
                  onSelect={setActiveSessionId}
                  onRename={renameSession}
                  onDelete={removeSession}
                  onPin={togglePinSession}
                  onArchive={toggleArchiveSession}
                  onDuplicate={duplicateSession}
                  onCopyId={copyConversationId}
                  onCopyTranscript={copyTranscript}
                  onSharePdf={shareSessionAsPdf}
                />
              ))}
            </div>
          )}

          {/* Project collapsible groups (for full file navigation) */}
          <div className="session-section projects-header-section">
            <span className="session-section__title" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Folder size={11} /> Projects
              </span>
              <button
                type="button"
                className="add-project-link-btn"
                onClick={() => void openFolder()}
                title="Open another folder as project"
              >
                + Add
              </button>
            </span>
          </div>

          {projects.map((project) => {
            const projectSessions = filteredSessions.filter(
              (s) => (s.projectId ?? DEFAULT_PROJECT_ID) === project.id,
            );
            const isCollapsed = collapsedProjects.has(project.id);
            const isDefault = project.id === DEFAULT_PROJECT_ID;
            if (isDefault) return null; // Default unsorted is handled globally

            return (
              <div className="project-group" key={project.id}>
                <div className="project-group__header">
                  <button
                    type="button"
                    className="project-group__toggle"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleProjectCollapsed(project.id)}
                  >
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    <Folder size={13} />
                    {renamingProjectId === project.id ? (
                      <input
                        type="text"
                        className="project-group__name-input"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => confirmRenameProject(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmRenameProject(project.id);
                          else if (e.key === 'Escape') {
                            setRenamingProjectId(null);
                            setRenameValue('');
                          }
                        }}
                      />
                    ) : (
                      <span className="project-group__name">{project.name}</span>
                    )}
                  </button>
                  <div className="project-group__actions">
                    <IconButton
                      icon={<Pencil size={13} />}
                      tooltip="Rename project"
                      variant="ghost"
                      size="sm"
                      onClick={() => startRenameProject(project.id, project.name)}
                    />
                    <IconButton
                      icon={<Trash2 size={13} />}
                      tooltip="Delete project"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteProject(project.id, project.name)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {archivedSessions.length > 0 && (
            <div className="session-section">
              <span className="session-section__title">
                <Archive size={11} /> Archived
              </span>
              {archivedSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  activeId={activeSessionId}
                  onSelect={setActiveSessionId}
                  onRename={renameSession}
                  onDelete={removeSession}
                  onPin={togglePinSession}
                  onArchive={toggleArchiveSession}
                  onDuplicate={duplicateSession}
                  onCopyId={copyConversationId}
                  onCopyTranscript={copyTranscript}
                  onSharePdf={shareSessionAsPdf}
                />
              ))}
            </div>
          )}
        </div>

        {/* Updater Widget Card */}
        <div className="agents-rail__updater">
          {!railCollapsed ? (
            (() => {
              const status = updateStatus.status;
              const version = updateStatus.version || '';
              const percent = typeof updateStatus.percent === 'number' ? updateStatus.percent : 0;

              switch (status) {
                case 'checking':
                  return (
                    <div className="relaunch-update-card relaunch-update-card--checking">
                      <Loader2 size={16} className="update-card-icon-spin text-muted" />
                      <div className="update-card-text">
                        <span className="update-title">Checking for updates</span>
                        <span className="update-version">Connecting to releases...</span>
                      </div>
                    </div>
                  );
                case 'available':
                  return (
                    <div className="relaunch-update-card relaunch-update-card--available" onClick={() => downloadUpdate()}>
                      <span className="leaf-icon">ðŸ“¥</span>
                      <div className="update-card-text">
                        <span className="update-title">Update Available (v{version})</span>
                        <span className="update-version">Click to download update</span>
                      </div>
                      <span className="update-arrow">â†“</span>
                    </div>
                  );
                case 'downloading':
                  return (
                    <div className="relaunch-update-card relaunch-update-card--downloading">
                      <Loader2 size={16} className="update-card-icon-spin text-accent" />
                      <div className="update-card-text" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span className="update-title">Downloading Update</span>
                          <span className="update-title" style={{ fontWeight: 'bold' }}>{percent}%</span>
                        </div>
                        <div className="update-progress-bar-bg">
                          <div className="update-progress-bar-fill" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                case 'downloaded':
                  return (
                    <div className="relaunch-update-card relaunch-update-card--downloaded" onClick={() => quitAndInstall()}>
                      <span className="leaf-icon">ðŸƒ</span>
                      <div className="update-card-text">
                        <span className="update-title">Relaunch to update</span>
                        <span className="update-version">v{version || '1.2.9'} ready to install</span>
                      </div>
                      <span className="update-arrow">â†’</span>
                    </div>
                  );
                case 'error':
                  return (
                    <div className="relaunch-update-card relaunch-update-card--error" onClick={() => checkForUpdates()}>
                      <AlertCircle size={16} className="text-destructive" />
                      <div className="update-card-text">
                        <span className="update-title">Update Check Failed</span>
                        <span className="update-version">Click to try again</span>
                      </div>
                      <span className="update-arrow">â†»</span>
                    </div>
                  );
                default:
                  return (
                    <div className="relaunch-update-card" onClick={() => checkForUpdates()}>
                      <span className="leaf-icon">âš¡</span>
                      <div className="update-card-text">
                        <span className="update-title">Check for updates</span>
                        <span className="update-version">v1.2.9 (Latest)</span>
                      </div>
                      <span className="update-arrow">â†»</span>
                    </div>
                  );
              }
            })()
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <IconButton
                icon={
                  updateStatus.status === 'downloaded' ? (
                    <span>ðŸƒ</span>
                  ) : updateStatus.status === 'downloading' || updateStatus.status === 'checking' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : updateStatus.status === 'available' ? (
                    <span>ðŸ“¥</span>
                  ) : (
                    <span>âš¡</span>
                  )
                }
                tooltip={
                  updateStatus.status === 'downloaded'
                    ? "Relaunch to update"
                    : updateStatus.status === 'downloading'
                    ? `Downloading: ${updateStatus.percent || 0}%`
                    : updateStatus.status === 'checking'
                    ? "Checking for updates..."
                    : updateStatus.status === 'available'
                    ? `Update available (v${updateStatus.version}). Click to download.`
                    : "Check for updates"
                }
                variant="ghost"
                size="md"
                onClick={
                  updateStatus.status === 'downloaded'
                    ? () => quitAndInstall()
                    : updateStatus.status === 'available'
                    ? () => downloadUpdate()
                    : () => checkForUpdates()
                }
              />
            </div>
          )}
        </div>
      </aside>

      {/* ---- RIGHT PANE: CURSOR CHAT WORKSPACE ---- */}
      <section className="agents-chat" aria-label="Coding workspace conversation">
        {activeSession ? (
          <>
            {/* Chat header removed */}

            {/* Soft reminder for folder-less ("New Chat") conversations */}
            {!activeSession.projectId && (
              <div className="agents-chat__noproject-banner">
                <FolderOpen size={14} />
                <span>
                  No folder selected â€” open a project so the agent can read &amp; edit your files. You can
                  keep chatting for general help.
                </span>
                <button
                  type="button"
                  className="agents-chat__noproject-btn"
                  onClick={() => void openFolder()}
                >
                  Open folder
                </button>
              </div>
            )}

            {/* Conversation Thread */}
            <div className="agents-chat__thread">
              {activeSession.messages.length === 0 && (
                <div className="agents-chat__thread-empty">
                  <Bot size={36} className="thread-empty__icon" />
                  <h4>Unified Coding Workspace</h4>
                  <p>
                    Mention files using attachment or slash commands. Type your requests and let the agents coordinate the workspace.
                  </p>
                </div>
              )}

              {activeSession.messages.map((message) => {
                const isSystemMsg = message.agentId === 'system';
                if (isSystemMsg) {
                  return (
                    <div key={message.id} className="system-log-message">
                      <Terminal size={12} />
                      <span className="system-log-content">{message.content}</span>
                    </div>
                  );
                }

                const msgAgent = agents.find((a) => a.id === message.agentId);
                const isAssistant = message.role === 'assistant';
                const messagesIdx = activeSession.messages.findIndex((m) => m.id === message.id);
                // Regenerate is only meaningful when a user prompt precedes this reply.
                const hasPriorUser = activeSession.messages
                  .slice(0, messagesIdx)
                  .some((m) => m.role === 'user');


                return (
                  <article
                    key={message.id}
                    className={`chat-msg${isAssistant ? ' chat-msg--assistant' : ''}`}
                    data-role={message.role}
                  >
                    <span className="chat-msg__avatar" aria-hidden="true">
                      {isAssistant ? (
                        <AgentAvatar role={msgAgent?.role || 'planner'} size={30} />
                      ) : (
                        <AgentAvatar role="user" size={30} />
                      )}
                    </span>
                    <div className="chat-msg__body">
                      <div className="chat-msg__meta">
                        <span className="chat-msg__author">
                          {isAssistant ? msgAgent?.name || 'Assistant' : 'You'}
                        </span>
                        {isAssistant && message.status !== 'streaming' && message.durationMs != null && (
                          <span className="chat-msg__thought" title="Time the agent spent working">
                            <Clock size={10} /> Working: {formatDuration(message.durationMs)}
                          </span>
                        )}
                      </div>
                      <div
                        className={`chat-msg__bubble${
                          isAssistant && message.status === 'error' ? ' chat-msg__bubble--error' : ''
                        }`}
                      >
                        <MessageContent message={message} />

                        {/* Work summary â€” collapsible steps/tools the agent used. */}
                        {message.toolCalls && message.toolCalls.length > 0 && (
                          <WorkSummary message={message} />
                        )}
                      </div>
                      <span className="chat-msg__time">{formatTime(message.timestamp)}</span>

                      {isAssistant && (
                        <div className="chat-msg__actions">
                          <button
                            type="button"
                            className="chat-msg__action"
                            title="Copy response"
                            onClick={() => {
                              void navigator.clipboard.writeText(message.content);
                              toast.success('Copied', 'Response copied to clipboard.');
                            }}
                          >
                            <DuplicateIcon size={12} /> Copy
                          </button>
                          <button
                            type="button"
                            className={`chat-msg__action ${speakingMessageId === message.id ? 'chat-msg__action--speaking' : ''}`}
                            title={speakingMessageId === message.id ? "Stop Reading Aloud" : "Read Response Aloud"}
                            onClick={() => toggleReadAloud(message.id, message.content)}
                          >
                            {speakingMessageId === message.id ? (
                              <>
                                <VolumeX size={12} style={{ color: 'var(--accent-primary)' }} /> Stop
                              </>
                            ) : (
                              <>
                                <Volume2 size={12} /> Read Aloud
                              </>
                            )}
                          </button>
                          {hasPriorUser && message.status !== 'streaming' && (
                            <button
                              type="button"
                              className="chat-msg__action"
                              title="Regenerate this response"
                              onClick={() => handleRegenerate(message.id)}
                            >
                              <RefreshCw size={12} /> Regenerate
                            </button>
                          )}
                          {message.status === 'error' && (
                            <button
                              type="button"
                              className="chat-msg__action chat-msg__action--retry"
                              title="Retry this turn"
                              onClick={() => handleRegenerate(message.id)}
                            >
                              <RefreshCw size={12} /> Retry
                            </button>
                          )}
                          <button
                            type="button"
                            className="chat-msg__action"
                            title="Revert conversation to this point"
                            onClick={() => {
                              if (!activeSession) return;
                              const idx = activeSession.messages.findIndex((m) => m.id === message.id);
                              if (idx === -1) return;
                              const clean = activeSession.messages.slice(0, idx + 1);
                              useChatStore.setState((s) => ({
                                sessions: s.sessions.map((x) =>
                                  x.id === activeSession.id ? { ...x, messages: clean } : x,
                                ),
                              }));
                              toast.info('Reverted', 'Conversation cut back to this message.');
                            }}
                          >
                            <Undo2 size={12} /> Revert to here
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}

              {/* Live "working" indicator â€” spinner + ticking timer, with a
                  collapsible panel showing what the agent is doing right now. */}
              {isGenerating && turnStartAt != null && (
                <WorkingIndicator
                  startAt={turnStartAt}
                  showDetail={showWorkingDetail}
                  onToggleDetail={() => setShowWorkingDetail((v) => !v)}
                />
              )}

              {/* Queued messages â€” shadowed bubbles that promote to real turns. */}
              {queuedItems.map((item, i) => {
                const headPromoteAt = queuedItems[0]?.promoteAt ?? null;
                const eta =
                  headPromoteAt != null ? headPromoteAt + i * QUEUE_COOLDOWN - nowTick : null;
                const timerLabel =
                  eta != null
                    ? `Promotes in ${eta < 1000 ? (eta / 1000).toFixed(1) : Math.ceil(eta / 1000)}s`
                    : 'Waiting for the agent to finishâ€¦';
                return (
                  <article key={item.id} className="chat-msg chat-msg--queued" data-role="user">
                    <span className="chat-msg__avatar" aria-hidden="true">
                      <AgentAvatar role="user" size={30} />
                    </span>
                    <div className="chat-msg__body">
                      <div className="chat-msg__meta">
                        <span className="chat-msg__author">You</span>
                        <span className="chat-msg__queued-badge">Queued</span>
                      </div>
                      <div className="chat-msg__bubble chat-msg__bubble--queued">
                        {item.text}
                        {item.files.length > 0 && (
                          <span className="chat-msg__queued-files">
                            <Paperclip size={11} /> {item.files.length} file(s)
                          </span>
                        )}
                      </div>
                      <div className="chat-msg__queued-timer">{timerLabel}</div>
                    </div>
                  </article>
                );
              })}

              {/* Error banner block */}
              {errorState && (
                <div className="error-banner glass-card animate-fade-in-up">
                  <div className="error-banner__header">
                    <AlertCircle size={16} className="error-banner__icon" />
                    <h4 className="error-banner__title">{errorState.statusText || 'Request failed'}</h4>
                  </div>
                  <p className="error-banner__text">{errorState.message}</p>
                  <div className="error-banner__actions">
                    <Button variant="secondary" size="sm" onClick={handleRetry}>
                      Retry Turn
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                      <Settings size={13} /> Open Settings
                    </Button>
                  </div>
                </div>
              )}

              <div ref={threadEndRef} />
            </div>

            {/* Fleet pipeline â€” live view of the Director's auto-assigned run. */}
            <FleetPipeline />

            {/* Input Composer Area */}
             <div className="agents-chat__composer glass">
              {/* Slash commands popover */}
              {isSlashMenuOpen && (
                <div className="composer-slash-menu glass">
                  <button type="button" onClick={() => applySlashCommand('/explain')}>
                    <Badge variant="accent">/explain</Badge> Explain selection or project files
                  </button>
                  <button type="button" onClick={() => applySlashCommand('/refactor')}>
                    <Badge variant="accent">/refactor</Badge> Refactor standard components
                  </button>
                  <button type="button" onClick={() => applySlashCommand('/fix')}>
                    <Badge variant="accent">/fix</Badge> Identify and fix compiler errors
                  </button>
                  <button type="button" onClick={() => applySlashCommand('/test')}>
                    <Badge variant="accent">/test</Badge> Generate unit test coverage
                  </button>
                  <button type="button" onClick={() => applySlashCommand('/goal')}>
                    <Badge variant="accent">/goal</Badge> Set the conversation objective
                  </button>
                  <button type="button" onClick={() => applySlashCommand('/plan')}>
                    <Badge variant="accent">/plan</Badge> Draft a plan before acting
                  </button>
                </div>
              )}

              {/* Input card: textarea + controls share one focus ring */}
              {/* Context Limit Warning Banner */}
              {activeSession.messages.length >= 15 && !isWarningDismissed && (
                <div className="composer-warning-banner">
                  <span>This conversation has {activeSession.messages.length} messages. Consider starting a new chat to keep context fresh.</span>
                  <div className="composer-warning-banner__actions">
                    <button type="button" className="warning-banner-new" onClick={() => createSession(activeAgentId, activeProvider, activeModel)}>
                      New Chat
                    </button>
                    <button
                      type="button"
                      className="warning-banner-dismiss"
                      onClick={() => setIsWarningDismissed(true)}
                      aria-label="Dismiss warning"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Toggle Buttons & Selectors Options Bar */}
              <div className="composer-options-bar">
                {/* Agent selector */}
                <Dropdown
                  ariaLabel="Select agent"
                  className="composer-bar-dd"
                  menuPlacement="top"
                  value={activeAgentId}
                  options={agentDropdownOptions}
                  onChange={handleAgentChange}
                />

                {/* Provider selector */}
                <Dropdown
                  ariaLabel="AI provider"
                  className="composer-bar-dd"
                  menuPlacement="top"
                  searchable
                  searchPlaceholder="Search providersâ€¦"
                  value={activeProvider}
                  options={providerDropdownOptions}
                  onChange={handleProviderChange}
                />

                {/* Follow Agent Toggle */}
                <button
                  type="button"
                  className={`composer-bar-btn ${followAgent ? 'is-active' : ''}`}
                  title="Follow Agent â€” watch files & terminals live"
                  onClick={() => setFollowAgent((f) => !f)}
                >
                  <Crosshair size={11} />
                  <span>Follow</span>
                </button>

                {/* Run with Fleet Toggle */}
                <button
                  type="button"
                  className={`composer-bar-btn ${fleetMode ? 'is-active' : ''}`}
                  title="Run with Fleet â€” coordinate multiple specialist agents"
                  onClick={() => setFleetMode((f) => !f)}
                >
                  <Network size={11} />
                  <span>Fleet Mode</span>
                </button>

                {/* Auto Access (Trust Mode) Toggle */}
                <div className="auto-access-wrapper" ref={autoAccessRef}>
                  <button
                    type="button"
                    className={`composer-bar-btn ${autoAccessEnabled ? 'is-active' : ''}`}
                    title="Auto Access â€” run without approvals"
                    onClick={() => setIsAutoAccessOpen((o) => !o)}
                  >
                    <Zap size={11} />
                    <span>Auto Access</span>
                  </button>

                  {isAutoAccessOpen && (
                    <div className="auto-access-popover">
                      <div className="auto-access-popover__head">
                        <span className="auto-access-popover__title">Auto Access</span>
                        <span className={`auto-access-popover__state ${autoAccessEnabled ? 'is-on' : 'is-off'}`}>
                          {autoAccessEnabled ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="auto-access-popover__hint">
                        Give the agent uninterrupted access to this workspace. Turn off anytime to restore approvals.
                      </p>
                      <label className="auto-access-row">
                        <span className="auto-access-row__text">
                          <span className="auto-access-row__label">Full workspace access</span>
                          <span className="auto-access-row__sub">Run commands &amp; edit files freely</span>
                        </span>
                        <input
                          type="checkbox"
                          className="auto-access-switch"
                          checked={autoAccessEnabled}
                          onChange={(e) => setAutoAccessEnabled(e.target.checked)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Input card: textarea + controls share one focus ring */}
              <div className="composer-inputcard">
                {/* Attached Files List inside the composer card */}
                {attachedFiles.length > 0 && (
                  <div className="composer-attachments-row">
                    {attachedFiles.map((file) => (
                      <div key={file} className="composer-attachment-chip">
                        <Paperclip size={10} style={{ marginRight: '4px' }} />
                        <span className="composer-attachment-name" title={file}>
                          {file.split(/[\\/]/).pop()}
                        </span>
                        <button
                          type="button"
                          className="composer-attachment-remove"
                          onClick={() => setAttachedFiles((prev) => prev.filter((f) => f !== file))}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isRecording && (
                  <div className="composer-recording-wave animate-fade-in">
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <span className="recording-status">Recording audio... click Mic button to stop and transcribe</span>
                  </div>
                )}

                {/* Main textarea */}
                <div className="composer-text-row">
                  <textarea
                    className="agents-chat__textarea"
                    placeholder={`Write a message to ${activeAgent?.name || 'agent'}...`}
                    aria-label="Draft prompt"
                    value={draft}
                    rows={Math.min(6, Math.max(1, draft.split('\n').length))}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleComposerKey}
                  />
                </div>

                {/* Selector pills & Controls */}
                <div className="composer-controls">
                  <div className="composer-left-actions">
                    {/* Project Folder Dropdown */}
                    <Dropdown
                      ariaLabel="Working project"
                      className="composer-dd composer-dd--project"
                      menuPlacement="top"
                      align="start"
                      value={projectName ? 'current' : '__open__'}
                      options={projectDropdownOptions}
                      onChange={(v) => {
                        if (v === '__open__') void openFolder();
                      }}
                    />

                    {/* Plus button for Attachments picker */}
                    <div className="attach-popover-wrapper">
                      <input
                        type="file"
                        multiple
                        id="composer-system-file-input"
                        style={{ display: 'none' }}
                        onChange={handleSystemFileChange}
                      />
                      <button
                        type="button"
                        className="composer-plus-btn"
                        title="Attach files"
                        onClick={() => setIsFilePickerOpen(!isFilePickerOpen)}
                      >
                        <Plus size={16} />
                      </button>
                      
                      {isFilePickerOpen && (
                        <div className="file-attach-popover glass animate-fade-in-up">
                          <button
                            type="button"
                            className="file-attach-system-btn"
                            onClick={() => document.getElementById('composer-system-file-input')?.click()}
                          >
                            <FolderOpen size={11} />
                            <span>Attach from computer...</span>
                          </button>
                          <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />

                          <Input
                            icon={<Search size={12} />}
                            placeholder="Search workspace..."
                            value={fileFilter}
                            autoFocus
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setFileFilter(e.target.value)}
                          />
                          <div className="file-attach-list">
                            {filteredFiles.length === 0 && (
                              <span className="file-attach-empty">No files found.</span>
                            )}
                            {filteredFiles.map((file) => (
                              <button
                                key={file.path}
                                type="button"
                                className="file-attach-row"
                                onClick={() => {
                                  if (!attachedFiles.includes(file.path)) {
                                    setAttachedFiles((prev) => [...prev, file.path]);
                                  }
                                  setIsFilePickerOpen(false);
                                  setFileFilter('');
                                }}
                              >
                                <FolderOpen size={11} />
                                <span className="file-attach-name">{file.path}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="composer-right-actions">
                    {/* Model selector â€” grouped by provider */}
                    <ModelProviderDropdown
                      providers={providers}
                      dynamicModels={dynamicModels}
                      builtinModels={BUILTIN_MODELS}
                      activeProvider={activeProvider}
                      activeModel={activeModel}
                      onSelect={(prov, mod) => {
                        handleProviderChange(prov);
                        handleModelChange(mod);
                      }}
                    />

                    {/* Microphone icon button */}
                    <button
                      type="button"
                      className={`composer-mic-btn ${isRecording ? 'composer-mic-btn--recording' : ''}`}
                      title={isRecording ? "Stop Voice Input" : "Voice Input (Speech-to-Text)"}
                      onClick={toggleSpeechRecognition}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '15px', height: '15px' }}>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v4M8 23h8" />
                      </svg>
                    </button>



                    {/* Polish/Optimize Prompt button */}
                    <button
                      type="button"
                      className={`composer-polish-btn ${isPolishing ? 'composer-polish-btn--polishing' : ''}`}
                      title="AI Polish Prompt (Correct Grammar & Rephrase)"
                      onClick={handlePolishPrompt}
                      disabled={isPolishing}
                    >
                      {isPolishing ? (
                        <Loader2 size={15} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                    </button>

                    {/* Send or Stop button */}
                    <div className="composer-send-btn-wrap">
                      {planning ? (
                        <Button variant="secondary" size="sm" disabled>
                          Planningâ€¦
                        </Button>
                      ) : pendingPlan ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <Button variant="ghost" size="sm" onClick={handleDiscardPlan}>
                            Discard
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<Check size={11} />}
                            onClick={handleApprovePlan}
                          >
                            Approve
                          </Button>
                        </div>
                      ) : isGenerating ? (
                        <button
                          type="button"
                          className="composer-send-btn composer-send-btn--stop"
                          title="Stop fleet run"
                          onClick={handleStop}
                        >
                          <Square size={12} fill="currentColor" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="composer-send-btn"
                          disabled={!draft.trim() && attachedFiles.length === 0}
                          onClick={handleSend}
                          title="Send message"
                        >
                          <Send size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="composer-disclaimer">
                <span>AIOS is AI and can make mistakes. Please double-check responses.</span>
              </div>
              </div>
          </>
        ) : (
          <div className="agents-empty animate-fade-in-up">
            <div className="agents-empty__icon">
              <Bot size={40} />
            </div>
            <h3 className="agents-empty__title">Fleet Coding Workspace</h3>
            <p className="agents-empty__text">
              Create a new conversation thread to run commands, inspect local code, and build files.
            </p>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => createSession(activeAgentId, activeProvider, activeModel)}
            >
              Start Conversation
            </Button>
          </div>
        )}
      </section>
      <AgentFollowPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                     */
/* ------------------------------------------------------------------ */

interface SessionRowProps {
  session: ChatSession;
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCopyId: (id: string) => void;
  onCopyTranscript: (id: string) => void;
  onSharePdf: (id: string) => void;
}

function SessionRow({
  session,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onArchive,
  onDuplicate,
  onCopyId,
  onCopyTranscript,
  onSharePdf,
}: SessionRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = session.id === activeId;

  const handleSave = () => {
    const trimmed = editTitle.trim();
    if (trimmed) onRename(session.id, trimmed);
    setIsEditing(false);
  };

  const run = (fn: () => void) => {
    fn();
    setMenuOpen(false);
  };

  return (
    <div className={`session-row ${isActive ? 'session-row--active' : ''}`} role="button">
      <div className="session-row__left" onClick={() => !isEditing && onSelect(session.id)}>
        <Folder size={13} className="session-row__icon" />
        {isEditing ? (
          <input
            type="text"
            className="session-row__input"
            value={editTitle}
            autoFocus
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              else if (e.key === 'Escape') setIsEditing(false);
            }}
          />
        ) : (
          <span className="session-row__title" title={session.title || 'New conversation'}>
            {session.title || 'New conversation'}
          </span>
        )}
      </div>
      <div className="session-row__actions">
        <button
          type="button"
          className="session-row__more"
          aria-label="Conversation options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <>
            <div className="session-row__menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="session-row__menu" role="menu">
              <button
                type="button"
                className="session-row__menu-item"
                onClick={() => run(() => setIsEditing(true))}
              >
                <Pencil size={13} /> Rename
              </button>
              <button
                type="button"
                className="session-row__menu-item"
                onClick={() => run(() => onCopyId(session.id))}
              >
                <Link2 size={13} /> Copy conversation ID
              </button>
              <button
                type="button"
                className="session-row__menu-item"
                onClick={() => run(() => onCopyTranscript(session.id))}
              >
                <ClipboardCopy size={13} /> Copy as transcript
              </button>
              <button
                type="button"
                className="session-row__menu-item"
                onClick={() => run(() => onSharePdf(session.id))}
              >
                <Share2 size={13} /> Share as PDF
              </button>
              <div className="session-row__menu-sep" />
              <button
                type="button"
                className="session-row__menu-item"
                onClick={() => run(() => onPin(session.id))}
              >
                <Pin size={13} /> {session.isPinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                className="session-row__menu-item"
                onClick={() => run(() => onArchive(session.id))}
              >
                <Archive size={13} /> {session.isArchived ? 'Activate' : 'Archive'}
              </button>
              <button
                type="button"
                className="session-row__menu-item"
                onClick={() => run(() => onDuplicate(session.id))}
              >
                <DuplicateIcon size={13} /> Duplicate
              </button>
              <button
                type="button"
                className="session-row__menu-item session-row__menu-item--danger"
                onClick={() => run(() => onDelete(session.id))}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Live "Working" indicator shown at the start of a turn. Shows a ticking timer
 * and a downward toggle that reveals what the agent is composing right now
 * (its live, streamed text â€” effectively its in-the-moment plan/approach).
 * The duration is naturally agent-driven: short for light tasks, longer for
 * substantial ones, because the agent plans-to-itself before replying/fixing.
 * Subscribes only to the throttled `liveText` so the message thread doesn't
 * re-render on every token.
 */
function WorkingIndicator({
  startAt,
  showDetail,
  onToggleDetail,
}: {
  startAt: number;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  const liveText = useFollowPanelStore((s) => s.liveText);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(Date.now() - startAt);
    const id = setInterval(() => setElapsed(Date.now() - startAt), 500);
    return () => clearInterval(id);
  }, [startAt]);

  return (
    <div className="thinking-indicator" role="status" aria-live="polite">
      <Loader2 size={13} className="thinking-indicator__spinner" />
      <button type="button" className="thinking-indicator__label" onClick={onToggleDetail}>
        Working... {formatDuration(elapsed)}
        {showDetail ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {showDetail && (
        <div className="thinking-indicator__detail">
          {liveText.trim() ? (
            liveText
          ) : (
            <span className="thinking-indicator__placeholder">Planning the approachâ€¦</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible "Worked for Ns" summary inside a completed response â€” defaults to
 * collapsed once the turn finishes; expands to reveal the tool steps used. While
 * the message is still streaming it stays open so progress is visible live.
 */
function WorkSummary({ message }: { message: ChatMessage }) {
  const toolCalls = message.toolCalls ?? [];
  const isStreaming = message.status === 'streaming';
  const [open, setOpen] = useState(isStreaming);

  // Follow the turn: open live while streaming, auto-collapse once it finishes.
  useEffect(() => {
    setOpen(message.status === 'streaming');
  }, [message.status]);

  if (toolCalls.length === 0) return null;

  const stepLabel = `${toolCalls.length} step${toolCalls.length === 1 ? '' : 's'}`;
  const label =
    message.durationMs != null
      ? `Worked for ${formatDuration(message.durationMs)}`
      : isStreaming
        ? 'Workingâ€¦'
        : 'Work summary';

  return (
    <div className="work-summary">
      <button
        type="button"
        className="work-summary__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        <Wrench size={12} className="work-summary__icon" />
        <span className="work-summary__label">{label}</span>
        <span className="work-summary__count">{stepLabel}</span>
      </button>
      {open && (
        <div className="work-summary__steps">
          {toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} call={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Turn a raw tool call into a short, plain-language "saying" describing what
 * the agent is doing right now â€” so the bubble reads like a teammate narrating
 * its work ("Reading src/index.ts") instead of a raw command list.
 * `saying` is the one-line status; `verb` is a slightly fuller sentence shown
 * when the card is expanded.
 */
function describeToolCall(call: ToolCall): { saying: string; verb: string } {
  let args: Record<string, unknown> = {};
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    try {
      args = JSON.parse(call.arguments.replace(/'/g, '"'));
    } catch {
      args = {};
    }
  }

  const clip = (v: unknown, max = 52): string => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1)}â€¦` : s;
  };

  const path = clip(args.path);
  const query = clip(args.query);
  const command = clip(args.command);
  const message = clip(args.message);
  const title = clip(args.title);

  switch (call.name) {
    case 'read_file':
      return path
        ? { saying: `Reading ${path}`, verb: `Opening ${path} to see what's inside.` }
        : { saying: 'Reading a file', verb: 'Reading a file from the workspace.' };
    case 'write_file':
      return path
        ? { saying: `Writing ${path}`, verb: `Creating or updating ${path}.` }
        : { saying: 'Writing a file', verb: 'Creating or updating a file.' };
    case 'list_dir':
      return path
        ? { saying: `Looking inside ${path}`, verb: `Listing the contents of ${path}.` }
        : { saying: 'Exploring the project files', verb: 'Listing the project file tree.' };
    case 'search_code':
      return query
        ? { saying: `Searching for "${query}"`, verb: `Searching the codebase for "${query}".` }
        : { saying: 'Searching the code', verb: 'Searching the codebase.' };
    case 'run_command':
      return command
        ? { saying: `Running \`${command}\``, verb: `Running the command \`${command}\` in the terminal.` }
        : { saying: 'Running a command', verb: 'Running a shell command.' };
    case 'git_status':
      return { saying: 'Checking git status', verb: 'Checking what has changed in git.' };
    case 'git_commit':
      return message
        ? { saying: `Committing "${message}"`, verb: `Committing the changes with message "${message}".` }
        : { saying: 'Committing changes', verb: 'Creating a git commit.' };
    case 'create_artifact':
      return title
        ? { saying: `Adding "${title}" to the canvas`, verb: `Saving "${title}" to the Agent Canvas.` }
        : { saying: 'Adding to the canvas', verb: 'Saving a deliverable to the Agent Canvas.' };
    case 'update_plan':
      return title
        ? { saying: `Updating the plan: ${title}`, verb: `Updating the task checklist "${title}".` }
        : { saying: 'Updating the plan', verb: 'Updating the task checklist in the canvas.' };
    default:
      return {
        saying: call.name.replace(/_/g, ' '),
        verb: `Running the ${call.name.replace(/_/g, ' ')} tool.`,
      };
  }
}

function ToolCallCard({ call }: { call: ToolCall }) {
  const [isOpen, setIsOpen] = useState(false);
  const projectRoot = useProjectStore((s) => s.projectRoot);

  const getStatusText = () => {
    if (call.status === 'running') return 'Executing...';
    if (call.status === 'awaiting-approval') return 'Awaiting review...';
    if (call.status === 'success') return 'Succeeded';
    if (call.status === 'rejected') return 'Rejected';
    return 'Failed';
  };

  const { saying, verb } = describeToolCall(call);

  return (
    <div className="tool-call-card glass-card" data-status={call.status}>
      <header className="tool-call-card__header">
        <div className="tool-call-card__title" onClick={() => setIsOpen(!isOpen)} style={{ flex: 1, cursor: 'pointer' }}>
          <Terminal size={12} />
          <span className="tool-call-card__saying">{saying}</span>
          <span className="tool-call-card__name">{call.name}</span>
        </div>
        {/* Clickable diff badge to open in Code Canvas */}
        {call.diff && (
          <span
            className="tool-call-card__diff clickable"
            title="Click to open changes in Code Canvas"
            style={{ cursor: 'pointer', userSelect: 'none', marginRight: '8px' }}
            onClick={async (e) => {
              e.stopPropagation();
              let original = '';
              let proposed = '';
              try {
                let args: Record<string, any> = {};
                try {
                  args = JSON.parse(call.arguments);
                } catch {
                  const cleaned = call.arguments.replace(/'/g, '"');
                  args = JSON.parse(cleaned);
                }
                const filePath = args.path || '';
                if (filePath) {
                  try {
                    original = await window.aios!.fs.readFile(projectRoot || '', filePath, { numbered: false });
                  } catch {
                    original = '';
                  }
                  if (call.name === 'write_file') {
                    proposed = args.content || '';
                  } else if (call.name === 'patch_file') {
                    const oldStr = args.old_str || '';
                    const newStr = args.new_str || '';
                    proposed = original.includes(oldStr) ? original.replace(oldStr, newStr) : original;
                  } else if (call.name === 'append_file') {
                    const content = args.content || '';
                    proposed = original ? original + '\n' + content : content;
                  }
                  
                  const followStore = useFollowPanelStore.getState();
                  followStore.setCollapsed(false);
                  followStore.setActiveTab('code');
                  followStore.followFile({
                    id: filePath,
                    path: filePath,
                    name: filePath.split(/[\\/]/).pop() || filePath,
                    content: proposed,
                    original,
                  });
                  toast.success('Opening code canvas', `Showing changes for ${filePath.split(/[\\/]/).pop()}`);
                }
              } catch (err) {
                console.error("Failed to open file in code canvas:", err);
              }
            }}
          >
            <span className="tool-call-card__diff-add">+{call.diff.additions}</span>
            <span className="tool-call-card__diff-del">âˆ’{call.diff.deletions}</span>
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setIsOpen(!isOpen)}>
          <span className="tool-call-card__status-text">
            ({getStatusText()})
          </span>
          {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </header>

      {isOpen && (
        <div className="tool-call-card__body">
          <p className="tool-call-card__explain">{verb}</p>
          <div className="tool-call-card__section">
            <span className="tool-call-card__sec-title">Arguments</span>
            <pre className="tool-call-card__pre">{call.arguments}</pre>
          </div>
          {call.output && (
            <div className="tool-call-card__section">
              <span className="tool-call-card__sec-title">Output</span>
              <pre className="tool-call-card__pre tool-call-card__pre--output">{call.output}</pre>
            </div>
          )}
          {call.error && (
            <div className="tool-call-card__section">
              <span className="tool-call-card__sec-title">Error</span>
              <pre className="tool-call-card__pre tool-call-card__pre--error">{call.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type RenderSegment = Segment & { blocks: Block[] };

/**
 * Memoized so a streaming delta on one message doesn't re-parse (and re-render)
 * the entire thread. Markdown is parsed once per content change and cached.
 */
const MessageContent = React.memo(function MessageContent({ message }: { message: ChatMessage }) {
  const segments = useMemo<RenderSegment[]>(
    () =>
      parseSegments(message.content).map((s) =>
        s.type === 'text'
          ? { ...s, blocks: parseBlocks(s.value) }
          : { ...s, blocks: [] as Block[] },
      ),
    [message.content],
  );

  const openPdf = async (path: string) => {
    if (!window.aios) {
      toast.error('Local-only feature', 'Opening files is only supported in the desktop application.');
      return;
    }
    try {
      await window.aios.shell.exec(`start "" "${path}"`);
      toast.success('Opening document', `Opening ${path.split(/[\\/]/).pop()} in your default PDF viewer.`);
    } catch (e: any) {
      toast.error('Failed to open PDF', e.message || String(e));
    }
  };

  return (
    <div className="msg-content">
      {/* File Attachments */}
      {message.files && message.files.length > 0 && (
        <div className="msg-attachments-container">
          {message.files.map((file, fIdx) => {
            const isPdf = file.toLowerCase().endsWith('.pdf');
            const name = file.split(/[\\/]/).pop() || file;
            if (isPdf) {
              return (
                <div key={fIdx} className="pdf-attachment-card glass-card">
                  <div className="pdf-card-icon-wrap">
                    <svg className="pdf-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div className="pdf-card-details">
                    <span className="pdf-card-title" title={file}>{name}</span>
                    <span className="pdf-card-subtitle">Document Â· PDF</span>
                  </div>
                  <div className="pdf-card-actions">
                    <button
                      type="button"
                      className="pdf-card-btn"
                      onClick={() => void openPdf(file)}
                    >
                      <svg className="pdf-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download and open</span>
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={fIdx} className="file-attachment-chip">
                <Paperclip size={11} />
                <span title={file}>{name}</span>
              </div>
            );
          })}
        </div>
      )}

      {segments.map((seg, idx) => {
        if (seg.type === 'code') {
          return <CodeBlockRender key={idx} seg={seg} />;
        }
        return seg.blocks.map((b, bi) => {
          const key = `${idx}-${bi}`;
          switch (b.type) {
            case 'heading':
              return (
                <p
                  key={key}
                  className={`msg-content__h msg-content__h--${b.level}`}
                >
                  {renderInline(b.text)}
                </p>
              );
            case 'ul':
              return (
                <ul key={key} className="msg-content__list">
                  {b.items.map((it, k) => (
                    <li key={k}>{renderInline(it)}</li>
                  ))}
                </ul>
              );
            case 'ol':
              return (
                <ol key={key} className="msg-content__list msg-content__list--ordered">
                  {b.items.map((it, k) => (
                    <li key={k}>{renderInline(it)}</li>
                  ))}
                </ol>
              );
            case 'quote':
              return (
                <blockquote key={key} className="msg-content__quote">
                  {renderInline(b.text)}
                </blockquote>
              );
            default:
              return (
                <p key={key} className="msg-content__para">
                  {renderInline(b.text)}
                </p>
              );
          }
        });
      })}
    </div>
  );
});

function CodeBlockRender({ seg }: { seg: { lang: string; code: string } }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      if (window.aios?.clipboard) {
        window.aios.clipboard.writeText(seg.code);
        setCopied(true);
        toast.success('Copied code to clipboard');
        setTimeout(() => setCopied(false), 2000);
      } else {
        void navigator.clipboard.writeText(seg.code).then(() => {
          setCopied(true);
          toast.success('Copied code to clipboard');
          setTimeout(() => setCopied(false), 2000);
        });
      }
    } catch (e: any) {
      console.error("Clipboard copy failed:", e);
      toast.error('Copy failed', 'Please copy manually.');
    }
  };

  return (
    <div className="chat-code-block glass-card">
      <header className="chat-code-block__header">
        <span className="chat-code-block__lang">{seg.lang || 'text'}</span>
        <button type="button" className="chat-code-block__copy" onClick={handleCopy}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </header>
      <pre className="chat-code-block__pre">
        <code>{seg.code}</code>
      </pre>
    </div>
  );
}

/**
 * Live view of the Director's auto-assigned run: the decomposed subtasks, the
 * agent each was routed to, and per-task status. Hidden unless a fleet run is
 * active or the Director is thinking.
 */
function FleetPipeline() {
  const plan = useOrchestratorStore((s) => s.plan);
  const directorThinking = useOrchestratorStore((s) => s.directorThinking);
  const isRunning = useOrchestratorStore((s) => s.isRunning);
  const agents = useAgentStore((s) => s.agents);

  if (!plan && !directorThinking) return null;

  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'Unassigned';

  const dismiss = () => {
    const o = useOrchestratorStore.getState();
    o.setPlan(null);
    o.setDirectorThinking(null);
  };

  return (
    <div className="fleet-pipeline glass">
      <div className="fleet-pipeline__head">
        <span className="fleet-pipeline__title">
          <Network size={12} /> Fleet Director
        </span>
        <button
          type="button"
          className="fleet-pipeline__close"
          title={isRunning ? 'Hide panel (run continues in background)' : 'Dismiss'}
          aria-label="Dismiss fleet panel"
          onClick={dismiss}
        >
          <X size={12} />
        </button>
      </div>
      {directorThinking && (
        <div className="fleet-pipeline__director">
          <span>{directorThinking}</span>
          {isRunning && <Loader2 size={12} className="fleet-spin" />}
        </div>
      )}
      {plan && (
        <div className="fleet-pipeline__track">
          {plan.subtasks.map((t, i) => (
            <div key={t.id} className={`fleet-step fleet-step--${t.status}`}>
              <span className="fleet-step__idx">{i + 1}</span>
              <div className="fleet-step__body">
                <span className="fleet-step__role">{t.role}</span>
                <span className="fleet-step__label">{t.label}</span>
                <span className="fleet-step__agent">{agentName(t.agentId)}</span>
              </div>
              <span className="fleet-step__status">
                {t.status === 'running' && <Loader2 size={12} className="fleet-spin" />}
                {t.status === 'completed' && <Check size={12} />}
                {t.status === 'error' && <AlertCircle size={12} />}
                {t.status === 'idle' && 'queued'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
