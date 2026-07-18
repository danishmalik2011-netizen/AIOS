# AIOS — AI Agent Operating System

> The single command center for AI-assisted software creation. Not a wrapper around a model — an operating system for orchestrating agents, memory, workflows, terminals, previews, and deployments in one cohesive, local-first desktop experience.

AIOS is designed as the next generation beyond Cursor, VS Code, Claude Code, and existing AI IDEs. It treats AI agents as first-class citizens of your development environment: they plan, build, review, test, and deploy — coordinated through visual workflows and grounded in persistent project memory.

---

## 📁 Repository Structure & Deployment (READ THIS)

This is a **MIXED repo**. It contains two completely separate things that must
NEVER be confused with each other:

| Path | What it is | Deploys to Vercel? |
| --- | --- | --- |
| `src/`, `electron/`, `dist*/`, `dist-cli/`, `release/`, `vite.config.ts`, `tsconfig*.json`, root `package.json`, root `index.html` | **The Electron desktop app + headless CLI** (source code, NOT a website) | ❌ **NEVER** |
| `landing/` | **The marketing website** (static HTML/CSS/JS + the Windows installer in `landing/downloads/`) | ✅ **YES — this is the only thing Vercel serves** |

### How Vercel knows what to deploy
- Root `vercel.json` sets `"outputDirectory": "landing"`.
- Root `.vercelignore` is a hard guard: it ignores `*` and only allows `landing/**`,
  so even if config changes, the Electron app can never leak into a Vercel deploy.
- `landing/` has **no** `vercel.json` / `package.json` of its own — the root ones are the single source of truth.

### Deploying the website (the normal flow)
```bash
git add -A
git commit -m "update site"
git push        # Vercel auto-deploys landing/ → https://aiosapp.vercel.app
```
> The website is plain static files. There is **no build step** for it.

### Building / releasing the desktop app (does NOT touch Vercel)
```bash
npm install
npm run dist    # electron-builder → release/ (installers)
# Then copy the new installer into landing/downloads/ and update landing/downloads/latest.yml
git add landing/downloads/
git commit && git push   # only THEN does Vercel serve the new installer
```

### ⚠️ Golden rules
1. **Vercel = website only.** Never point Vercel at the repo root expecting the app.
2. **The `.exe` lives in `landing/downloads/` and is committed to git** so it deploys.
   Don't gitignore it.
3. **Root `index.html` / `vite-env.d.ts` / `tsc-*.txt` / `tsconfig.tsbuildinfo` are
   Electron build artifacts** — they are gitignored and must stay out of the website.

---

## ✨ Feature Overview

| Domain | Capability |
| --- | --- |
| **Mission Control** | Real-time dashboard: KPIs, agent activity feed, pipeline progress, execution timeline |
| **Multi-Agent Orchestration** | Configurable agent profiles (planner, builder, reviewer, tester, deployer, custom) with live status, metrics, and per-agent chat |
| **Visual Workflow Editor** | Node-graph canvas (React Flow) connecting agents into pipelines with a live inspector and run/pause controls |
| **Integrated Editor** | Monaco-powered code editor with a recursive file tree, tabbed buffers, and per-file edit state |
| **Isolated Terminals** | Multi-session terminal with a command interpreter and colored output streams |
| **Project Memory** | A structured knowledge base: architecture, requirements, conventions, decisions, bugs, tasks, documentation, conversations |
| **Git Management** | Staged/unstaged/untracked views, AI-assisted commit messages, and a commit-history timeline |
| **Prompt Library** | Reusable, categorized prompt templates with `{{variables}}`, favorites, and usage tracking |
| **Secret Management** | Local, masked API-key & environment-variable vault |
| **Unified Providers** | Live drivers for Anthropic, OpenAI, OpenAI-compatible, Ollama (local), SSE streams, plus a mock provider for offline exploration |
| **Command Palette** | `Ctrl/Cmd+K` fuzzy command runner for navigation and actions |
| **Headless CLI** | `aios "<prompt>"` runs one task; bare `aios` opens an interactive REPL — same agent runtime, tools, providers, and retry/backoff as the desktop app, wired to a Node transport + TUI |
| **Premium UX** | Dark glassmorphism theme, motion, dockable/resizable layout, keyboard-first navigation, toasts |

---

## 🏗️ Architecture

AIOS is built for modularity and future expansion into a full AI operating system. Concerns are cleanly separated:

```
src/
├── main.tsx                 # Entry — mounts App, loads global styles
├── App.tsx                  # Renders <AppShell/>
│
├── core/
│   └── types.ts             # Single source of truth for shared domain types
│
├── constants/
│   └── models.ts            # Model/provider constant catalog
│
├── types/
│   └── electron.d.ts        # Electron preload/IPC type declarations
│
├── services/                # Business logic + integrations (no UI)
│   ├── agentRuntime.ts      # Headless runAgentTurn — shared by desktop app AND CLI
│   ├── runManager.ts        # Run/session lifecycle management
│   ├── fleetTools.ts        # Fleet-wide tool surface
│   ├── orchestration/       # director.ts, engine.ts, workflowRunner.ts
│   ├── providers/           # anthropic, openai, ollama, openaiCompatible, sse,
│   │                        #   registry, keyVault, toolSchemas, types
│   ├── mcp/                 # MCP client + registry + types
│   ├── retrieval/           # lexical + semantic retrieval, index, types
│   └── plugins/             # pluginStore + types
│
├── cli/                     # NEW — headless `aios` command + interactive REPL
│   ├── index.ts             # Entry: arg parsing, REPL, one-shot task runner
│   ├── executor.ts          # Turn execution loop
│   ├── ui.ts                # TUI: banners, slash commands, markdown, bubbles
│   ├── config.ts            # Provider/key config + history persistence
│   ├── transport.ts         # Node transport for the agent runtime
│   ├── modal.ts             # In-terminal modal pages
│   └── providerCatalog.ts   # Built-in provider catalog
│
├── store/                   # State layer — Zustand, one store per domain
│   ├── useSettingsStore.ts  # Navigation, layout, editor prefs, providers, secrets (persisted)
│   ├── useAgentStore.ts     # Agents + per-agent conversations
│   ├── useChatStore.ts      # Chat threads
│   ├── useWorkflowStore.ts  # React Flow nodes/edges + orchestration status
│   ├── useOrchestratorStore.ts # Orchestration run state
│   ├── useRunStore.ts       # Active runs
│   ├── usePlanStore.ts      # Plans
│   ├── useProjectStore.ts   # File tree, open buffers, contents
│   ├── useGitStore.ts       # Repo status, staging, commits
│   ├── useMemoryStore.ts    # Knowledge base entries + filtering
│   ├── usePromptStore.ts    # Prompt templates (persisted)
│   ├── useTerminalStore.ts  # Terminal sessions + output
│   ├── usePermissionsStore.ts   # Tool/command approval state
│   ├── useCommandApprovalStore.ts # Command-approval modal state
│   ├── useDiffReviewStore.ts    # Diff-review modal state
│   ├── useFollowPanelStore.ts   # Agent-follow panel state
│   ├── useAutoAccessStore.ts    # Auto-access toggles
│   ├── useNotificationStore.ts  # Toast notifications (+ `toast` helper)
│   └── workspaceCache.ts    # Workspace file cache
│
├── hooks/
│   ├── useAnimatedCounter.ts # rAF easing for KPI counters
│   └── useHotkeys.ts         # Global keyboard-shortcut binding
│
├── components/
│   ├── layout/              # AppShell, ActivityBar, Sidebar, StatusBar, TopBar, ViewRouter
│   ├── command/             # CommandPalette (Ctrl/Cmd+K)
│   ├── dashboard/           # Dashboard + MetricsCards, AgentActivityFeed, ProgressTracker, ExecutionTimeline
│   ├── workflow/            # Custom React Flow node
│   ├── views/               # One component per activity: Agents, Workflow, Files, Git,
│   │                        #   Memory, Prompts, Terminal, Settings, Account, Notifications,
│   │                        #   Preview, Workspaces, AgentsFollowPanel
│   └── shared/              # Design-system primitives: Button, IconButton, Input, Modal,
│                            #   Badge, Progress, Tooltip, Spinner, Toaster, Dropdown,
│                            #   ContextMenu, AgentAvatar, AiosLogo, Wordmark, ProviderIcon,
│                            #   CommandApprovalModal, DiffReviewModal, ModelProviderDropdown
│
└── styles/                  # Design tokens & global CSS
    ├── index.css            # CSS custom properties (colors, spacing, type, motion, z-index, layout)
    ├── glassmorphism.css    # Glass utility classes
    ├── animations.css       # Keyframes + animation utilities
    ├── typography.css       # Base type styles
    ├── themes.css           # Theme definitions (dark + light)
    └── reset.css            # Normalize
```

### Project layout (beyond `src/`)

```
aios222/
├── src/                     # React + Electron renderer (see tree above)
├── electron/                # Electron main process: main, preload, ipc/ (fs, etc.)
├── cli/                     # (lives under src/cli) — see above
├── scripts/                 # build-cli.cjs, prepare-cli.cjs — CLI bundling
├── landing/                 # Standalone marketing site (Vercel) — index.html, app.js, downloads/
├── dist/                    # Vite renderer build output
├── dist-cli/                # esbuild CLI bundle → dist-cli/aios.cjs (the `aios` bin)
├── dist-electron/           # Electron main/preload build output
├── release/                 # electron-builder installer output (win/mac/linux)
└── public/                  # Static assets (logo.png, etc.)
```

### Layered design

1. **Design tokens** (`styles/index.css`) — every color, space, radius, shadow, and timing is a CSS custom property. A future light theme is a token swap, not a refactor.
2. **Shared primitives** (`components/shared`) — accessible, prop-driven building blocks that consume the tokens.
3. **State stores** (`store/`) — domain-scoped Zustand stores. UI selects narrow slices; local UI state stays in components.
4. **Feature views** (`components/views`) — self-contained surfaces composed from primitives + stores, routed by `ViewRouter`.
5. **Shell** (`components/layout/AppShell`) — the dockable frame (activity rail, resizable sidebar, main pane, status bar) that hosts the router, command palette, and toaster.

### Data flow

```
User action ──▶ Store action (Zustand) ──▶ State update ──▶ Selective re-render
                                     └────▶ toast() side-effects
Provider abstraction (settings.providers) ──▶ live agent calls (Anthropic/OpenAI/Ollama/MCP)
```

The app ships **real** integrations today: live provider drivers (Anthropic, OpenAI, OpenAI-compatible, Ollama/local, SSE), an MCP client for tool servers, a real orchestration engine (`services/orchestration`: director + engine + workflowRunner), and a headless agent runtime (`runAgentTurn`) that powers **both** the desktop app and the `aios` CLI. The UI never talks to a provider directly — every call flows through `services/providers` and the orchestration layer, keeping the renderer, CLI, and (future) backend behind one seam.

---

## 🚀 Getting Started

```bash
# From the project root
npm install          # install deps; `prepare` script auto-builds the CLI
npm run dev          # start the Vite dev server (http://localhost:5173)
npm run typecheck    # strict TypeScript check, no emit
npm run build        # type-check + production renderer build
npm run preview      # preview the production build

# Desktop app (Electron)
npm run dist         # build renderer + electron-builder → release/ installers

# Headless CLI
npm run cli          # build the `aios` CLI → dist-cli/aios.cjs
npm link             # (or npm i -g .) to expose the global `aios` command
aios --help          # one-shot: aios "add dark mode"  ·  REPL: just `aios`
```

Requires Node 18+. The CLI is bundled with esbuild (`scripts/build-cli.cjs`) into a
single self-contained `dist-cli/aios.cjs` and exposed via the `"bin": { "aios": ... }`
field in `package.json`.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Open the command palette |
| `Ctrl/Cmd + B` | Toggle the sidebar |
| `↑ / ↓` | Navigate the command palette |
| `Enter` | Run the selected command |
| `Esc` | Close palette / modal |

---

## 🎨 Design Language

- **Theme:** premium dark with a purple → blue accent (`--accent-primary: #7c5cff`).
- **Surfaces:** layered glassmorphism (`glass`, `glass-panel`, `glass-card`).
- **Motion:** spring-eased entrances, staggered lists, running-agent pulses — subtle, never noisy.
- **Layout:** activity rail + resizable context sidebar + main workspace + status bar, mirroring pro IDE ergonomics.
- **Responsive:** grids reflow and rails collapse; the app avoids horizontal scrolling at every breakpoint.

---

## 🔌 Extensibility (roadmap)

AIOS is scaffolded to grow into a complete AI OS:

- **Plugin SDK** — third-party agents, tools, integrations, and custom workflow nodes (Settings ▸ Plugins is the entry surface).
- **Provider drivers** — live Anthropic/OpenAI/OpenAI-compatible/Ollama/SSE drivers are in; the catalog (`cli/providerCatalog.ts` + `services/providers/registry.ts`) is the seam for adding more.
- **Real orchestration engine** — the workflow graph drives a background job runner (`services/orchestration`) executing agents in parallel; the same runtime backs the headless CLI.
- **Encrypted sync** — local-first today, with an opt-in path to sync encrypted project metadata across devices.
- **Live previews & deployments** — dedicated panes for web/desktop/mobile previews and release workflows.

---

## 🧱 Tech Stack

React 19 · TypeScript (strict) · Vite 6 · Electron 33 · electron-builder · Zustand · React Flow (`@xyflow/react`) · Monaco Editor · Recharts · lucide-react · esbuild (CLI bundle) · simple-git · node-pty

---

## 📄 License

Proprietary — internal project scaffold.
