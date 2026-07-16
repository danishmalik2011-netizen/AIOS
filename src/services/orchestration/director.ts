/* ================================================
   Fleet Director — the background "main agent".

   Takes a high-level goal and auto-assigns it across the specialised fleet
   (Architect plans, CodeSmith builds, Sentinel reviews, …). Decomposition is
   deterministic by default (keyword intent classifier — needs NO API key),
   with an OPTIONAL LLM pass that refines the plan when the active session's
   provider has a key. Either way, every subtask is handed a structured prompt
   carrying the SAME shared context plus the PRIOR agent's output, so the fleet
   shares one reality instead of working in silos.

   The optional LLM call — like every LLM call in the app — uses the provider/
   model of the session it was triggered from (getActiveSessionProvider), never
   a hardcoded brain.
   ================================================ */

import type { Node, Edge } from '@xyflow/react';
import type {
  Agent,
  AgentRole,
  OrchestrationPlan,
  SubTask,
  WorkflowNodeData,
} from '@/core/types';
import { complete } from '@/services/providers/registry';
import { getApiKey, providerNeedsKey } from '@/services/providers/keyVault';
import { getActiveSessionProvider } from '@/store/useChatStore';

const ROLE_ORDER: AgentRole[] = [
  'planner',
  'builder',
  'reviewer',
  'tester',
  'deployer',
];

const ROLE_LABEL_PREFIX: Record<AgentRole, string> = {
  planner: 'Plan',
  builder: 'Implement',
  reviewer: 'Review',
  tester: 'Test',
  deployer: 'Deploy',
  custom: 'Handle',
};

const ROLE_OUTPUT_HINT: Record<AgentRole, string> = {
  planner:
    'a concrete architecture/implementation plan: a checklist of tasks, key files, and the approach.',
  builder:
    'the working code/change, referencing the exact files and functions touched.',
  reviewer:
    'a review: bugs, security issues, type leaks, and a pass/fail verdict with specifics.',
  tester:
    'the tests written and a pass/fail summary with coverage notes.',
  deployer:
    'the build/deploy steps executed and the resulting artifact/URL.',
  custom: 'a concrete, self-contained result for the task.',
};

/* ------------------------------------------------------------------ */
/*  Intent classifier (deterministic, offline)                        */
/* ------------------------------------------------------------------ */

const INTENT_KEYWORDS: Record<AgentRole, RegExp> = {
  planner:
    /plan|design|architect|break down|spec|blueprint|outline|structure|decompos/i,
  builder:
    /build|implement|code|write|create|develop|add|fix|refactor|scaffold|generate/i,
  reviewer:
    /review|audit|security|lint|check|analy[sz]e|verify|inspect|quality/i,
  tester:
    /test|unit|coverage|qa|e2e|integration|spec(?:s)?\b/i,
  deployer:
    /deploy|ship|release|installer|vercel|publish|package|build (?:the )?(?:app|installer)/i,
  custom: /.*/,
};

/** Score each role by keyword hits; return the best-fit role. */
export function classifyIntent(goal: string): AgentRole {
  const text = goal.toLowerCase();
  let best: AgentRole = 'builder';
  let bestScore = 0;
  (Object.keys(INTENT_KEYWORDS) as AgentRole[]).forEach((role) => {
    if (role === 'custom') return;
    const matches = text.match(INTENT_KEYWORDS[role])?.length ?? 0;
    if (matches > bestScore) {
      bestScore = matches;
      best = role;
    }
  });
  return best;
}

/**
 * Map an intent to an ordered dependency chain of roles. The first role is the
 * primary; subsequent roles depend on the one before them so context flows
 * forward (planner -> builder -> reviewer -> …).
 */
function pipelineForIntent(role: AgentRole): AgentRole[] {
  switch (role) {
    case 'planner':
      return ['planner'];
    case 'reviewer':
      return ['reviewer'];
    case 'tester':
      return ['tester'];
    case 'deployer':
      return ['planner', 'builder', 'reviewer', 'tester', 'deployer'];
    case 'builder':
    default:
      return ['planner', 'builder', 'reviewer'];
  }
}

/** First agent in the fleet matching a role (used for auto-assignment). */
export function pickAgentByRole(role: AgentRole, agents: Agent[]): Agent | undefined {
  return agents.find((a) => a.role === role);
}

/* ------------------------------------------------------------------ */
/*  Deterministic plan (no network)                                    */
/* ------------------------------------------------------------------ */

export function heuristicPlan(goal: string, agents: Agent[]): OrchestrationPlan {
  const primary = classifyIntent(goal);
  const chain = pipelineForIntent(primary);
  const subtasks: SubTask[] = [];
  let prevId: string | undefined;

  chain.forEach((role, i) => {
    const id = `task-${i + 1}-${role}`;
    const agent = pickAgentByRole(role, agents);
    subtasks.push({
      id,
      role,
      label: `${ROLE_LABEL_PREFIX[role]}: ${truncate(goal, 80)}`,
      intent: goal,
      dependsOn: prevId ? [prevId] : [],
      agentId: agent?.id,
      status: 'idle',
    });
    prevId = id;
  });

  return { goal, subtasks, createdAt: Date.now(), llmAssisted: false };
}

/* ------------------------------------------------------------------ */
/*  Optional LLM-assisted plan (uses the active session's provider)    */
/* ------------------------------------------------------------------ */

interface LlmStep {
  role: AgentRole;
  label: string;
  intent: string;
  dependsOn?: number[]; // 1-based indices into the returned list
}

/**
 * Refine the decomposition with an LLM. Uses the SESSION's provider/model, so
 * the Director "thinks" with whatever brain the user is currently talking to.
 * Falls back to the heuristic plan on any error or missing key.
 */
export async function planGoal(
  goal: string,
  agents: Agent[],
  signal?: AbortSignal,
): Promise<OrchestrationPlan> {
  const { provider, model } = getActiveSessionProvider();
  const needsKey = providerNeedsKey(provider);
  if (needsKey && !getApiKey(provider)) {
    return heuristicPlan(goal, agents);
  }

  const sys =
    'You are the Fleet Director, an orchestration planner. Given a user goal, ' +
    'decompose it into the smallest set of specialised-agent steps (roles: ' +
    'planner, builder, reviewer, tester, deployer). Respond ONLY with a JSON ' +
    'array of objects: {"role": string, "label": string, "intent": string, ' +
    '"dependsOn": number[]} where dependsOn uses 1-based indices of prior steps ' +
    'this step needs context from. Keep it to 2-5 steps.';

  try {
    const res = await complete(
      {
        model,
        system: sys,
        messages: [{ role: 'user', content: `Goal: ${goal}` }],
        temperature: 0.2,
        maxTokens: 800,
      },
      { preferred: provider as any, signal },
    );
    const steps = parseSteps(res.content);
    if (steps.length === 0) return heuristicPlan(goal, agents);

    const subtasks: SubTask[] = steps.map((s, i) => {
      const agent = pickAgentByRole(s.role, agents);
      const dependsOn = (s.dependsOn ?? [])
        .map((n) => `task-${n}-${steps[n - 1]?.role}`)
        .filter(Boolean);
      return {
        id: `task-${i + 1}-${s.role}`,
        role: s.role,
        label: s.label || `${ROLE_LABEL_PREFIX[s.role]}: ${truncate(goal, 80)}`,
        intent: s.intent || goal,
        dependsOn,
        agentId: agent?.id,
        status: 'idle',
      };
    });

    return { goal, subtasks, createdAt: Date.now(), llmAssisted: true };
  } catch {
    return heuristicPlan(goal, agents);
  }
}

function parseSteps(content: string): LlmStep[] {
  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.role === 'string' && ROLE_ORDER.includes(s.role))
      .map((s) => ({
        role: s.role as AgentRole,
        label: String(s.label ?? ''),
        intent: String(s.intent ?? ''),
        dependsOn: Array.isArray(s.dependsOn)
          ? (s.dependsOn as number[]).filter((n) => Number.isInteger(n) && n > 0)
          : [],
      }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Structured task prompt (shared context + prior-agent context)      */
/* ------------------------------------------------------------------ */

/**
 * The deliverable a completed subtask leaves behind, keyed by task id in
 * `priorOutputs`. Carrying the role + agent name + a short summary lets the
 * NEXT agent in the chain consume *typed* upstream context (LangGraph-style)
 * rather than one undifferentiated text blob.
 */
export interface StructuredOutput {
  taskId: string;
  role: AgentRole;
  agentName: string;
  /** Short one-line summary of what this stage produced (the "deliverable"). */
  deliverable: string;
  /** Full text the agent returned, forwarded verbatim to dependents. */
  content: string;
}

/**
 * Derive a one-line deliverable summary from a (possibly long) raw output, so
 * downstream agents get a labelled "what the previous stage handed me" without
 * having to re-read the whole blob.
 */
export function summarize(content: string, max = 160): string {
  const first = (content || '').split('\n').find((l) => l.trim().length > 0) ?? '';
  const clean = first.replace(/^[#*\-•\s]+/, '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean || '(no summary available)';
}

/**
 * Build the prompt handed to a single agent. It always carries the SAME shared
 * context (so every agent shares one reality) plus the typed outputs of the
 * agents it depends on (prior-agent context), plus an explicit role contract.
 *
 * Borrows two patterns from the agentic-engineering playbook:
 *  - CrewAI-style `goal` + `backstory`: each specialist is grounded in its
 *    roster description and told exactly what it must produce (and what it must
 *    NOT do), so roles don't bleed into one another.
 *  - LangGraph-style handoff: the Director explicitly delegates this task to
 *    the specialist and yields control, rather than re-summarising intent.
 */
export function buildTaskPrompt(
  task: SubTask,
  agent: { name: string; role: AgentRole; description: string },
  ctx: {
    sharedBrief: string;
    memory: string;
    priorOutputs: Record<string, StructuredOutput>;
  },
): string {
  const prior = task.dependsOn
    .map((id) => ctx.priorOutputs[id])
    .filter(Boolean) as StructuredOutput[];

  const lines = [
    '# Shared Context (same for every agent on this run)',
    ctx.sharedBrief || '(no project brief provided)',
  ];
  if (ctx.memory) lines.push(`\n# Project Memory\n${ctx.memory}`);

  lines.push(
    '',
    '# Handoff from the Fleet Director',
    `The Director decomposed the goal and delegated THIS task to you, ${agent.name}, ` +
      `the ${task.role} specialist. The Director stays orchestrator-only; you own this ` +
      `stage end-to-end and hand your deliverable to the next agent.`,
    '',
    `# Your Role: ${task.role}`,
    `Backstory: ${agent.description || `You are the ${task.role} agent.`}`,
    '',
    '## Role contract',
    `- You MUST stay strictly within your specialty (${task.role}) and must NOT do another agent's job.`,
    `- You MUST produce: ${ROLE_OUTPUT_HINT[task.role]}`,
    `- Be concrete and self-contained; downstream agents receive your output as context.`,
    '',
    '# Your Goal (what success looks like for this task)',
    task.intent,
  );

  if (prior.length > 0) {
    const upstream = prior
      .map((p) => {
        return [
          `### From ${p.agentName} (${p.role})`,
          `Deliverable: ${p.deliverable}`,
          '',
          p.content,
        ].join('\n');
      })
      .join('\n\n');
    lines.push(
      '',
      '# Context handed off by prior agents (build on these — do not repeat their work)',
      upstream,
    );
  }

  lines.push(
    '',
    '# Output format',
    `Return a concrete ${task.role}-appropriate deliverable. Lead with a one-line ` +
      'summary of what you produced, then the detail.',
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Emit a workflow graph (reuses the existing Workflow canvas/runner) */
/* ------------------------------------------------------------------ */

export function asGraph(plan: OrchestrationPlan): {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<WorkflowNodeData>[] = plan.subtasks.map((t, i) => ({
    id: t.id,
    position: { x: 120, y: 80 + i * 120 },
    data: {
      label: t.label,
      type: t.role as WorkflowNodeData['type'],
      description: t.intent,
      status: 'idle',
      progress: 0,
      agentId: t.agentId,
    } satisfies WorkflowNodeData,
  }));

  const idToIndex = new Map(plan.subtasks.map((t, i) => [t.id, i]));
  const edges: Edge[] = [];
  plan.subtasks.forEach((t) => {
    t.dependsOn.forEach((depId) => {
      const from = idToIndex.get(depId);
      const to = idToIndex.get(t.id);
      if (from !== undefined && to !== undefined) {
        edges.push({
          id: `e-${depId}-${t.id}`,
          source: plan.subtasks[from].id,
          target: plan.subtasks[to].id,
        });
      }
    });
  });

  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export { ROLE_ORDER };
