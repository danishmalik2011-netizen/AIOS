import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Agent, AgentStatus, ChatMessage, AgentRole } from '@/core/types';

/* ------------------------------------------------------------------ */
/*  Mock Data                                                         */
/* ------------------------------------------------------------------ */

const now = Date.now();

/* Medium-enforcement rule: every agent is required to keep the live Agent
   Canvas oriented (plans/todos + artifacts). Appended to each agent's base
   prompt so it survives context trimming and applies regardless of provider. */
const CANVAS_RULE = `

# Agent Canvas (mandatory for non-trivial work)
You have a live "Agent Canvas" panel the user watches alongside the chat. Keep it oriented:
- Before any multi-step implementation, call \`create_artifact\` with type "plan" (or \`update_plan\`) to lay out a checklist of todos.
- As you progress, call \`update_plan\` to move steps pending → active → done.
- Call \`create_artifact\` for any deliverable spec, doc, design, diagram, or code snippet.
- File edits and started dev servers are shown in the canvas automatically — do not describe them.
- This applies even when the user did not explicitly ask for a plan.`;

const mockAgents: Agent[] = [
  {
    id: 'agent-architect',
    name: 'Architect',
    role: 'planner',
    status: 'idle',
    avatar: '',
    description: 'Senior System Architect. Specializes in technical planning, decomposition, and architecture reviews.',
    model: 'gpt-4o',
    provider: 'openai',
    systemPrompt: 'You are Architect, a senior software architect agent. Analyze requirements, plan architectures, and break down tasks.',
    temperature: 0.5,
    maxTokens: 4096,
    currentTask: null,
    metrics: {
      tasksCompleted: 42,
      tokensUsed: 284200,
      avgResponseTime: 2.4,
      successRate: 0.95,
      linesWritten: 0,
      filesModified: 0,
    },
    createdAt: now - 86400000 * 5,
    lastActiveAt: now,
  },
  {
    id: 'agent-codesmith',
    name: 'CodeSmith',
    role: 'builder',
    status: 'idle',
    avatar: '',
    description: 'Lead Software Engineer. Writes clean, modular, fully typed code in whatever stack the task calls for.',
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    systemPrompt: 'You are CodeSmith, an expert polyglot software engineer. Write high-quality, production-ready code in whatever language and framework best fits the task and the existing project — do not default to any particular stack (e.g. React or Three.js) unless the request or the project calls for it.',
    temperature: 0.7,
    maxTokens: 4096,
    currentTask: null,
    metrics: {
      tasksCompleted: 87,
      tokensUsed: 624500,
      avgResponseTime: 3.1,
      successRate: 0.92,
      linesWritten: 4520,
      filesModified: 112,
    },
    createdAt: now - 86400000 * 5,
    lastActiveAt: now,
  },
  {
    id: 'agent-sentinel',
    name: 'Sentinel',
    role: 'reviewer',
    status: 'idle',
    avatar: '',
    description: 'Code Reviewer & Quality Gate. Performs strict static analysis, security audits, and type verification.',
    model: 'gpt-4o',
    provider: 'openai',
    systemPrompt: 'You are Sentinel, a strict code reviewer. Focus on bugs, security flaws, type leaks, and conventions.',
    temperature: 0.3,
    maxTokens: 4096,
    currentTask: null,
    metrics: {
      tasksCompleted: 64,
      tokensUsed: 198000,
      avgResponseTime: 1.8,
      successRate: 0.96,
      linesWritten: 0,
      filesModified: 0,
    },
    createdAt: now - 86400000 * 5,
    lastActiveAt: now,
  },
  {
    id: 'agent-testrunner',
    name: 'TestRunner',
    role: 'tester',
    status: 'completed',
    avatar: '',
    description: 'QA & Test Engineer. Automatically scaffolds unit tests, integration tests, and runs test suites.',
    model: 'gpt-4o-mini',
    provider: 'openai',
    systemPrompt: 'You are TestRunner, a QA test engineer. Write comprehensive Jest/Vitest unit tests covering all edge cases.',
    temperature: 0.5,
    maxTokens: 4096,
    currentTask: null,
    metrics: {
      tasksCompleted: 53,
      tokensUsed: 142000,
      avgResponseTime: 2.1,
      successRate: 0.94,
      linesWritten: 2150,
      filesModified: 53,
    },
    createdAt: now - 86400000 * 5,
    lastActiveAt: now,
  },
  {
    id: 'agent-deploybot',
    name: 'DeployBot',
    role: 'deployer',
    status: 'idle',
    avatar: '',
    description: 'DevOps & Deployment Specialist. Manages builds, packages installers, and deploys static previews.',
    model: 'gpt-4o',
    provider: 'openai',
    systemPrompt: 'You are DeployBot, a DevOps specialist. Manage script builds, Vercel deployments, and production setups.',
    temperature: 0.4,
    maxTokens: 4096,
    currentTask: null,
    metrics: {
      tasksCompleted: 29,
      tokensUsed: 67000,
      avgResponseTime: 1.5,
      successRate: 0.98,
      linesWritten: 120,
      filesModified: 8,
    },
    createdAt: now - 86400000 * 5,
    lastActiveAt: now,
  }
];

const mockConversations = new Map<string, ChatMessage[]>();

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface AgentStore {
  /* State */
  agents: Agent[];
  activeAgentId: string | null;
  conversations: Map<string, ChatMessage[]>;

  /* Actions */
  addAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  setActiveAgent: (id: string | null) => void;
  addMessage: (agentId: string, message: ChatMessage) => void;
  updateMessage: (agentId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  updateAgentStatus: (id: string, status: AgentStatus) => void;
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      agents: mockAgents.map((a) => ({ ...a, systemPrompt: `${a.systemPrompt}${CANVAS_RULE}` })),
      activeAgentId: null,
      conversations: mockConversations,

  addAgent: (agent) =>
    set((s) => ({ agents: [...s.agents, agent] })),

  removeAgent: (id) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
    })),

  updateAgent: (id, patch) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  setActiveAgent: (id) => set({ activeAgentId: id }),

  addMessage: (agentId, message) =>
    set((s) => {
      const next = new Map(s.conversations);
      const msgs = next.get(agentId) ?? [];
      next.set(agentId, [...msgs, message]);
      return { conversations: next };
    }),

  updateMessage: (agentId, messageId, patch) =>
    set((s) => {
      const next = new Map(s.conversations);
      const msgs = next.get(agentId);
      if (!msgs) return {};
      next.set(
        agentId,
        msgs.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
      );
      return { conversations: next };
    }),

  updateAgentStatus: (id, status) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, status, lastActiveAt: Date.now() } : a,
      ),
    })),
    }),
    {
      // Only the agent roster (incl. user-set provider/model) is persisted;
      // live conversations are an in-memory Map and never serialized.
      name: 'aios-agent-fleet',
      partialize: (s) => ({ agents: s.agents }),
    },
  ),
);
