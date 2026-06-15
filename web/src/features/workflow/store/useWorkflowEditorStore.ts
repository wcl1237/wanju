/**
 * WorkflowEditor Zustand Store — 统一管理编辑器状态
 */

import { create } from 'zustand';
import {
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from '@xyflow/react';
import type { FlowDirection } from '../types';
import type { Agent } from '../../agent/types';
import * as workflowApi from '../api';
import * as agentApi from '../../agent/api';
import { getUser } from '../../../shared/http-client';

/** 基于用户ID生成节点ID */
function generateNodeId(type: string): string {
  const user = getUser();
  const uid = user?.id?.slice(0, 6) || 'anon';
  const ts = Date.now().toString(36);
  return `${uid}_${type}_${ts}`;
}

interface WorkflowEditorState {
  // 图数据
  nodes: Node[];
  edges: Edge[];
  // 编辑器状态
  selectedNode: Node | null;
  workflowName: string;
  workflowMode: 'independent' | 'replace_input';
  triggerDesc: string;
  direction: FlowDirection;
  saving: boolean;
  // Agent 列表
  agentList: Agent[];

  // Node/Edge 变更
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodes: (updater: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void;

  // 连接
  onConnect: (params: Connection) => void;

  // 选择
  selectNode: (node: Node | null) => void;

  // 节点数据更新
  updateNodeData: (id: string, newData: Record<string, any>) => void;

  // 节点删除
  onNodesDelete: (deleted: Node[]) => void;

  // 编辑器属性
  setWorkflowName: (name: string) => void;
  setWorkflowMode: (mode: 'independent' | 'replace_input') => void;
  setDirection: (dir: FlowDirection) => void;

  // 拖拽添加
  addNode: (type: string, position: { x: number; y: number }, label: string) => void;

  // 加载
  loadWorkflow: (workflowId: string) => Promise<void>;
  loadAgents: () => Promise<void>;

  // 保存
  saveWorkflow: (workflowId: string, onSaved?: (newId?: string) => void) => Promise<void>;
}

export const useWorkflowEditorStore = create<WorkflowEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  workflowName: '',
  workflowMode: 'independent',
  triggerDesc: '',
  direction: 'TB',
  saving: false,
  agentList: [],

  onNodesChange: (changes) => {
    set(state => ({ nodes: applyNodeChanges(changes, state.nodes) }));
  },

  onEdgesChange: (changes) => {
    set(state => ({ edges: applyEdgeChanges(changes, state.edges) }));
  },

  setNodes: (updater) => {
    set(state => ({
      nodes: typeof updater === 'function' ? updater(state.nodes) : updater,
    }));
  },

  setEdges: (updater) => {
    set(state => ({
      edges: typeof updater === 'function' ? updater(state.edges) : updater,
    }));
  },

  onConnect: (params) => {
    set(state => ({
      edges: addEdge({
        ...params,
        id: `e-${Date.now()}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' },
        style: { stroke: '#a855f780', strokeWidth: 2 },
        animated: true,
      }, state.edges),
    }));
  },

  selectNode: (node) => set({ selectedNode: node }),

  updateNodeData: (id, newData) => {
    set(state => ({
      nodes: state.nodes.map(n => n.id === id ? { ...n, data: newData } : n),
      selectedNode: state.selectedNode?.id === id
        ? { ...state.selectedNode, data: newData }
        : state.selectedNode,
    }));
  },

  onNodesDelete: (deleted) => {
    const { selectedNode } = get();
    if (deleted.some(n => selectedNode?.id === n.id)) {
      set({ selectedNode: null });
    }
  },

  setWorkflowName: (name) => set({ workflowName: name }),
  setWorkflowMode: (mode) => set({ workflowMode: mode }),
  setDirection: (dir) => {
    set({ direction: dir });
    // 强制刷新节点 Handle 位置
    set(state => ({
      nodes: state.nodes.map(n => ({ ...n, data: { ...n.data, _dir: dir } })),
    }));
  },

  addNode: (type, position, label) => {
    const newNode: Node = {
      id: generateNodeId(type),
      type,
      position,
      data: { label },
    };
    set(state => ({ nodes: [...state.nodes, newNode] }));
  },

  loadWorkflow: async (workflowId) => {
    if (workflowId === 'new') {
      set({
        workflowName: '新建工作流',
        workflowMode: 'independent',
        triggerDesc: '',
        nodes: [{
          id: generateNodeId('trigger'),
          type: 'trigger',
          position: { x: 400, y: 60 },
          data: { label: '触发器', triggerType: 'intent' },
        }],
        edges: [],
      });
      return;
    }

    try {
      const wf = await workflowApi.getWorkflow(workflowId);
      if (wf) {
        set({
          workflowName: wf.name,
          workflowMode: wf.mode || 'independent',
          triggerDesc: wf.triggerDescription || '',
          nodes: wf.graph?.nodes || [],
          edges: wf.graph?.edges || [],
        });
      }
    } catch (e) { console.error(e); }
  },

  loadAgents: async () => {
    try {
      const agents = await agentApi.getAgents();
      set({ agentList: agents });
    } catch (e) { console.error(e); }
  },

  saveWorkflow: async (workflowId, onSaved) => {
    set({ saving: true });
    try {
      const { nodes, edges, workflowName, workflowMode, triggerDesc } = get();
      const graph = { nodes, edges };
      const triggerNode = nodes.find(n => n.type === 'trigger');
      const finalTriggerDesc = (triggerNode?.data as any)?.triggerDesc || triggerDesc;

      if (workflowId === 'new') {
        const created = await workflowApi.createWorkflow({
          name: workflowName || '新工作流',
          triggerDescription: finalTriggerDesc,
          graph,
          mode: workflowMode,
        });
        // 新建成功，回调传新 ID（用于 URL 更新）
        onSaved?.(created?.id);
      } else {
        await workflowApi.updateWorkflow(workflowId, {
          name: workflowName,
          triggerDescription: finalTriggerDesc,
          graph,
          mode: workflowMode,
        });
        onSaved?.();
      }
    } catch (e) { console.error(e); }
    set({ saving: false });
  },
}));
