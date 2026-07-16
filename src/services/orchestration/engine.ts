/* ================================================
   Orchestration Engine
   Executes a workflow graph as a DAG with genuine parallel execution:
   every wave of dependency-free nodes runs concurrently. Independent of
   the UI and of any provider — `runNode` is injected, which keeps the
   scheduler pure and unit-testable.
   ================================================ */

export interface GraphNode {
  id: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface NodeInput {
  nodeId: string;
  output: unknown;
}

export interface RunNodeContext<N extends GraphNode> {
  node: N;
  /** Outputs of this node's direct predecessors. */
  inputs: NodeInput[];
  signal?: AbortSignal;
  reportProgress: (pct: number) => void;
}

export type RunNodeFn<N extends GraphNode> = (ctx: RunNodeContext<N>) => Promise<unknown>;

export interface OrchestrationCallbacks<N extends GraphNode> {
  onNodeStart?: (node: N) => void;
  onNodeProgress?: (node: N, progress: number) => void;
  onNodeComplete?: (node: N, output: unknown) => void;
  onNodeError?: (node: N, error: Error) => void;
  onWave?: (nodeIds: string[], waveIndex: number) => void;
}

export interface OrchestrationResult {
  outputs: Record<string, unknown>;
  errors: Record<string, string>;
  /** Nodes skipped because an upstream dependency failed. */
  skipped: string[];
  /** Execution waves, in order — each inner array ran in parallel. */
  waves: string[][];
  cancelled: boolean;
}

/** Compute execution waves via Kahn's algorithm. Throws on a cycle. */
export function topologicalWaves<N extends GraphNode>(nodes: N[], edges: GraphEdge[]): string[][] {
  const ids = new Set(nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n.id, 0);
    successors.set(n.id, []);
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    successors.get(e.source)!.push(e.target);
  }

  const waves: string[][] = [];
  let frontier = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let processed = 0;

  while (frontier.length) {
    waves.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      processed++;
      for (const s of successors.get(id) ?? []) {
        const d = (indegree.get(s) ?? 0) - 1;
        indegree.set(s, d);
        if (d === 0) next.push(s);
      }
    }
    frontier = next;
  }

  if (processed !== nodes.length) {
    throw new Error('Workflow graph contains a cycle — cannot orchestrate');
  }
  return waves;
}

function predecessorsOf(nodeId: string, edges: GraphEdge[]): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

/**
 * Run the graph. Nodes within a wave execute in parallel; a node whose
 * predecessor errored is skipped (failure propagates downstream).
 * Honours `signal` for cancellation between and during waves.
 */
export async function runGraph<N extends GraphNode>(
  nodes: N[],
  edges: GraphEdge[],
  runNode: RunNodeFn<N>,
  callbacks: OrchestrationCallbacks<N> = {},
  signal?: AbortSignal,
): Promise<OrchestrationResult> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const waves = topologicalWaves(nodes, edges);

  const outputs: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const skipped: string[] = [];
  const failed = new Set<string>();

  let cancelled = false;

  for (let w = 0; w < waves.length; w++) {
    if (signal?.aborted) { cancelled = true; break; }
    const wave = waves[w];
    callbacks.onWave?.(wave, w);

    await Promise.all(
      wave.map(async (id) => {
        const node = byId.get(id)!;
        const preds = predecessorsOf(id, edges);

        // Propagate upstream failure.
        if (preds.some((p) => failed.has(p))) {
          failed.add(id);
          skipped.push(id);
          errors[id] = 'Skipped — an upstream node failed';
          callbacks.onNodeError?.(node, new Error(errors[id]));
          return;
        }

        const inputs: NodeInput[] = preds
          .filter((p) => p in outputs)
          .map((p) => ({ nodeId: p, output: outputs[p] }));

        callbacks.onNodeStart?.(node);
        try {
          const output = await runNode({
            node,
            inputs,
            signal,
            reportProgress: (pct) => callbacks.onNodeProgress?.(node, clamp(pct)),
          });
          if (signal?.aborted) { cancelled = true; return; }
          outputs[id] = output;
          callbacks.onNodeComplete?.(node, output);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (error.name === 'AbortError') { cancelled = true; return; }
          failed.add(id);
          errors[id] = error.message;
          callbacks.onNodeError?.(node, error);
        }
      }),
    );

    if (signal?.aborted) { cancelled = true; break; }
  }

  return { outputs, errors, skipped, waves, cancelled };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
