/* ================================================
   AIOS CLI — Task Graph / Planner (TOOLING-PLAN Part 1A)

   Wires the app-layer orchestration engine into the terminal CLI:
     - planTask(goal)  -> decomposes a goal into a DAG of role-assigned
                          subtasks (Fleet Director: deterministic heuristic
                          + optional LLM refinement using the session brain).
     - renderPlanTree  -> ASCII tree of the DAG so the user sees the plan.
     - runPlan(plan)   -> executes the DAG via engine.runGraph, threading
                          upstream outputs forward, reporting progress to TUI.

   Reuses src/services/orchestration/{engine,director} and the provider
   registry's `complete` — no new inference code, just CLI glue.
   ================================================ */

import type { Agent, AgentRole, OrchestrationPlan, SubTask } from '@/core/types';
import { heuristicPlan, planGoal } from '@/services/orchestration/director';
import { runGraph, topologicalWaves, type GraphEdge } from '@/services/orchestration/engine';
import { complete } from '@/services/providers/registry';
import { getActiveSessionProvider } from '@/store/useChatStore';
import { ansi } from './ui';

/* ------------------------------------------------------------------ */
/*  Default fleet                                                      */
/* ------------------------------------------------------------------ */

const ROLE_LABEL: Record<AgentRole, string> = {
  planner: 'Architect',
  builder: 'CodeSmith',
  reviewer: 'Sentinel',
  tester: 'QA',
  deployer: 'Shipper',
  custom: 'Agent',
};

/**
 * Build a minimal fleet so the Director can assign roles. Each agent uses the
 * session's active provider/model (resolved at call time), so the CLI never
 * hardcodes a "brain".
 */
function buildFleet(): Agent[] {
  const { provider, model } = getActiveSessionProvider();
  const roles: AgentRole[] = ['planner', 'builder', 'reviewer', 'tester', 'deployer'];
  const now = Date.now();
  return roles.map((role, i) => ({
    id: `cli-${role}`,
    name: ROLE_LABEL[role],
    role,
    status: 'idle',
    avatar: ['◈', '⚒', '🛡', '✓', '🚀'][i] ?? '◈',
    description: `${ROLE_LABEL[role]} sub-agent`,
    model,
    provider,
    systemPrompt: `You are the ${ROLE_LABEL[role]} stage of the AIOS fleet pipeline. Be concise and produce a concrete, self-contained result.`,
    temperature: 0.4,
    maxTokens: 1024,
    currentTask: null,
    metrics: {
      tasksCompleted: 0,
      tokensUsed: 0,
      avgResponseTime: 0,
      successRate: 0,
      linesWritten: 0,
      filesModified: 0,
    },
    createdAt: now,
    lastActiveAt: now,
  }));
}

/* ------------------------------------------------------------------ */
/*  Plan                                                               */
/* ------------------------------------------------------------------ */

/**
 * Decompose a goal into a task graph. Uses the LLM-assisted Director when the
 * session has a key; otherwise falls back to the deterministic heuristic.
 */
export async function planTask(goal: string, signal?: AbortSignal): Promise<OrchestrationPlan> {
  const fleet = buildFleet();
  try {
    return await planGoal(goal, fleet, signal);
  } catch {
    return heuristicPlan(goal, fleet);
  }
}

/* ------------------------------------------------------------------ */
/*  Render the plan as an ASCII DAG tree (TOOLING-PLAN Part 1B: plan)  */
/* ------------------------------------------------------------------ */

const ROLE_GLYPH: Record<AgentRole, string> = {
  planner: '◈',
  builder: '⚒',
  reviewer: '🛡',
  tester: '✓',
  deployer: '🚀',
  custom: '•',
};

/**
 * Print the plan as an indented dependency tree. Roots (no deps) are top-level;
 * each dependent is nested under its first dependency so the DAG reads top-down.
 */
export function renderPlanTree(plan: OrchestrationPlan): string {
  const byId = new Map(plan.subtasks.map((s) => [s.id, s]));
  const children = new Map<string, SubTask[]>();
  const roots: SubTask[] = [];

  for (const t of plan.subtasks) {
    const parent = t.dependsOn[0];
    if (parent && byId.has(parent)) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(t);
    } else {
      roots.push(t);
    }
  }

  const lines: string[] = [];
  const head = plan.llmAssisted ? ansi.cyan('LLM-assisted') : ansi.gray('heuristic');
  lines.push(`  ${ansi.bold('PLAN')}  ${ansi.dim(plan.goal.slice(0, 70))}  ${head}`);
  lines.push('');

  const walk = (t: SubTask, depth: number): void => {
    const indent = '  '.repeat(depth);
    const glyph = ROLE_GLYPH[t.role] ?? '•';
    const status = t.status === 'completed' ? ansi.green('✓') : ansi.gray('·');
    lines.push(`${indent}${status} ${ansi.bold(glyph)} ${ansi.cyan(t.role.padEnd(8))} ${t.label}`);
    for (const c of children.get(t.id) ?? []) walk(c, depth + 1);
  };

  if (!roots.length) {
    // No dependencies — flat list.
    for (const t of plan.subtasks) walk(t, 0);
  } else {
    for (const r of roots) walk(r, 0);
  }

  // Show execution waves (parallelisable groups) for clarity.
  const edges: GraphEdge[] = plan.subtasks.flatMap((t) =>
    t.dependsOn.map((d) => ({ source: d, target: t.id })),
  );
  try {
    const waves = topologicalWaves(plan.subtasks, edges);
    lines.push('');
    lines.push(ansi.dim('  waves (each row runs in parallel):'));
    waves.forEach((w, i) => {
      const labels = w.map((id) => byId.get(id)?.role ?? id).join(', ');
      lines.push(`    ${ansi.gray(`#${i + 1}`)} ${labels}`);
    });
  } catch {
    /* cycle guard — should not happen from the Director */
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Execute the plan as a DAG                                          */
/* ------------------------------------------------------------------ */

export interface PlanRunHandlers {
  onNodeStart?: (t: SubTask) => void;
  onNodeProgress?: (t: SubTask, pct: number) => void;
  onNodeComplete?: (t: SubTask, output: string) => void;
  onNodeError?: (t: SubTask, msg: string) => void;
  onWave?: (ids: string[], index: number) => void;
}

/**
 * Run the plan through the orchestration engine. Each subtask becomes a
 * provider completion; upstream outputs are threaded in as context. Honours
 * `signal` for cancellation between/within waves.
 */
export async function runPlan(
  plan: OrchestrationPlan,
  handlers: PlanRunHandlers = {},
  signal?: AbortSignal,
): Promise<{ outputs: Record<string, string>; errors: Record<string, string>; skipped: string[]; cancelled: boolean }> {
  const edges: GraphEdge[] = plan.subtasks.flatMap((t) =>
    t.dependsOn.map((d) => ({ source: d, target: t.id })),
  );

  const result = await runGraph<SubTask>(
    plan.subtasks,
    edges,
    async (ctx) => {
      const task = ctx.node;
      const upstream = ctx.inputs
        .map((i) => {
          const out = i.output as string | undefined;
          return out ? `— Output of "${i.nodeId}":\n${out}` : '';
        })
        .filter(Boolean)
        .join('\n\n');

      const prompt =
        `Task: ${task.label}\nIntent: ${task.intent}` +
        (upstream ? `\n\nContext from upstream stages:\n${upstream}` : '');

      let ticks = 0;
      ctx.reportProgress(8);
      const res = await complete(
        {
          model: getActiveSessionProvider().model,
          system: `You are the ${task.role} stage of the AIOS fleet. Produce a concrete, self-contained result.`,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          maxTokens: 1024,
        },
        {
          preferred: getActiveSessionProvider().provider as any,
          signal,
          onDelta: () => {
            ticks += 1;
            ctx.reportProgress(Math.min(92, 8 + ticks * 2));
          },
        },
      );
      ctx.reportProgress(100);
      return res.content;
    },
    {
      onWave: (ids, i) => handlers.onWave?.(ids, i),
      onNodeStart: (n) => handlers.onNodeStart?.(n),
      onNodeProgress: (n, p) => handlers.onNodeProgress?.(n, p),
      onNodeComplete: (n, out) => handlers.onNodeComplete?.(n, out as string),
      onNodeError: (n, e) => handlers.onNodeError?.(n, e.message),
    },
    signal,
  );

  return {
    outputs: Object.fromEntries(
      Object.entries(result.outputs).map(([k, v]) => [k, v as string]),
    ),
    errors: result.errors,
    skipped: result.skipped,
    cancelled: result.cancelled,
  };
}
