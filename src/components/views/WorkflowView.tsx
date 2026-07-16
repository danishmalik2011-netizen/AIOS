import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Play,
  Pause,
  Plus,
  X,
  Workflow as WorkflowIcon,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { IconButton } from '@/components/shared/IconButton';
import { Badge } from '@/components/shared/Badge';
import { WorkflowNode } from '@/components/workflow/WorkflowNode';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import { useAgentStore } from '@/store/useAgentStore';
import { toast } from '@/store/useNotificationStore';
import { runWorkflow } from '@/services/orchestration/workflowRunner';
import type { AgentStatus, WorkflowNodeData, WorkflowStatus } from '@/core/types';
import './WorkflowView.css';

/* Memoized at module scope so React Flow never warns about a new object. */
const nodeTypes: NodeTypes = {
  plannerNode: WorkflowNode,
  builderNode: WorkflowNode,
  reviewerNode: WorkflowNode,
  testerNode: WorkflowNode,
  deployerNode: WorkflowNode,
  default: WorkflowNode,
};

const STATUS_BADGE: Record<WorkflowStatus, 'default' | 'accent' | 'success' | 'warning' | 'error'> = {
  draft: 'default',
  running: 'accent',
  paused: 'warning',
  completed: 'success',
  failed: 'error',
};

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  draft: 'Draft',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
};

const AGENT_STATUS_OPTIONS: { value: AgentStatus; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
  { value: 'error', label: 'Error' },
  { value: 'completed', label: 'Completed' },
];

const MINIMAP_STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#5b6472',
  running: '#7c5cff',
  paused: '#ffb347',
  error: '#ff6b6b',
  completed: '#00d4aa',
};

export function WorkflowView() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const status = useWorkflowStore((s) => s.status);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const addNode = useWorkflowStore((s) => s.addNode);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const setStatus = useWorkflowStore((s) => s.setStatus);
  const addEdge = useWorkflowStore((s) => s.addEdge);

  const addCounter = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => stopRun, [stopRun]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  /* ---- Canvas interactions ---- */
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edge: Edge = {
        ...connection,
        id: `e-${connection.source}-${connection.target}`,
        animated: true,
      };
      addEdge(edge);
    },
    [addEdge],
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => setSelectedNode(node.id),
    [setSelectedNode],
  );

  const onPaneClick = useCallback(() => setSelectedNode(null), [setSelectedNode]);

  const minimapNodeColor = useCallback(
    (node: Node): string =>
      MINIMAP_STATUS_COLOR[(node.data as unknown as WorkflowNodeData).status] ??
      MINIMAP_STATUS_COLOR.idle,
    [],
  );

  /* ---- Toolbar actions ---- */
  const handleRun = useCallback(async () => {
    stopRun();
    const { nodes: current, edges: currentEdges } = useWorkflowStore.getState();
    if (current.length === 0) {
      toast.warning('Nothing to run', 'Add at least one node to the workflow.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('running');

    // Reset the pipeline to a clean state before executing.
    current.forEach((n) => updateNodeData(n.id, { status: 'idle', progress: 0 }));

    const agents = useAgentStore.getState().agents;
    toast.info('Orchestrating pipeline', 'Executing independent stages in parallel…');

    try {
      const result = await runWorkflow(
        current,
        currentEdges,
        agents,
        {
          onStatus: (id, s) => updateNodeData(id, { status: s }),
          onProgress: (id, p) => updateNodeData(id, { progress: p }),
          onWave: (ids, i) => {
            if (ids.length > 1) {
              toast.info(`Wave ${i + 1}`, `Running ${ids.length} stages in parallel.`);
            }
          },
        },
        controller.signal,
      );

      if (result.cancelled) return;

      const failedCount = Object.keys(result.errors).length;
      if (failedCount > 0) {
        setStatus('failed');
        toast.error('Pipeline finished with errors', `${failedCount} stage(s) failed or were skipped.`);
      } else {
        setStatus('completed');
        const anyLive = Object.values(result.outputs).some(
          (o) => o && typeof o === 'object' && (o as { simulated?: boolean }).simulated === false,
        );
        toast.success(
          'Pipeline complete',
          anyLive ? 'All stages executed with live models.' : 'Executed via offline simulation (add a key or run Ollama for live output).',
        );
      }
    } catch (err) {
      setStatus('failed');
      toast.error('Orchestration failed', (err as Error).message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [setStatus, stopRun, updateNodeData]);

  const handlePause = useCallback(() => {
    stopRun();
    setStatus('paused');
    toast.info('Workflow paused', 'Execution halted. Resume anytime.');
  }, [setStatus, stopRun]);

  const handleAddNode = useCallback(() => {
    addCounter.current += 1;
    const index = addCounter.current;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `node-${Date.now()}-${index}`;

    const node: Node<WorkflowNodeData> = {
      id,
      type: 'default',
      position: {
        x: 120 + (index % 4) * 90,
        y: 120 + index * 70,
      },
      data: {
        label: `Custom Node ${index}`,
        type: 'custom',
        description: 'A configurable custom workflow step. Connect it into the pipeline.',
        status: 'idle',
        progress: 0,
        config: {},
      },
    };
    addNode(node);
    setSelectedNode(id);
    toast.success('Node added', 'Configure it from the inspector panel.');
  }, [addNode, setSelectedNode]);

  /* ---- Inspector edits ---- */
  const handleLabelChange = useCallback(
    (value: string) => {
      if (selectedNodeId) updateNodeData(selectedNodeId, { label: value });
    },
    [selectedNodeId, updateNodeData],
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      if (selectedNodeId) updateNodeData(selectedNodeId, { description: value });
    },
    [selectedNodeId, updateNodeData],
  );

  const handleStatusChange = useCallback(
    (value: AgentStatus) => {
      if (selectedNodeId) updateNodeData(selectedNodeId, { status: value });
    },
    [selectedNodeId, updateNodeData],
  );

  const handleDelete = useCallback(() => {
    if (!selectedNodeId) return;
    removeNode(selectedNodeId);
    setSelectedNode(null);
    toast.info('Node removed', 'The node and its connections were deleted.');
  }, [selectedNodeId, removeNode, setSelectedNode]);

  return (
    <div className="workflow-view">
      <ReactFlow
        className="workflow-view__canvas"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true }}
        minZoom={0.25}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.4}
          color="var(--border-subtle)"
        />
        <Controls className="workflow-view__controls" showInteractive={false} />
        <MiniMap
          className="workflow-view__minimap"
          pannable
          zoomable
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={2}
          maskColor="rgba(8, 10, 16, 0.72)"
        />
      </ReactFlow>

      {/* ---- Floating toolbar ---- */}
      <div className="workflow-view__toolbar glass-panel">
        <div className="workflow-view__toolbar-status">
          <WorkflowIcon size={16} className="workflow-view__toolbar-glyph" />
          <span className="workflow-view__toolbar-title">Workflow</span>
          <Badge variant={STATUS_BADGE[status]} dot>
            {STATUS_LABEL[status]}
          </Badge>
        </div>

        <div className="workflow-view__toolbar-actions">
          <Button
            variant="primary"
            size="sm"
            icon={<Play size={15} />}
            onClick={handleRun}
            disabled={status === 'running'}
          >
            Run
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Pause size={15} />}
            onClick={handlePause}
            disabled={status !== 'running'}
          >
            Pause
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={15} />}
            onClick={handleAddNode}
          >
            Add Node
          </Button>
        </div>
      </div>

      {/* ---- Inspector ---- */}
      {selectedNode && (
        <aside className="workflow-view__inspector glass-heavy animate-fade-in">
          <header className="workflow-view__inspector-header">
            <div className="workflow-view__inspector-heading">
              <span className="workflow-view__inspector-eyebrow">Node</span>
              <h2 className="workflow-view__inspector-title">Inspector</h2>
            </div>
            <IconButton
              icon={<X size={16} />}
              tooltip="Close"
              variant="ghost"
              size="sm"
              onClick={onPaneClick}
              aria-label="Close inspector"
            />
          </header>

          <div className="workflow-view__inspector-body">
            <label className="workflow-view__field">
              <span className="workflow-view__field-label">Label</span>
              <input
                className="workflow-view__input glass-input"
                type="text"
                value={selectedNode.data.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="Node label"
              />
            </label>

            <label className="workflow-view__field">
              <span className="workflow-view__field-label">Description</span>
              <textarea
                className="workflow-view__textarea glass-input"
                value={selectedNode.data.description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                rows={4}
                placeholder="Describe what this step does"
              />
            </label>

            <label className="workflow-view__field">
              <span className="workflow-view__field-label">Status</span>
              <select
                className="workflow-view__select glass-input"
                value={selectedNode.data.status}
                onChange={(e) => handleStatusChange(e.target.value as AgentStatus)}
              >
                {AGENT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="workflow-view__field">
              <span className="workflow-view__field-label">Progress</span>
              <span className="workflow-view__field-value">
                {Math.round(selectedNode.data.progress)}%
              </span>
            </div>
          </div>

          <footer className="workflow-view__inspector-footer">
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={handleDelete}
              className="workflow-view__delete"
            >
              Delete Node
            </Button>
          </footer>
        </aside>
      )}
    </div>
  );
}
