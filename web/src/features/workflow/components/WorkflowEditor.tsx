/**
 * WorkflowEditor — 工作流编辑器主组件
 *
 * 重构: 从 901 行精简为 ~120 行，状态管理交给 Zustand，
 * 子组件分离为 CustomNode / NodePalette / PropertyPanel / WorkflowTopBar。
 */

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CustomNode, { DirectionContext } from './CustomNode';
import NodePalette from './NodePalette';
import PropertyPanel from './PropertyPanel';
import WorkflowTopBar from './WorkflowTopBar';
import { editorStyles } from '../styles/editor.styles';
import { NODE_TYPES_META } from '../constants/node-types';
import { useWorkflowEditorStore } from '../store/useWorkflowEditorStore';

interface WorkflowEditorProps {
  workflowId: string;
  onBack: () => void;
}

const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ workflowId, onBack }) => {
  const store = useWorkflowEditorStore();
  const [toast, setToast] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState(workflowId);

  // 构建 nodeTypes（只需一次）
  const nodeTypes: NodeTypes = useMemo(() => {
    const types: Record<string, React.FC<any>> = {};
    for (const key of Object.keys(NODE_TYPES_META)) {
      types[key] = CustomNode;
    }
    return types;
  }, []);

  // 加载数据
  useEffect(() => {
    store.loadWorkflow(workflowId);
    store.loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // 拖拽放置
  const reactFlowInstance = React.useRef<ReactFlowInstance | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      const meta = NODE_TYPES_META[type];
      store.addNode(type, position, meta?.label || type);
    },
    [store]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => store.selectNode(node),
    [store]
  );

  // 默认边样式
  const defaultEdgeOptions = useMemo(() => ({
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' },
    style: { stroke: '#a855f780', strokeWidth: 2 },
    animated: true,
  }), []);

  return (
    <DirectionContext.Provider value={store.direction}>
      <div style={editorStyles.root}>
        <WorkflowTopBar
          workflowName={store.workflowName}
          onNameChange={store.setWorkflowName}
          workflowMode={store.workflowMode}
          onModeChange={store.setWorkflowMode}
          direction={store.direction}
          onDirectionChange={store.setDirection}
          saving={store.saving}
          onSave={() => store.saveWorkflow(currentId, (newId) => {
            if (newId) setCurrentId(newId);
            setToast('✅ 保存成功');
            setTimeout(() => setToast(null), 2000);
          })}
          onBack={onBack}
          onAIGenerate={(data) => {
            store.setNodes(data.nodes || []);
            store.setEdges(data.edges || []);
            setToast('✨ AI 工作流已生成');
            setTimeout(() => setToast(null), 3000);
          }}
        />

        {/* Toast 提示 */}
        {toast && (
          <div style={{
            position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
            padding: '8px 24px', background: 'rgba(16,185,129,0.9)', color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'fadeIn 0.2s ease',
          }}>{toast}</div>
        )}

        <div style={editorStyles.body}>
          <NodePalette />

          <div style={editorStyles.canvas}>
            <ReactFlowProvider>
              <ReactFlow
                nodes={store.nodes}
                edges={store.edges}
                nodeTypes={nodeTypes}
                onNodesChange={store.onNodesChange}
                onEdgesChange={store.onEdgesChange}
                onConnect={store.onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onNodesDelete={store.onNodesDelete}
                onPaneClick={() => store.selectNode(null)}
                onInit={(instance) => { reactFlowInstance.current = instance; }}
                defaultEdgeOptions={defaultEdgeOptions}
                
                style={{ background: '#0a0a0f' }}
              >
                <Background color="#1e293b40" gap={20} />
                <Controls />
              </ReactFlow>
            </ReactFlowProvider>
          </div>

          <div style={editorStyles.rightPanel}>
            <PropertyPanel
              node={store.selectedNode}
              onUpdate={store.updateNodeData}
              agents={store.agentList}
            />
          </div>
        </div>
      </div>
    </DirectionContext.Provider>
  );
};

export default WorkflowEditor;
