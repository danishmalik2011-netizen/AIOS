import { create } from 'zustand';
import type { WorkflowNodeData, WorkflowStatus } from '@/core/types';
import type { Node, Edge, OnNodesChange, OnEdgesChange } from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

interface WorkflowStore {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  status: WorkflowStatus;
  selectedNodeId: string | null;
  onNodesChange: OnNodesChange<Node<WorkflowNodeData>>;
  onEdgesChange: OnEdgesChange;
  addNode: (node: Node<WorkflowNodeData>) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<WorkflowNodeData>) => void;
  setSelectedNode: (id: string | null) => void;
  setStatus: (status: WorkflowStatus) => void;
  setWorkflowStatus: (status: WorkflowStatus) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  setNodes: (nodes: Node<WorkflowNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
}

const initialNodes: Node<WorkflowNodeData>[] = [];
const initialEdges: Edge[] = [];

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  status: 'running',
  selectedNodeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  addNode: (node) =>
    set((state) => ({ nodes: [...state.nodes, node] })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    })),

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  setStatus: (status) => set({ status }),

  addEdge: (edge) =>
    set((state) => ({ edges: [...state.edges, edge] })),

  removeEdge: (id) =>
    set((state) => ({ edges: state.edges.filter((e) => e.id !== id) })),

  updateNodeData: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    })),

  setWorkflowStatus: (status) => set({ status }),

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
}));

