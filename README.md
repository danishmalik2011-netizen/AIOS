# AIOS — AI Agent Operating System

> The single command center for AI-assisted software creation. Not a wrapper around a model — an operating system for orchestrating agents, memory, workflows, terminals, previews, and deployments in one cohesive, local-first desktop experience.

AIOS is designed as the next generation beyond Cursor, VS Code, Claude Code, and existing AI IDEs. It treats AI agents as first-class citizens of your development environment: they plan, build, review, test, and deploy — coordinated through visual workflows and grounded in persistent project memory.

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
| **Unified Providers** | Abstraction over Anthropic, OpenAI, Google, Ollama (local), and a mock provider |
| **Command Palette** | `Ctrl/Cmd+K` fuzzy command runner for navigation and actions |
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
├── store/                   # State layer — Zustand, one store per domain
│   ├── useSettingsStore.ts  # Navigation, layout, editor prefs, providers, secrets (persisted)
│   ├── useAgentStore.ts     # Agents + per-agent conversations
│   ├── useWorkflowStore.ts  # React Flow nodes/edges + orchestration status
│   ├── useProjectStore.ts   # File tree, open buffers, contents
│   ├── useGitStore.ts       # Repo status, staging, commits
│   ├── useMemoryStore.ts    # Knowledge base entries + filtering
│   ├── usePromptStore.ts    # Prompt templates (persisted)
│   ├── useTerminalStore.ts  # Terminal sessions + output
│   └── useNotificationStore.ts # Toast notifications (+ `toast` helper)
│
├── hooks/
│   ├── useAnimatedCounter.ts # rAF easing for KPI counters
│   └── useHotkeys.ts         # Global keyboard-shortcut binding
│
├── components/
│   ├── layout/              # AppShell, ActivityBar, Sidebar, StatusBar, ViewRouter
│   ├── command/             # CommandPalette (Ctrl/Cmd+K)
│   ├── dashboard/           # Dashboard + MetricsCards, AgentActivityFeed, ProgressTracker, ExecutionTimeline
│   ├── workflow/            # Custom React Flow node
│   ├── views/               # One component per activity: Agents, Workflow, Files, Git, Memory, Prompts, Terminal, Settings
│   └── shared/              # Design-system primitives: Button, IconButton, Input, Modal, Badge, Progress, Tooltip, Spinner, Toaster
│
└── styles/                  # Design tokens & global CSS
    ├── index.css            # CSS custom properties (colors, spacing, type, motion, z-index, layout)
    ├── glassmorphism.css    # Glass utility classes
    ├── animations.css       # Keyframes + animation utilities
    ├── typography.css       # Base type styles
    └── reset.css            # Normalize
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
Provider abstraction (settings.providers) ──▶ (future) live agent calls
```

Today the agents, git, terminal, and providers run on rich mock/simulation layers so the entire experience is explorable offline. Each store is the single seam where a real backend/CLI/provider integration plugs in — the UI never talks to a provider directly.

---

## 🚀 Getting Started

```bash
# From the project root
npm install          # install dependencies
npm run dev          # start the Vite dev server (http://localhost:5173)
npm run typecheck    # strict TypeScript check, no emit
npm run build        # type-check + production build
npm run preview      # preview the production build
```

Requires Node 18+.

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
- **Provider drivers** — the unified provider abstraction is ready for live Anthropic/OpenAI/Google/Ollama drivers.
- **Real orchestration engine** — the workflow graph is the contract for a background job runner executing agents in parallel.
- **Encrypted sync** — local-first today, with an opt-in path to sync encrypted project metadata across devices.
- **Live previews & deployments** — dedicated panes for web/desktop/mobile previews and release workflows.

---

## 🧱 Tech Stack

React 19 · TypeScript (strict) · Vite 6 · Zustand · React Flow (`@xyflow/react`) · Monaco Editor · Recharts · lucide-react

---

## 📄 License

Proprietary — internal project scaffold.
