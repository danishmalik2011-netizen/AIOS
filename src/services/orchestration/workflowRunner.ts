/* Bridges the orchestration engine to real providers: each workflow node
   becomes a provider completion, with upstream node outputs threaded in as
   context. Uses the registry to resolve each node's provider (no offline
   fallback). */

import type { Node, Edge } from '@xyflow/react';
import type { WorkflowNodeData, Agent, AgentStatus, ProviderType } from '@/core/types';
import { runGraph, type GraphEdge, type OrchestrationResult } from './engine';
import { complete } from '@/services/providers/registry';

export interface NodeOutput {
  content: string;
  provider: ProviderType;
  simulated: boolean;
}

export interface WorkflowRunHandlers {
  onStatus?: (nodeId: string, status: AgentStatus) => void;
  onProgress?: (nodeId: string, progress: number) => void;
  onComplete?: (nodeId: string, output: NodeOutput) => void;
  onError?: (nodeId: string, message: string) => void;
  onWave?: (nodeIds: string[], index: number) => void;
}

function pickAgent(data: WorkflowNodeData, agents: Agent[]): Agent | undefined {
  if (data.agentId) {
    const byId = agents.find((a) => a.id === data.agentId);
    if (byId) return byId;
  }
  return agents.find((a) => a.role === data.type);
}

export async function runWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  agents: Agent[],
  handlers: WorkflowRunHandlers = {},
  signal?: AbortSignal,
): Promise<OrchestrationResult> {
  const graphEdges: GraphEdge[] = edges.map((e) => ({ source: e.source, target: e.target }));

  return runGraph<Node<WorkflowNodeData>>(
    nodes,
    graphEdges,
    async (ctx) => {
      const data = ctx.node.data;
      const agent = pickAgent(data, agents);

      const upstream = ctx.inputs
        .map((i) => {
          const out = i.output as NodeOutput | undefined;
          return out?.content ? `— Output of "${i.nodeId}":\n${out.content}` : '';
        })
        .filter(Boolean)
        .join('\n\n');

      const prompt =
        `Task: ${data.label}\n${data.description}` +
        (upstream ? `\n\nContext from upstream stages:\n${upstream}` : '');

      let ticks = 0;
      ctx.reportProgress(8);

      const result = await complete(
        {
          model: agent?.model ?? (agent?.provider === 'anthropic' ? 'claude-opus-4-8' : 'gpt-4o-mini'),
          system: agent?.systemPrompt ?? `You are the ${data.type} stage of an AI software pipeline. Be concise and produce a concrete result.`,
          messages: [{ role: 'user', content: prompt }],
          temperature: agent?.temperature ?? 0.5,
          maxTokens: 512,
        },
        {
          preferred: agent?.provider as ProviderType | undefined,
          signal,
          onDelta: () => {
            ticks += 1;
            ctx.reportProgress(Math.min(92, 8 + ticks * 2));
          },
        },
      );

      ctx.reportProgress(100);
      return { content: result.content, provider: result.provider, simulated: result.simulated } satisfies NodeOutput;
    },
    {
      onWave: handlers.onWave,
      onNodeStart: (n) => handlers.onStatus?.(n.id, 'running'),
      onNodeProgress: (n, p) => handlers.onProgress?.(n.id, p),
      onNodeComplete: (n, out) => {
        handlers.onStatus?.(n.id, 'completed');
        handlers.onComplete?.(n.id, out as NodeOutput);
      },
      onNodeError: (n, e) => {
        handlers.onStatus?.(n.id, 'error');
        handlers.onError?.(n.id, e.message);
      },
    },
    signal,
  );
}
