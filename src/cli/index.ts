/* ================================================
   AIOS CLI — entry point
   `aios "<prompt>"` runs one task; `aios` with no prompt
   drops into an interactive REPL (composer-style hotkeys,
   slash commands, multi-turn memory) — both reuse the app's
   headless agent runtime (runAgentTurn + provider registry)
   and the same tools, providers and retry/backoff as the
   desktop app, wired to a Node transport + TUI.

   Build: bundled with esbuild (scripts/build-cli.cjs) into
   dist-cli/aios.cjs, exposed via the `aios` bin.
   ================================================ */

import path from 'node:path';
import { runAgentTurn } from '@/services/agentRuntime';
import { AGENT_TOOLS } from '@/services/providers/toolSchemas';
import {
  getApiKey,
  hasApiKey,
  providerNeedsKey,
  setApiKey,
} from '@/services/providers/keyVault';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { Agent, ChatMessage } from '@/core/types';
import { listProviderModels } from '@/services/providers/registry';

import { createExecutor } from './executor';
import { resolveApiKey, resolveProviders, saveProvider, deleteProvider, maskKey, saveActive, loadActive, configPath, loadTheme, saveTheme, loadHistory, saveHistory } from './config';
import {
  printBanner, getBannerLines,
  printHelp, SLASH_COMMANDS, renderMarkdown,
  createTurnUI, startRepl, stdoutSink,
  ansi, toolBadge, promptSecret,
  renderBubble, renderEditorSnippet,
  setThemeColors, userThemeColor, agentThemeColor,
} from './ui';
import type { ModalPage, ModalController, ModalItem, TurnSink } from './ui';
import { PROVIDER_CATALOG, catalogById } from './providerCatalog';

const VERSION = '1.3.3';

interface ParsedArgs {
  prompt: string;
  model?: string;
  provider?: string;
  root: string;
  yes: boolean;
  interactive: boolean;
  temperature?: number;
  maxTokens?: number;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    prompt: '',
    root: process.cwd(),
    yes: false,
    interactive: false,
    help: false,
    version: false,
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h':
      case '--help':
        out.help = true;
        break;
      case '-v':
      case '--version':
        out.version = true;
        break;
      case '-y':
      case '--yes':
        out.yes = true;
        break;
      case '-i':
      case '--interactive':
        out.interactive = true;
        break;
      case '-m':
      case '--model':
        out.model = next();
        break;
      case '-p':
      case '--provider':
        out.provider = next();
        break;
      case '-r':
      case '--root':
        out.root = path.resolve(process.cwd(), next() ?? '.');
        break;
      case '-t':
      case '--temperature':
        out.temperature = Number(next());
        break;
      case '--max-tokens':
        out.maxTokens = Number(next());
        break;
      default:
        if (a.startsWith('--')) continue;
        positionals.push(a);
    }
  }
  out.prompt = positionals.join(' ').trim();
  return out;
}

/** Seed the in-memory key vault + provider list from env/config. */
function hydrateCredentials(provider?: string): void {
  const resolved = resolveProviders();
  const store = useSettingsStore.getState();

  // Seed or update custom providers in the store
  for (const p of resolved) {
    const cat = catalogById(p.id);
    const existing = store.providers.find((x) => x.id === p.id);
    let baseUrl = p.baseUrl ?? cat?.baseUrl;
    const kind = p.kind ?? cat?.kind ?? 'openai-compatible';
    
    // Auto-migrate built-in baseUrls if they were updated in the catalog
    if (cat && p.baseUrl && p.baseUrl !== cat.baseUrl) {
      const isBuiltIn = PROVIDER_CATALOG.some((x) => x.id === p.id);
      if (isBuiltIn) {
        baseUrl = cat.baseUrl;
        saveProvider({
          id: p.id,
          name: p.name ?? cat.name ?? p.id,
          kind: kind as any,
          baseUrl: baseUrl,
          models: p.models?.length ? p.models : (cat.defaultModels ?? []),
          apiKey: p.apiKey,
        });
      }
    } else if (!p.baseUrl && cat?.baseUrl) {
      // Proactively save resolved catalog details back to config.json if they were missing
      saveProvider({
        id: p.id,
        name: p.name ?? cat.name ?? p.id,
        kind: kind as any,
        baseUrl: baseUrl,
        models: p.models?.length ? p.models : (cat.defaultModels ?? []),
        apiKey: p.apiKey,
      });
    }

    if (existing) {
      existing.apiKeySet = !!p.apiKey;
      existing.isConfigured = !!p.apiKey || !!baseUrl;
      if (baseUrl) existing.baseUrl = baseUrl;
      existing.kind = kind as any;
      if (p.models?.length) existing.models = p.models;
    } else {
      store.addProvider({
        id: p.id,
        name: p.name ?? cat?.name ?? p.id,
        kind: kind as any,
        baseUrl: baseUrl,
        isConfigured: !!p.apiKey || !!baseUrl,
        isConnected: false,
        models: p.models ?? cat?.defaultModels ?? [],
        apiKeySet: !!p.apiKey,
      });
    }
  }

  const ids = new Set<string>(['anthropic', 'openai', 'openrouter', 'ollama']);
  resolved.forEach((p) => ids.add(p.id));
  if (provider) ids.add(provider);

  for (const id of ids) {
    const key = resolveApiKey(id);
    const cat = catalogById(id);
    const existing = store.providers.find((x) => x.id === id);
    if (existing) {
      const baseUrl = cat?.baseUrl ?? existing.baseUrl;
      if (baseUrl) existing.baseUrl = baseUrl;
      if (cat?.kind) existing.kind = cat.kind as any;
    }
    if (key) {
      setApiKey(id, key);
      if (existing) {
        existing.apiKeySet = true;
        existing.isConfigured = true;
      }
    } else {
      try { setApiKey(id, ''); } catch { /* ignore */ }
      if (existing) {
        existing.apiKeySet = false;
        if (existing.kind !== 'openai-compatible') {
          existing.isConfigured = false;
        }
      }
    }
  }
}

/** Provider/model-aware output-token ceiling.
 *  Many free/cheap endpoints hard-cap at 1024–2048 tokens; sending 4096
 *  triggers a 400.  Conservative per-provider defaults keep requests safe. */
function resolveMaxTokens(provider: string, model: string): number {
  // Known low-limit patterns (free tiers, small models, flash variants)
  if (/free|mini|haiku|flash|nano|lite|8b|tiny/i.test(model)) return 2048;
  const caps: Record<string, number> = {
    ollama: 2048,
    groq: 4096,
    together: 4096,
    fireworks: 4096,
    deepinfra: 4096,
    perplexity: 2048,
    cerebras: 4096,
  };
  return caps[provider] ?? 4096;
}

function buildAgent(provider: string, model: string, temperature?: number, maxTokens?: number): Agent {
  return {
    id: 'cli',
    name: 'AIOS CLI',
    role: 'custom',
    status: 'idle',
    avatar: '◈',
    description: 'Headless agentic CLI',
    model,
    provider,
    systemPrompt: buildSystemPrompt(provider, model),
    temperature: temperature ?? 0.4,
    maxTokens: maxTokens ?? resolveMaxTokens(provider, model),
    currentTask: null,
    metrics: {
      tasksCompleted: 0,
      tokensUsed: 0,
      avgResponseTime: 0,
      successRate: 0,
      linesWritten: 0,
      filesModified: 0,
    },
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

async function ensureProviderKey(id: string): Promise<boolean> {
  if (!providerNeedsKey(id as any)) return true;
  const existing = resolveApiKey(id) ?? getApiKey(id as any);
  if (existing) return true;

  const store = useSettingsStore.getState();
  const cat = catalogById(id);
  const p = store.providers.find((x) => x.id === id);
  let key = '';

  if (activeRepl) {
    const outcome = await activeRepl.openModal(
      {
        kind: 'input',
        title: `API KEY · ${id.toUpperCase()}`,
        secret: true,
        placeholder: `Enter API key for ${cat?.name ?? id}:`,
      },
      {
        onInput: () => null,
      }
    );
    if (outcome.type !== 'input' || !outcome.value) {
      process.stdout.write(ansi.red(`  ✖ no key provided for "${id}" — switch cancelled\n`));
      return false;
    }
    key = outcome.value;
  } else {
    const promptText = `  ${ansi.yellow('🔑')} ${ansi.bold(id)} needs an API key — paste it (hidden):`;
    const res = await promptSecret(promptText);
    if (!res) {
      process.stdout.write(ansi.red(`  ✖ no key provided for "${id}" — switch cancelled\n`));
      return false;
    }
    key = res;
  }

  setApiKey(id as any, key);
  
  const baseUrl = p?.baseUrl ?? cat?.baseUrl;
  const kind = p?.kind ?? cat?.kind ?? 'openai-compatible';
  const models = p?.models?.length ? p.models : (cat?.defaultModels ?? []);

  saveProvider({
    id,
    name: cat?.name ?? id,
    kind: kind as any,
    baseUrl: baseUrl,
    models: models,
    apiKey: key,
  });

  if (p) {
    p.apiKeySet = true;
    p.isConfigured = true;
    if (baseUrl) p.baseUrl = baseUrl;
    p.kind = kind as any;
    if (models.length) p.models = models;
  } else {
    store.addProvider({
      id,
      name: cat?.name ?? id,
      kind: kind as any,
      baseUrl: baseUrl,
      isConfigured: true,
      isConnected: false,
      models: models,
      apiKeySet: true,
    });
  }

  store.updateProviderApiKey(id, true);
  process.stdout.write(`  ${ansi.green('✓')} key saved for ${ansi.cyan(id)} → ${configPath()}\n`);
  return true;
}

function getFirstConfiguredProvider(): string | null {
  const store = useSettingsStore.getState();
  const match = store.providers.find((p) => p.apiKeySet || !providerNeedsKey(p.id as any));
  return match ? match.id : null;
}


/* eslint-disable @typescript-eslint/no-explicit-any */

/** Dynamic system prompt — injects runtime identity so the model knows
 *  exactly which model/provider it is, what date it is, and where it's
 *  working. This makes the agent self-aware ("which model are you?"). */
function buildSystemPrompt(provider: string, model: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const cwd  = process.cwd();
  const os   = process.platform === 'win32' ? 'Windows'
             : process.platform === 'darwin' ? 'macOS'
             : 'Linux';
  return `You are AIOS, an autonomous coding agent running in a terminal CLI.

Identity:
  Model:     ${model}
  Provider:  ${provider}
  Date:      ${date}
  OS:        ${os}
  Workspace: ${cwd}

Tools available:
  read_file      — read a file (use offset/limit for targeted reads)
  patch_file     — surgical find-and-replace in an existing file (preferred for edits)
  write_file     — create a new file or fully rewrite an existing one
  search_code    — search codebase for text or regex
  list_dir       — list directory contents
  run_command    — execute a shell command
  git_status     — show git status
  git_commit     — commit staged changes
  change_dir/cd  — change working directory (tool calls then use new dir)
  pwd            — print current directory
  wait           — pause N seconds

Rules (follow these exactly for large tasks):
  1. COMPLETE ALL STEPS before giving your final response. Never stop mid-task.
  2. File editing strategy:
     - patch_file  → for targeted edits to existing files (fastest, safest)
     - write_file  → for NEW files, or complete rewrites (< ~200 lines safe)
     - append_file → to ADD content at the end of an existing file
  3. Large file strategy (> ~150 lines):
     - NEVER write a huge file in one write_file call (truncation risk).
     - Instead: write_file(first chunk) → append_file(chunk2) → append_file(chunk3) …
     - After each append_file, check the returned "total lines" to verify nothing was lost.
     - If a file needs to be rebuilt, use read_file first to get the current content,
       then patch_file for targeted changes rather than rewriting the whole file.
  4. Read before writing — use read_file with offset/limit; never guess line numbers.
  5. After ALL work is done, write a concise summary as plain conversational text.
     Do NOT call any tool just to signal completion.
  6. If you are unsure about something, ask — do not guess and proceed.
  7. If the user asks who or what you are, answer using the Identity block above.`;
}


let activeRepl: any = null;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  // printBanner is called in one-shot mode below.
  // In REPL mode the banner is injected into the scrollback log after
  // startRepl() so that the full-screen redraw cycle cannot wipe it.

  // Resolve provider/model up front (shared by both modes). CLI flags win;
  // otherwise fall back to the last selection the user persisted.
  hydrateCredentials(args.provider);
  const saved = loadActive();
  
  let provider = args.provider?.toLowerCase();
  if (!provider) {
    if (saved.provider) {
      const store = useSettingsStore.getState();
      const p = store.providers.find((x) => x.id === saved.provider);
      if (p && (p.apiKeySet || !providerNeedsKey(p.id as any))) {
        provider = saved.provider.toLowerCase();
      }
    }
    if (!provider) {
      const configured = getFirstConfiguredProvider();
      if (configured) {
        provider = configured.toLowerCase();
      }
    }
    if (!provider) {
      provider = detectProvider().toLowerCase();
    }
  }

  let model = args.model ?? (provider === saved.provider?.toLowerCase() ? saved.model : undefined) ?? defaultModel(provider);

  // Load and apply user colors from theme configuration
  const theme = loadTheme();
  setThemeColors(theme.userColor ?? 'cyan', theme.agentColor ?? 'green');

  // Print the AIOS ASCII banner first thing on startup so the user gets context
  printBanner(VERSION);

  if (!provider) {
    process.stdout.write(
      ansi.red('  ✖ no provider available — set ANTHROPIC_API_KEY / OPENAI_API_KEY, or use --provider ollama\n'),
    );
    process.exit(1);
    return;
  }
  if (providerNeedsKey(provider) && !hasApiKey(provider) && !getApiKey(provider)) {
    if (args.prompt) {
      const fallback = detectProvider();
      if (fallback && fallback !== provider) {
        process.stdout.write(
          ansi.yellow(`  ⚠ no API key for "${provider}" — falling back to "${fallback}"\n`)
        );
        provider = fallback;
        model = defaultModel(provider);
      } else {
        process.stdout.write(
          ansi.red(`  ✖ no API key for "${provider}" — set the matching env var or add it to ${configPath()}\n`),
        );
        process.exit(1);
        return;
      }
    } else {
      // Prompt for the key on startup
      const ok = await ensureProviderKey(provider);
      if (!ok) {
        const fallback = detectProvider();
        if (fallback && fallback !== provider) {
          provider = fallback;
          model = defaultModel(provider);
        } else {
          process.stdout.write(ansi.red(`  ✖ no configured provider available. Exiting.\n`));
          process.exit(1);
          return;
        }
      }
    }
  }

  const agent = buildAgent(provider, model, args.temperature, args.maxTokens);
  const tools = AGENT_TOOLS;

  // The sink tool activity is streamed through. In REPL mode it's the REPL's
  // writer (so activity appears in the scrollback); in one-shot mode it falls
  // back to stdout. Updated once the REPL starts.
  let liveSink: TurnSink = stdoutSink;

  const executor = createExecutor({
    root: args.root,
    autoApprove: args.yes,
    prompt: args.interactive
      ? async (label) => {
          process.stdout.write(ansi.yellow(`  ? approve ${label}? [y/N] `));
          const r = (await readLine()).trim().toLowerCase();
          return r === 'y' || r === 'yes';
        }
      : undefined,
    onTool: (name, detail, extra) => {
      liveSink.line(toolBadge(name, detail));
      if (extra) {
        renderEditorSnippet(liveSink, name, detail, extra);
      }
    },
  });

  if (args.prompt) {
    // One-shot mode: banner is already printed above.
    const history: ChatMessage[] = [
      { id: 'u1', agentId: 'cli', role: 'user', content: args.prompt, timestamp: Date.now() },
    ];
    await runTurn(agent, provider, model, tools, executor, history, args.root);
    process.exit(0);
    return;
  }

  // ---- Interactive REPL mode ----
  let activeTemperature = args.temperature;
  let activeMaxTokens = args.maxTokens;
  let activeReasoningLevel = 'medium';

  const statusOf = (p: string, m: string) => ({
    provider: p,
    model: m,
    temperature: activeTemperature,
    maxTokens: activeMaxTokens,
    reasoningLevel: activeReasoningLevel,
  });

  const history: ChatMessage[] = loadHistory(args.root);
  let activeProvider = provider;
  let activeModel = model;
  let activeAgent = agent;

  /** Persist the active selection so it survives across CLI runs. */
  const persistSelection = () => saveActive({ provider: activeProvider, model: activeModel });

  /** Set by the slash-router (defined later) so onLine can delegate control
   *  commands (/provider, /model, …) before falling through to a message. */
  let replOnLineHook: ((line: string) => Promise<boolean>) | null = null;

  let activeAbortController: AbortController | null = null;

  const repl = startRepl({
    status: statusOf(activeProvider, activeModel),
    onExit: () => { /* handled by quit() */ },
    onAbort: () => {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
    },
    onLine: async (rawLine: string, ctx) => {
      liveSink = ctx.sink; // stream tool activity into the scrollback
      if (replOnLineHook && (await replOnLineHook(rawLine))) return;
      if (rawLine.trim()) {
        history.push({
          id: `u${history.length + 1}`,
          agentId: 'cli',
          role: 'user',
          content: rawLine,
          timestamp: Date.now(),
        });
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const bubble = renderBubble('user', timeStr, rawLine);
        repl.writer.line();
        for (const l of bubble.split('\n')) {
          repl.writer.line(l);
        }
        repl.writer.line();
      }
      if (providerNeedsKey(activeProvider as any)) {
        const ok = await ensureProviderKey(activeProvider);
        if (!ok) return;
      }
      activeAbortController = new AbortController();
      try {
        await runTurn(activeAgent, activeProvider, activeModel, tools, executor, history, args.root, ctx.sink, activeAbortController.signal);
      } finally {
        activeAbortController = null;
        saveHistory(args.root, history);
      }
    },
  });

  activeRepl = repl;

  // Inject the full banner into the REPL scrollback so it persists through
  // every full-screen redraw (the REPL erases the screen on each repaint).
  for (const line of getBannerLines(VERSION)) {
    repl.writer.line(line);
  }
  repl.writer.line(ansi.gray(`  running ${ansi.model(activeModel)} via ${ansi.provider(activeProvider)}`));
  repl.writer.line(ansi.gray('  /provider · /model · /status · /help · Ctrl+C to quit'));
  if (history.length > 0) {
    repl.writer.line(ansi.gray(`  (restored ${history.length} messages of project memory from active session)`));
    repl.writer.line();
  }

  /** Fetch the live model list for a provider (falls back to catalog defaults). */
  const fetchProviderModels = async (id: string): Promise<string[]> => {
    const cat = catalogById(id);
    try {
      const live = await listProviderModels(id as any);
      if (live.length) {
        // Cache in memory store
        const store = useSettingsStore.getState();
        const existing = store.providers.find((p) => p.id === id);
        if (existing) {
          existing.models = live;
        }
        // Persist to ~/.aios/config.json
        saveProvider({
          id,
          name: existing?.name ?? cat?.name ?? id,
          kind: (existing?.kind ?? cat?.kind ?? 'openai-compatible') as any,
          baseUrl: existing?.baseUrl ?? cat?.baseUrl,
          models: live,
        });
        return live;
      }
    } catch { /* ignore — fall through to defaults */ }
    const stored = useSettingsStore.getState().providers.find((p) => p.id === id);
    if (stored?.models?.length) return stored.models;
    return cat?.defaultModels ?? [];
  };

  // Prefetch the active provider's models in the background on startup
  void fetchProviderModels(activeProvider);

  /** Build the Commands page items. */
  const buildCommandItems = (): ModalItem[] => {
    return SLASH_COMMANDS.map((c) => ({
      id: c.name,
      label: c.name,
      description: c.description,
    }));
  };

  /** Build the Providers page items. */
  const buildProviderItems = (): ModalItem[] => {
    const store = useSettingsStore.getState();
    const known = new Map<string, { id: string; name: string; kind?: string }>();
    for (const c of PROVIDER_CATALOG) known.set(c.id, { id: c.id, name: c.name, kind: c.kind });
    for (const p of store.providers) if (!known.has(p.id)) known.set(p.id, { id: p.id, name: p.name, kind: p.kind });

    return [...known.values()].map((p) => {
      const keyed = resolveApiKey(p.id) ?? getApiKey(p.id as any);
      return {
        id: p.id,
        label: p.name,
        description: `${p.id}${keyed ? ' · key ✓' : ' · no key'}`,
        selected: p.id === activeProvider,
      };
    });
  };

  /** Build the Models page items for a given provider. */
  const buildModelItems = async (providerId: string): Promise<ModalItem[]> => {
    const models = await fetchProviderModels(providerId);
    if (models.length) {
      return models.map((m) => ({ id: m, label: m, selected: m === activeModel }));
    }
    const cat = catalogById(providerId);
    return [{
      id: '',
      dim: true,
      label: cat ? `no models yet for ${cat.name} — add a key & retry` : 'no models available',
    }];
  };

  const handleProviderSwitch = async (providerId: string): Promise<ModalPage | null> => {
    // Persist catalog entry into store
    const cat = catalogById(providerId);
    const store = useSettingsStore.getState();
    const existing = store.providers.find((p) => p.id === providerId);
    if (!existing) {
      store.addProvider({
        id: providerId,
        name: cat?.name ?? providerId,
        kind: (cat?.kind ?? 'openai-compatible') as any,
        baseUrl: cat?.baseUrl,
        models: cat?.defaultModels ?? [],
        isConfigured: true,
        isConnected: false,
        apiKeySet: true,
      });
    }

    const key = resolveApiKey(providerId) ?? getApiKey(providerId as any);
    if (key) setApiKey(providerId as any, key);

    activeProvider = providerId;
    const models = await fetchProviderModels(providerId);
    if (models.length === 0) {
      process.stdout.write(ansi.red(`  ✖ no models available for ${cat?.name ?? providerId}\n`));
      return null;
    }
    activeModel = models[0];
    activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
    const name = cat?.name ?? providerId;
    repl.setStatus(statusOf(activeProvider, activeModel));
    persistSelection();
    process.stdout.write(`  ${ansi.green('✓')} provider → ${ansi.cyan(name)}  ·  model ${ansi.cyan(activeModel)}\n`);

    const modelItems = await buildModelItems(activeProvider);
    return {
      kind: 'list',
      title: `MODELS — ${activeProvider}`,
      items: modelItems,
      searchable: true,
    };
  };

  /** Open the modal with the page stack: Commands → Providers → Key → Models. */
  const showModal = async (startPage: 'commands' | 'providers' | 'models'): Promise<void> => {
    const commandItems = buildCommandItems();
    const providerItems = buildProviderItems();

    // Find the "provider" and "model" command indices to auto-navigate.
    const providerCmdIdx = commandItems.findIndex((i) => i.id === '/provider');
    const modelCmdIdx = commandItems.findIndex((i) => i.id === '/model');

    const initialCommands: ModalPage = {
      kind: 'list',
      title: 'COMMANDS',
      items: commandItems,
      searchable: false,
      selectedId: startPage === 'providers' ? '/provider' : startPage === 'models' ? '/model' : undefined,
    };

    const controller: ModalController = {
      onSelect: async (item, page) => {
        // From Commands page
        if (page.kind === 'list' && page.title === 'COMMANDS') {
          if (item.id === '/provider') {
            return {
              kind: 'list',
              title: `PROVIDERS  (${providerItems.length})`,
              items: providerItems,
              searchable: true,
            };
          }
          if (item.id === '/model') {
            // Jump to Models for current active provider
            const modelItems = await buildModelItems(activeProvider);
            return {
              kind: 'list',
              title: `MODELS — ${activeProvider}`,
              items: modelItems,
              searchable: true,
            };
          }
          if (item.id === '/help') {
            printHelp();
            return null;
          }
          if (item.id === '/clear') {
            history.length = 0;
            saveHistory(args.root, history);
            process.stdout.write(ansi.gray('  conversation cleared\n'));
            return null;
          }
          if (item.id === '/exit' || item.id === '/quit') {
            repl.close();
            return null;
          }
          if (item.id === '/composer') {
            return {
              kind: 'list',
              title: 'COMPOSER SETTINGS',
              items: [
                { id: 'temp',    label: 'Temperature',      description: `Current: ${activeTemperature ?? 'default (0.7)'}` },
                { id: 'max',     label: 'Max Output Tokens', description: `Current: ${activeMaxTokens ?? 'default (4096)'}` },
                { id: 'reason',  label: 'Reasoning Effort',  description: `Current: ${activeReasoningLevel}` },
              ],
            };
          }
          if (item.id === '/theme') {
            return {
              kind: 'list',
              title: 'THEME CUSTOMIZER',
              items: [
                { id: 'user',  label: 'User Bubble Color',  description: `Current: ${userThemeColor}` },
                { id: 'agent', label: 'Agent Bubble Color', description: `Current: ${agentThemeColor}` },
              ],
            };
          }
          // For /plan, /explain, /refactor, /fix, /test — treat as message prefixes
          return null;
        }

        // From Providers page
        if (page.kind === 'list' && page.title.startsWith('PROVIDERS')) {
          const providerId = item.id;
          const cat = catalogById(providerId);
          const provName = cat?.name ?? providerId;
          const existingKey = resolveApiKey(providerId) ?? getApiKey(providerId as any);

          if (existingKey) {
            // Provider already has a key — show action sub-menu
            return {
              kind: 'list',
              title: `KEY · ${provName}`,
              items: [
                {
                  id: `use::${providerId}`,
                  label: `\u25b6  Use ${provName}`,
                  description: maskKey(existingKey),
                  selected: providerId === activeProvider,
                },
                {
                  id: `replace::${providerId}`,
                  label: `\u25c8  Replace key`,
                  description: 'enter a new API key',
                },
                {
                  id: `delete::${providerId}`,
                  label: `\u25cb  Delete key`,
                  description: 'removes key from config',
                },
              ],
            };
          }

          // No key — prompt immediately
          const ok = await ensureProviderKey(providerId);
          if (!ok) return null;
          return handleProviderSwitch(providerId);
        }

        // From Key sub-menu
        if (page.kind === 'list' && page.title.startsWith('KEY ·')) {
          if (item.id.startsWith('use::')) {
            const providerId = item.id.slice(5);
            return handleProviderSwitch(providerId);
          }

          if (item.id.startsWith('replace::')) {
            const providerId = item.id.slice(9);
            const cat = catalogById(providerId);
            const store = useSettingsStore.getState();
            const p = store.providers.find((x) => x.id === providerId);
            const promptText = `  ${ansi.yellow('\u25c8')} ${ansi.bold(providerId)} — paste new API key (hidden):`;
            const key = await promptSecret(promptText);
            if (!key) {
              process.stdout.write(ansi.red(`  \u2716 no key entered — unchanged\n`));
              return null;
            }
            setApiKey(providerId as any, key);
            saveProvider({
              id: providerId,
              name: cat?.name ?? providerId,
              kind: (p?.kind ?? 'openai-compatible') as any,
              baseUrl: p?.baseUrl ?? cat?.baseUrl,
              models: p?.models ?? cat?.defaultModels ?? [],
              apiKey: key,
            });
            store.updateProviderApiKey(providerId, true);
            process.stdout.write(`  ${ansi.green('\u2713')} key updated for ${ansi.cyan(providerId)}\n`);
            return handleProviderSwitch(providerId);
          }

          if (item.id.startsWith('delete::')) {
            const providerId = item.id.slice(8);
            deleteProvider(providerId);
            // Clear from in-memory vault
            try { setApiKey(providerId as any, ''); } catch { /* ignore */ }
            process.stdout.write(`  ${ansi.yellow('\u25cb')} key deleted for ${ansi.cyan(providerId)}\n`);
            // If this was the active provider, reset active provider models/status
            const store = useSettingsStore.getState();
            const existing = store.providers.find((x) => x.id === providerId);
            if (existing) {
              existing.apiKeySet = false;
              existing.isConfigured = false;
            }
            if (activeProvider === providerId) {
              process.stdout.write(ansi.dim('  active provider key deleted — select a provider with /provider\n'));
            }
            return null;
          }
          return null;
        }

        // From Models page
        if (page.kind === 'list' && page.title.startsWith('MODELS')) {
          if (item.id && !item.dim) {
            activeModel = item.id;
            activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
            repl.setStatus(statusOf(activeProvider, activeModel));
            persistSelection();
            process.stdout.write(`  ${ansi.green('✓')} model → ${ansi.cyan(item.id)}\n`);
          }
          return null;
        }
        
        // Theme customizer subpages inside Commands menu
        if (page.kind === 'list' && page.title === 'THEME CUSTOMIZER') {
          const target = item.id;
          const buildColorItems = () => [
            { id: 'cyan',       label: `${ansi.cyan('■')} Cyan`,             description: 'Bright teal-cyan' },
            { id: 'green',      label: `${ansi.green('■')} Green (Dark)`,     description: 'Classic console green' },
            { id: 'yellow',     label: `${ansi.yellow('■')} Yellow`,         description: 'Standard console yellow' },
            { id: 'red',        label: `${ansi.red('■')} Red`,               description: 'Standard console red' },
            { id: 'blue',       label: `${ansi.blue('■')} Blue`,             description: 'Standard console blue' },
            { id: 'magenta',    label: `${ansi.magenta('■')} Magenta`,       description: 'Standard console magenta' },
            { id: 'gray',       label: `${ansi.gray('■')} Gray`,             description: 'Dim gray' },
            { id: 'seafoam',    label: `${ansi.you('■')} Seafoam`,           description: 'Vibrant bright green' },
            { id: 'peach',      label: `${ansi.model('■')} Peach`,           description: 'Soft peach-amber' },
            { id: 'periwinkle', label: `${ansi.provider('■')} Periwinkle`,   description: 'Soft violet' },
          ];
          return {
            kind: 'list',
            title: target === 'user' ? 'SELECT USER COLOR' : 'SELECT AGENT COLOR',
            items: buildColorItems().map((x) => ({
              ...x,
              selected: target === 'user' ? x.id === userThemeColor : x.id === agentThemeColor,
            })),
          };
        }
        if (page.kind === 'list' && page.title === 'SELECT USER COLOR') {
          setThemeColors(item.id, agentThemeColor);
          saveTheme({ userColor: userThemeColor, agentColor: agentThemeColor });
          process.stdout.write(`  ${ansi.green('✓')} user bubble color updated to ${ansi.cyan(userThemeColor)}\n`);
          return null;
        }
        if (page.kind === 'list' && page.title === 'SELECT AGENT COLOR') {
          setThemeColors(userThemeColor, item.id);
          saveTheme({ userColor: userThemeColor, agentColor: agentThemeColor });
          process.stdout.write(`  ${ansi.green('✓')} agent bubble color updated to ${ansi.cyan(agentThemeColor)}\n`);
          return null;
        }
        // Composer settings subpages inside Commands menu
        if (page.kind === 'list' && page.title === 'COMPOSER SETTINGS') {
          if (item.id === 'temp') {
            return {
              kind: 'input',
              title: 'SET TEMPERATURE',
              placeholder: 'Enter temperature value (0.0 to 2.0):',
            };
          }
          if (item.id === 'max') {
            return {
              kind: 'input',
              title: 'SET MAX OUTPUT TOKENS',
              placeholder: 'Enter maximum tokens count (e.g. 4096):',
            };
          }
          if (item.id === 'reason') {
            const buildReasoningItems = () => [
              { id: 'off',    label: 'Off',    description: 'Disable thinking/reasoning' },
              { id: 'low',    label: 'Low',    description: 'Low reasoning effort (e.g. fast o3-mini)' },
              { id: 'medium', label: 'Medium', description: 'Balanced reasoning effort' },
              { id: 'high',   label: 'High',   description: 'Maximum reasoning effort (deep thinking)' },
            ];
            return {
              kind: 'list',
              title: 'SELECT REASONING EFFORT',
              items: buildReasoningItems().map((x) => ({
                ...x,
                selected: x.id === activeReasoningLevel,
              })),
            };
          }
        }
        if (page.kind === 'list' && page.title === 'SELECT REASONING EFFORT') {
          activeReasoningLevel = item.id;
          activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          process.stdout.write(`  ${ansi.green('✓')} reasoning effort updated to ${ansi.cyan(activeReasoningLevel)}\n`);
          return null;
        }

        return null;
      },
      onInput: async (value, page) => {
        if (page.title === 'SET TEMPERATURE') {
          const val = parseFloat(value.trim());
          if (isNaN(val) || val < 0 || val > 2) {
            process.stdout.write(ansi.red('  ✖ invalid temperature value (must be between 0.0 and 2.0)\n'));
            return null;
          }
          activeTemperature = val;
          activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          process.stdout.write(`  ${ansi.green('✓')} temperature updated to ${ansi.cyan(activeTemperature.toString())}\n`);
          return null;
        }
        if (page.title === 'SET MAX OUTPUT TOKENS') {
          const val = parseInt(value.trim(), 10);
          if (isNaN(val) || val <= 0) {
            process.stdout.write(ansi.red('  ✖ invalid max tokens count\n'));
            return null;
          }
          activeMaxTokens = val;
          activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          process.stdout.write(`  ${ansi.green('✓')} max output tokens updated to ${ansi.cyan(activeMaxTokens.toLocaleString())}\n`);
          return null;
        }
      },
    };

    // Start the modal at the Commands page (or directly at Providers/Models if specified)
    let rootPage: ModalPage = initialCommands;
    if (startPage === 'providers') {
      rootPage = {
        kind: 'list',
        title: `PROVIDERS  (${providerItems.length})`,
        items: providerItems,
        searchable: true,
      };
    } else if (startPage === 'models') {
      const modelItems = await buildModelItems(activeProvider);
      rootPage = {
        kind: 'list',
        title: `MODELS — ${activeProvider}`,
        items: modelItems,
        searchable: true,
      };
    }

    await repl.openModal(rootPage, controller);
  };

  const showThemeModal = async (): Promise<void> => {
    const buildColorItems = () => [
      { id: 'cyan',       label: `${ansi.cyan('■')} Cyan`,             description: 'Bright teal-cyan' },
      { id: 'green',      label: `${ansi.green('■')} Green (Dark)`,     description: 'Classic console green' },
      { id: 'yellow',     label: `${ansi.yellow('■')} Yellow`,         description: 'Standard console yellow' },
      { id: 'red',        label: `${ansi.red('■')} Red`,               description: 'Standard console red' },
      { id: 'blue',       label: `${ansi.blue('■')} Blue`,             description: 'Standard console blue' },
      { id: 'magenta',    label: `${ansi.magenta('■')} Magenta`,       description: 'Standard console magenta' },
      { id: 'gray',       label: `${ansi.gray('■')} Gray`,             description: 'Dim gray' },
      { id: 'seafoam',    label: `${ansi.you('■')} Seafoam`,           description: 'Vibrant bright green' },
      { id: 'peach',      label: `${ansi.model('■')} Peach`,           description: 'Soft peach-amber' },
      { id: 'periwinkle', label: `${ansi.provider('■')} Periwinkle`,   description: 'Soft violet' },
    ];

    const rootPage: ModalPage = {
      kind: 'list',
      title: 'THEME CUSTOMIZER',
      items: [
        { id: 'presets', label: 'Curated Theme Packs', description: 'Select a pre-configured design theme' },
        { id: 'user',  label: 'User Bubble Color',  description: `Current: ${userThemeColor}` },
        { id: 'agent', label: 'Agent Bubble Color', description: `Current: ${agentThemeColor}` },
      ],
    };

    const controller: ModalController = {
      onSelect: async (item, page) => {
        if (page.kind === 'list' && page.title === 'THEME CUSTOMIZER') {
          if (item.id === 'presets') {
            return {
              kind: 'list',
              title: 'CURATED THEME PACKS',
              items: [
                { id: 'dracula',    label: 'Dracula',    description: 'Vampire dark theme (Purple / Pink / Violet)' },
                { id: 'nord',       label: 'Nord',       description: 'Arctic blue theme (Cyan / Blue)' },
                { id: 'catppuccin', label: 'Catppuccin', description: 'Soft pastel theme (Teal / Peach)' },
                { id: 'monokai',    label: 'Monokai',    description: 'Classic dev contrast (Green / Yellow)' },
                { id: 'classic',    label: 'Classic',    description: 'Default terminal aesthetic (Cyan / Green)' },
              ],
            };
          }
          const target = item.id;
          return {
            kind: 'list',
            title: target === 'user' ? 'SELECT USER COLOR' : 'SELECT AGENT COLOR',
            items: buildColorItems().map((x) => ({
              ...x,
              selected: target === 'user' ? x.id === userThemeColor : x.id === agentThemeColor,
            })),
          };
        }
        if (page.kind === 'list' && page.title === 'CURATED THEME PACKS') {
          let userColor = 'cyan';
          let agentColor = 'green';
          if (item.id === 'dracula') {
            userColor = 'magenta';
            agentColor = 'periwinkle';
          } else if (item.id === 'nord') {
            userColor = 'cyan';
            agentColor = 'blue';
          } else if (item.id === 'catppuccin') {
            userColor = 'seafoam';
            agentColor = 'peach';
          } else if (item.id === 'monokai') {
            userColor = 'green';
            agentColor = 'yellow';
          }
          setThemeColors(userColor, agentColor);
          saveTheme({ userColor, agentColor });
          process.stdout.write(`  ${ansi.green('✓')} theme pack "${item.label}" applied successfully!\n`);
          return null;
        }
        if (page.kind === 'list' && page.title === 'SELECT USER COLOR') {
          setThemeColors(item.id, agentThemeColor);
          saveTheme({ userColor: item.id, agentColor: agentThemeColor });
          process.stdout.write(`  ${ansi.green('✓')} user bubble color updated to ${ansi.cyan(item.id)}\n`);
          return null;
        }
        if (page.kind === 'list' && page.title === 'SELECT AGENT COLOR') {
          setThemeColors(userThemeColor, item.id);
          saveTheme({ userColor: userThemeColor, agentColor: item.id });
          process.stdout.write(`  ${ansi.green('✓')} agent bubble color updated to ${ansi.cyan(item.id)}\n`);
          return null;
        }
      },
    };

    await repl.openModal(rootPage, controller);
  };

  const showComposerModal = async (): Promise<void> => {
    const buildReasoningItems = () => [
      { id: 'off',    label: 'Off',    description: 'Disable thinking/reasoning' },
      { id: 'low',    label: 'Low',    description: 'Low reasoning effort (e.g. fast o3-mini)' },
      { id: 'medium', label: 'Medium', description: 'Balanced reasoning effort' },
      { id: 'high',   label: 'High',   description: 'Maximum reasoning effort (deep thinking)' },
    ];

    const rootPage: ModalPage = {
      kind: 'list',
      title: 'COMPOSER SETTINGS',
      items: [
        { id: 'temp',    label: 'Temperature',      description: `Current: ${activeTemperature ?? 'default (0.7)'}` },
        { id: 'max',     label: 'Max Output Tokens', description: `Current: ${activeMaxTokens ?? 'default (4096)'}` },
        { id: 'reason',  label: 'Reasoning Effort',  description: `Current: ${activeReasoningLevel}` },
      ],
    };

    const controller: ModalController = {
      onSelect: async (item, page) => {
        if (page.kind === 'list' && page.title === 'COMPOSER SETTINGS') {
          if (item.id === 'temp') {
            return {
              kind: 'input',
              title: 'SET TEMPERATURE',
              placeholder: 'Enter temperature value (0.0 to 2.0):',
            };
          }
          if (item.id === 'max') {
            return {
              kind: 'input',
              title: 'SET MAX OUTPUT TOKENS',
              placeholder: 'Enter maximum tokens count (e.g. 4096):',
            };
          }
          if (item.id === 'reason') {
            return {
              kind: 'list',
              title: 'SELECT REASONING EFFORT',
              items: buildReasoningItems().map((x) => ({
                ...x,
                selected: x.id === activeReasoningLevel,
              })),
            };
          }
        }
        if (page.kind === 'list' && page.title === 'SELECT REASONING EFFORT') {
          activeReasoningLevel = item.id;
          activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          process.stdout.write(`  ${ansi.green('✓')} reasoning effort updated to ${ansi.cyan(activeReasoningLevel)}\n`);
          return null;
        }
      },
      onInput: async (value, page) => {
        if (page.title === 'SET TEMPERATURE') {
          const val = parseFloat(value.trim());
          if (isNaN(val) || val < 0 || val > 2) {
            process.stdout.write(ansi.red('  ✖ invalid temperature value (must be between 0.0 and 2.0)\n'));
            return null;
          }
          activeTemperature = val;
          activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          process.stdout.write(`  ${ansi.green('✓')} temperature updated to ${ansi.cyan(activeTemperature.toString())}\n`);
          return null;
        }
        if (page.title === 'SET MAX OUTPUT TOKENS') {
          const val = parseInt(value.trim(), 10);
          if (isNaN(val) || val <= 0) {
            process.stdout.write(ansi.red('  ✖ invalid max tokens count\n'));
            return null;
          }
          activeMaxTokens = val;
          activeAgent = buildAgent(activeProvider, activeModel, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          process.stdout.write(`  ${ansi.green('✓')} max output tokens updated to ${ansi.cyan(activeMaxTokens.toLocaleString())}\n`);
          return null;
        }
      },
    };

    await repl.openModal(rootPage, controller);
  };

  // Slash-command routing: /provider · /model open the control panel; /status
  // and /tokens show session info inline; other slash commands are delegated
  // to handleSlash and may resolve to a message.
  const routeLine = async (rawLine: string): Promise<boolean> => {
    const line = rawLine.trim();
    if (line === '/provider' || line === '/provider list') {
      await showModal('providers');
      return true;
    }
    if (line === '/theme') {
      await showThemeModal();
      return true;
    }
    if (line === '/composer') {
      await showComposerModal();
      return true;
    }
    if (line === '/model') {
      await showModal('models');
      return true;
    }
    if (line === '/status') {
      const msgs = history.length;
      const approxTok = history.reduce((a, m) => a + Math.ceil(m.content.length / 4), 0);
      const mt = resolveMaxTokens(activeProvider, activeModel);
      liveSink.line(`  ${ansi.bold('provider')}  ${ansi.provider(activeProvider)}`);
      liveSink.line(`  ${ansi.bold('model')}     ${ansi.model(activeModel)}  ${ansi.dim(`(max ${mt.toLocaleString()} output tokens)`)}`);
      liveSink.line(`  ${ansi.bold('root')}      ${ansi.gray(args.root)}`);
      liveSink.line(
        `  ${ansi.bold('history')}   ${ansi.gray(`${msgs} message${msgs !== 1 ? 's' : ''}`)}`  +
        (msgs ? ansi.dim(`  ·  ~${approxTok.toLocaleString()} tokens`) : ''),
      );
      liveSink.line();
      return true;
    }
    if (line === '/tokens') {
      const approxTok = history.reduce((a, m) => a + Math.ceil(m.content.length / 4), 0);
      liveSink.line(
        `  ${ansi.cyan('~' + approxTok.toLocaleString())} ${ansi.gray('estimated tokens')}  ` +
        ansi.dim(`(${history.length} message${history.length !== 1 ? 's' : ''} · ~4 chars/token)`),
      );
      liveSink.line();
      return true;
    }
    if (line.startsWith('/')) {
      const stop = await handleSlash(line, {
        getProvider: () => activeProvider,
        getModel: () => activeModel,
        setProvider: (p) => {
          activeProvider = p;
          activeAgent = buildAgent(p, activeModel, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          persistSelection();
        },
        setModel: (m) => {
          activeModel = m;
          activeAgent = buildAgent(activeProvider, m, activeTemperature, activeMaxTokens);
          repl.setStatus(statusOf(activeProvider, activeModel));
          persistSelection();
        },
        clear: () => { history.length = 0; },
        exit: () => repl.close(),
        yes: args.yes,
        interactive: args.interactive,
        root: args.root,
      });
      if (stop) return true;
      if (line === '/plan' || line.startsWith('/explain') || line.startsWith('/refactor') ||
          line.startsWith('/fix') || line.startsWith('/test')) {
        return false; // treat as a normal prompt
      }
      return true;
    }
    return false;
  };

  // Wire the router into the REPL's onLine (already declared above).
  replOnLineHook = routeLine;
}

interface SlashCtx {
  getProvider: () => string;
  getModel: () => string;
  setProvider: (p: string) => void;
  setModel: (m: string) => void;
  clear: () => void;
  exit: () => void;
  yes: boolean;
  interactive: boolean;
  root: string;
}

/** Returns true if the REPL should stop processing the line as a message. */
async function handleSlash(line: string, ctx: SlashCtx): Promise<boolean> {
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(' ').trim();

  switch (cmd) {
    case '/help':
      printHelp();
      return true;
    case '/exit':
    case '/quit':
      ctx.exit();
      return true;
    case '/clear':
      ctx.clear();
      process.stdout.write(ansi.gray('  conversation cleared\n'));
      return true;
    case '/model': {
      if (!arg) {
        process.stdout.write(`  ${ansi.cyan('model')}: ${ansi.bold(ctx.getModel())}\n`);
        return true;
      }
      ctx.setModel(arg);
      process.stdout.write(`  ${ansi.green('✓')} model → ${ansi.cyan(arg)}\n`);
      return true;
    }
    case '/provider': {
      const sub = rest[0];
      if (!sub || sub === 'list') {
        const providers = useSettingsStore.getState().providers;
        process.stdout.write('  providers:\n');
        for (const p of providers) {
          const mark = p.id === ctx.getProvider() ? ansi.green('●') : ansi.gray('○');
          const keyed = resolveApiKey(p.id) ? ansi.green('key') : ansi.gray('no-key');
          process.stdout.write(`    ${mark} ${ansi.bold(p.id.padEnd(14))} ${ansi.gray(p.kind ?? '')} ${keyed}\n`);
        }
        return true;
      }
      if (sub === 'set') {
        const id = rest[1];
        if (!id) {
          process.stdout.write(ansi.red('  usage: /provider set <id>\n'));
          return true;
        }
        const exists = useSettingsStore.getState().providers.some((p) => p.id === id);
        if (!exists) {
          process.stdout.write(ansi.red(`  unknown provider "${id}" — add it with /provider add\n`));
          return true;
        }
        // Prompt for a key if this provider needs one and none is available.
        const ok = await ensureProviderKey(id);
        if (!ok) return true;
        ctx.setProvider(id);
        // Load this provider's key from env/config into the in-memory vault
        // so the switch is immediately usable (selection carries the key).
        const key = resolveApiKey(id);
        if (key) setApiKey(id, key);
        process.stdout.write(`  ${ansi.green('✓')} provider → ${ansi.cyan(id)}\n`);
        return true;
      }
      if (sub === 'add') {
        // /provider add <id> --key sk-... [--url https://...] [--models a,b,c] [--kind openai-compatible]
        const id = rest[1];
        if (!id) {
          process.stdout.write(ansi.red('  usage: /provider add <id> --key sk-... [--url URL] [--models a,b]\n'));
          return true;
        }
        let key: string | undefined;
        let url: string | undefined;
        let models: string[] = [];
        let kind = 'openai-compatible';
        for (let i = 2; i < rest.length; i++) {
          if (rest[i] === '--key') key = rest[++i];
          else if (rest[i] === '--url') url = rest[++i];
          else if (rest[i] === '--models') models = rest[++i].split(',').map((s) => s.trim());
          else if (rest[i] === '--kind') kind = rest[++i];
        }
        if (id === 'anthropic' || id === 'openai') kind = id;
        if (id === 'ollama') kind = 'ollama';
        const store = useSettingsStore.getState();
        if (!store.providers.some((p) => p.id === id)) {
          store.addProvider({
            id,
            name: id,
            kind: kind as any,
            baseUrl: url,
            models,
            isConfigured: !!key || kind === 'ollama',
            isConnected: false,
            apiKeySet: !!key,
          });
        }
        if (key) {
          setApiKey(id, key);
          saveProvider({ id, name: id, kind: kind as any, baseUrl: url, apiKey: key, models });
        } else {
          saveProvider({ id, name: id, kind: kind as any, baseUrl: url, models });
        }
        process.stdout.write(`  ${ansi.green('✓')} provider ${ansi.cyan(id)} saved to ${configPath()}\n`);
        return true;
      }
      process.stdout.write(ansi.red(`  unknown /provider subcommand "${sub}"\n`));
      return true;
    }
    default:
      return false; // not a control command → send as message
  }
}

function stripThinkTags(text: string): string {
  return text
    .replace(/<think[^>]*>[\s\S]*?<\/think[^>]*>/gi, '')
    .replace(/<think[^>]*>[\s\S]*/gi, '')
    .trim();
}

async function runTurn(
  agent: Agent,
  provider: string,
  model: string,
  tools: typeof AGENT_TOOLS,
  executor: ReturnType<typeof createExecutor>,
  history: ChatMessage[],
  root: string,
  sink: TurnSink = stdoutSink,
  signal?: AbortSignal,
): Promise<void> {
  const ui = createTurnUI(model, sink);
  const currentCwd = (executor as any).getCwd ? (executor as any).getCwd() : root;
  const absCwd = path.resolve(currentCwd);
  const projectName = path.basename(path.resolve(root));

  const augmentedAgent = {
    ...agent,
    systemPrompt: (agent.systemPrompt || '') +
      `\n\n[PROJECT CONTEXT]\n` +
      `- Active Project Name: "${projectName}"\n` +
      `- Active Working Directory: "${absCwd}"\n` +
      `- Ensure all files you read, write, or search are resolved relative to this working directory.\n` +
      `- Do NOT assume other directories or projects. Always focus on this active working directory.\n\n` +
      `[CRITICAL INSTRUCTION]\n` +
      '- Ensure your final response is extremely structured, clear, and to the point.\n' +
      '- Use bullet points (pointers) for readability.\n' +
      '- Keep explanations brief and concise.\n' +
      '- Do not output `<think>` blocks in your response. Keep reasoning hidden.',
  };

  try {
    ui.start();
    const result = await runAgentTurn(
      augmentedAgent,
      history,
      { 
        onDelta: (d) => ui.onToken(d),
        signal,
      },
      { provider: provider as any, model },
      tools,
      executor,
    );
    ui.finish({ provider: result.provider, model: result.model, toolCalls: result.toolCallsExecuted });
    // Tokens were buffered in the spinner (never written to liveTail), so we
    // write the formatted response here — no double-display risk.
    if (result.content) {
      sink.line();
      const cleanContent = stripThinkTags(result.content);
      if (cleanContent) {
        const rendered = renderMarkdown(cleanContent);
        const bubble = renderBubble('assistant', result.model, rendered);
        for (const l of bubble.split('\n')) sink.line(l);
        sink.line();
      }
      history.push({
        id: `a${history.length + 1}`,
        agentId: 'cli',
        role: 'assistant',
        content: cleanContent,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError' || e.message?.includes('aborted') || signal?.aborted) {
      sink.line();
      sink.line(ansi.red('  ✖ generation aborted (Esc)'));
      sink.line();
      return;
    }
    const msg = e.message || 'Unknown error';
    // Parse common provider errors into human-friendly messages with hints.
    let friendly = msg;
    let hint = '';
    if (/context.*length|max.*token|token.*limit|too.*long|payload.*large/i.test(msg)) {
      friendly = `Context window exceeded for ${ansi.cyan(model)} on ${ansi.cyan(provider)}`;
      hint    = 'hint: /clear to reset history, or pick a model with a larger context window';
    } else if (/api.?key|no.*key|unauthorized|forbidden|auth/i.test(msg)) {
      friendly = `API key missing or invalid for ${ansi.cyan(provider)}`;
      hint    = 'hint: /provider to set a key, or check your environment variables';
    } else if (/rate.?limit|429|too many/i.test(msg)) {
      friendly = `Rate limited by ${ansi.cyan(provider)} — back off or switch models`;
      hint    = 'hint: /model to pick a faster or cheaper model';
    } else if (/model.*not.*found|no such model|invalid model|unknown model/i.test(msg)) {
      friendly = `Model ${ansi.cyan(model)} not found on ${ansi.cyan(provider)}`;
      hint    = 'hint: /model to pick an available model from the live list';
    } else if (/connect|network|econnrefused|enotfound|fetch.*fail/i.test(msg)) {
      friendly = `Cannot reach ${ansi.cyan(provider)} — check your network connection`;
    }
    ui.error(friendly + (hint ? `\n  ${hint}` : ''));
  }
}

function detectProvider(): string {
  if (hasApiKey('anthropic') || getApiKey('anthropic')) return 'anthropic';
  if (hasApiKey('openai') || getApiKey('openai')) return 'openai';
  if (hasApiKey('openrouter') || getApiKey('openrouter')) return 'openrouter';
  return 'ollama';
}

function defaultModel(provider: string): string {
  const p = useSettingsStore.getState().providers.find((x) => x.id === provider);
  if (p?.models?.length) return p.models[0];
  const fallback: Record<string, string> = {
    anthropic: 'claude-opus-4-8',
    openai: 'gpt-4o',
    openrouter: 'openai/gpt-4o',
    ollama: 'llama3',
  };
  return fallback[provider] ?? 'gpt-4o';
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, terminal: false });
    rl.once('line', (d: string) => {
      rl.close();
      resolve(d.trim());
    });
    rl.resume();
  });
}

void main();
