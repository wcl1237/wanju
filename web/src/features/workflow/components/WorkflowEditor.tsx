import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as workflowApi from '../api';

// ==================== 节点类型定义 ====================

const NODE_TYPES_META: Record<string, { icon: string; label: string; color: string; desc: string }> = {
  trigger:    { icon: '⚡', label: '触发器',   color: '#10b981', desc: '工作流起始入口' },
  end:        { icon: '🏁', label: '结束',     color: '#ef4444', desc: '工作流终止节点' },
  reply:      { icon: '💬', label: '消息回复', color: '#3b82f6', desc: '发送固定文本回复' },
  llm_reply:  { icon: '🤖', label: 'AI 生成',  color: '#a855f7', desc: 'LLM 生成动态回复' },
  condition:  { icon: '🔀', label: '条件分支', color: '#f59e0b', desc: '根据条件走不同分支' },
  knowledge:  { icon: '📚', label: '知识检索', color: '#06b6d4', desc: '搜索知识库' },
  ticket:     { icon: '🎫', label: '创建工单', color: '#ec4899', desc: '创建客服工单' },
  extract:    { icon: '📝', label: '参数提取', color: '#f97316', desc: '从消息提取关键参数' },
  http:       { icon: '🌐', label: 'HTTP 请求', color: '#64748b', desc: '调用外部 API' },
};

// ==================== 自定义节点组件 ====================

function CustomNode({ data, type, selected }: NodeProps) {
  const meta = NODE_TYPES_META[type || 'trigger'] || NODE_TYPES_META.trigger;
  const summary = getNodeSummary(type || '', data as Record<string, any>);
  const isCondition = type === 'condition';
  const isTrigger = type === 'trigger';
  const isEnd = type === 'end';

  return (
    <div style={{
      ...nodeStyles.wrapper,
      borderColor: selected ? meta.color : 'rgba(255,255,255,0.1)',
      boxShadow: selected ? `0 0 24px ${meta.color}40` : '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      {/* 入口 Handle */}
      {!isTrigger && (
        <Handle type="target" position={Position.Top} style={nodeStyles.handle} />
      )}

      {/* 头部 */}
      <div style={{ ...nodeStyles.header, borderColor: meta.color }}>
        <span style={{ ...nodeStyles.icon, background: `${meta.color}20`, color: meta.color }}>{meta.icon}</span>
        <span style={{ ...nodeStyles.label, color: meta.color }}>{(data as any).label || meta.label}</span>
      </div>

      {/* 摘要 */}
      {summary && <div style={nodeStyles.summary}>{summary}</div>}

      {/* 出口 Handle */}
      {isCondition ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true"
            style={{ ...nodeStyles.handle, left: '30%', background: '#10b981' }} />
          <Handle type="source" position={Position.Bottom} id="false"
            style={{ ...nodeStyles.handle, left: '70%', background: '#ef4444' }} />
          <div style={nodeStyles.handleLabels}>
            <span style={{ color: '#10b981', fontSize: 10 }}>✅</span>
            <span style={{ color: '#ef4444', fontSize: 10 }}>❌</span>
          </div>
        </>
      ) : !isEnd ? (
        <Handle type="source" position={Position.Bottom} style={nodeStyles.handle} />
      ) : null}
    </div>
  );
}

function getNodeSummary(type: string, data: Record<string, any>): string {
  switch (type) {
    case 'trigger': return data.triggerDesc ? data.triggerDesc.slice(0, 30) : '触发条件';
    case 'extract': return data.params?.length ? `提取: ${data.params.join(', ')}` : '';
    case 'condition': return data.conditionField ? `${data.conditionField} ${data.conditionOp || '?'} ${data.conditionValue || ''}` : '';
    case 'reply': return data.replyText ? data.replyText.slice(0, 30) + (data.replyText.length > 30 ? '...' : '') : '';
    case 'llm_reply': return data.prompt ? data.prompt.slice(0, 30) + '...' : 'AI 生成回复';
    case 'knowledge': return data.query ? `查询: ${data.query.slice(0, 20)}` : '搜索知识库';
    case 'ticket': return data.title || '创建工单';
    case 'http': return data.url ? `${data.method || 'GET'} ${data.url.slice(0, 25)}` : '';
    default: return '';
  }
}

const nodeStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: '#1a1a2e', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 12,
    minWidth: 180, maxWidth: 240, padding: 0, cursor: 'pointer', transition: 'all 0.2s',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    borderLeft: '3px solid', borderRadius: '12px 12px 0 0',
  },
  icon: {
    width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 14, flexShrink: 0,
  },
  label: { fontSize: 13, fontWeight: 700 },
  summary: { padding: '8px 14px', fontSize: 11, color: '#94a3b8', lineHeight: '1.4' },
  handle: {
    width: 10, height: 10, borderRadius: '50%', background: '#a855f7',
    border: '2px solid #0f0f18',
  },
  handleLabels: {
    display: 'flex', justifyContent: 'space-between', padding: '0 20%',
    position: 'absolute' as const, bottom: -18, left: 0, right: 0,
  },
};

// ==================== 属性面板 ====================

const PropertyPanel: React.FC<{
  node: Node | null;
  onUpdate: (id: string, data: Record<string, any>) => void;
}> = ({ node, onUpdate }) => {
  if (!node) {
    return (
      <div style={panelStyles.empty}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👈</div>
        <div style={{ fontWeight: 600 }}>点击节点编辑属性</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>从左侧拖拽节点到画布，点击节点查看和修改配置</div>
      </div>
    );
  }

  const meta = NODE_TYPES_META[node.type || ''] || NODE_TYPES_META.trigger;
  const data = (node.data || {}) as Record<string, any>;
  const update = (patch: Record<string, any>) => onUpdate(node.id, { ...data, ...patch });

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>
        <span style={{ ...panelStyles.headerIcon, background: `${meta.color}20`, color: meta.color }}>{meta.icon}</span>
        <div>
          <div style={{ ...panelStyles.headerType, color: meta.color }}>{meta.label}</div>
          <div style={panelStyles.headerDesc}>{meta.desc}</div>
        </div>
      </div>

      {/* 节点标签 */}
      <div style={panelStyles.field}>
        <label style={panelStyles.label}>节点名称</label>
        <input style={panelStyles.input} value={data.label || ''} onChange={e => update({ label: e.target.value })} placeholder={meta.label} />
      </div>

      {/* 触发器：匹配条件设置 */}
      {node.type === 'trigger' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>触发条件描述</label>
            <textarea style={panelStyles.textarea} value={data.triggerDesc || ''}
              onChange={e => update({ triggerDesc: e.target.value })}
              placeholder="描述什么场景触发此工作流，如：用户要求退款或取消订单"
              rows={3} />
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>LLM 根据此描述匹配用户意图</div>
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>关键词（可选，逗号分隔）</label>
            <input style={panelStyles.input} value={(data.keywords || []).join(', ')}
              onChange={e => update({ keywords: e.target.value.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) })}
              placeholder="退款, 取消订单, 退货" />
            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>命中关键词可加速匹配</div>
          </div>
        </>
      )}

      {/* 根据类型渲染不同字段 */}
      {node.type === 'extract' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>提取参数（逗号分隔）</label>
            <input style={panelStyles.input}
              value={(data.params || []).join(', ')}
              onChange={e => update({ params: e.target.value.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) })}
              placeholder="订单号, 退款原因" />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>提取指导</label>
            <textarea style={panelStyles.textarea} value={data.extractPrompt || ''} onChange={e => update({ extractPrompt: e.target.value })} placeholder="额外提取指导说明" rows={2} />
          </div>
        </>
      )}

      {node.type === 'condition' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>判断字段</label>
            <input style={panelStyles.input} value={data.conditionField || ''} onChange={e => update({ conditionField: e.target.value })} placeholder="userMessage 或参数名" />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>操作符</label>
            <select style={panelStyles.select} value={data.conditionOp || 'contains'} onChange={e => update({ conditionOp: e.target.value })}>
              <option value="contains">contains 包含</option>
              <option value="equals">equals 等于</option>
              <option value="not_empty">not_empty 非空</option>
              <option value="has_result">has_result 有结果</option>
            </select>
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>比较值</label>
            <input style={panelStyles.input} value={data.conditionValue || ''} onChange={e => update({ conditionValue: e.target.value })} placeholder="比较值" />
          </div>
        </>
      )}

      {node.type === 'reply' && (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>回复文本</label>
          <textarea style={panelStyles.textarea} value={data.replyText || ''} onChange={e => update({ replyText: e.target.value })} placeholder="支持 {{参数名}} 占位符" rows={4} />
        </div>
      )}

      {node.type === 'llm_reply' && (
        <div style={panelStyles.field}>
          <label style={panelStyles.label}>生成提示词</label>
          <textarea style={panelStyles.textarea} value={data.prompt || ''} onChange={e => update({ prompt: e.target.value })} placeholder="根据工作流执行结果，生成友好的用户回复" rows={4} />
        </div>
      )}

      {node.type === 'knowledge' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>检索查询</label>
            <input style={panelStyles.input} value={data.query || ''} onChange={e => update({ query: e.target.value })} placeholder="留空则使用用户原始消息" />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>返回条数</label>
            <input style={panelStyles.input} type="number" value={data.topK || 3} onChange={e => update({ topK: parseInt(e.target.value) || 3 })} />
          </div>
        </>
      )}

      {node.type === 'ticket' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>工单标题</label>
            <input style={panelStyles.input} value={data.title || ''} onChange={e => update({ title: e.target.value })} placeholder="退款申请 - {{订单号}}" />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>分类</label>
            <select style={panelStyles.select} value={data.category || 'general'} onChange={e => update({ category: e.target.value })}>
              <option value="general">general 通用</option>
              <option value="refund">refund 退款</option>
              <option value="complaint">complaint 投诉</option>
              <option value="inquiry">inquiry 咨询</option>
            </select>
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>优先级</label>
            <select style={panelStyles.select} value={data.ticketPriority || 'medium'} onChange={e => update({ ticketPriority: e.target.value })}>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>描述</label>
            <textarea style={panelStyles.textarea} value={data.ticketDescription || ''} onChange={e => update({ ticketDescription: e.target.value })} rows={3} placeholder="退款原因: {{退款原因}}" />
          </div>
        </>
      )}

      {node.type === 'http' && (
        <>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>URL</label>
            <input style={panelStyles.input} value={data.url || ''} onChange={e => update({ url: e.target.value })} placeholder="https://api.example.com/..." />
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>方法</label>
            <select style={panelStyles.select} value={data.method || 'GET'} onChange={e => update({ method: e.target.value })}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div style={panelStyles.field}>
            <label style={panelStyles.label}>Body</label>
            <textarea style={panelStyles.textarea} value={data.body || ''} onChange={e => update({ body: e.target.value })} rows={3} placeholder='{"key": "{{value}}"}' />
          </div>
        </>
      )}
    </div>
  );
};

const panelStyles: Record<string, React.CSSProperties> = {
  container: { padding: 16, overflow: 'auto', height: '100%' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', textAlign: 'center', padding: 20 },
  header: { display: 'flex', gap: 10, alignItems: 'center', padding: '12px 0', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  headerIcon: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  headerType: { fontSize: 15, fontWeight: 700 },
  headerDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 },
  input: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' as const },
  select: { width: '100%', padding: '8px 12px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' as const },
  radioLabel: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.15s' },
  radioDot: { width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2 },
};

// ==================== 主编辑器 ====================

interface WorkflowEditorProps {
  workflowId: string;
  onBack: () => void;
}

const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ workflowId, onBack }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowMode, setWorkflowMode] = useState<'independent' | 'replace_input'>('independent');
  const [triggerDesc, setTriggerDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // 自定义节点类型
  const nodeTypes: NodeTypes = useMemo(() => {
    const types: Record<string, React.ComponentType<NodeProps>> = {};
    for (const key of Object.keys(NODE_TYPES_META)) {
      types[key] = CustomNode;
    }
    return types;
  }, []);

  // 加载工作流
  useEffect(() => {
    if (workflowId === 'new') {
      setWorkflowName('新建工作流');
      setWorkflowMode('independent');
      setTriggerDesc('');
      setNodes([{ id: 'trigger-1', type: 'trigger', position: { x: 400, y: 60 }, data: { label: '触发器' } }]);
      setEdges([]);
      return;
    }
    (async () => {
      try {
        const wf = await workflowApi.getWorkflow(workflowId);
        setWorkflowName(wf.name);
        setWorkflowMode(wf.mode || 'independent');
        setTriggerDesc(wf.triggerDescription || '');
        setNodes(wf.graph?.nodes || []);
        setEdges(wf.graph?.edges || []);
      } catch (e) { console.error(e); }
    })();
  }, [workflowId, setNodes, setEdges]);

  // 连接
  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({
      ...params,
      id: `e-${Date.now()}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' },
      style: { stroke: '#a855f780', strokeWidth: 2 },
      animated: true,
    }, eds));
  }, [setEdges]);

  // 选择节点
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => { setSelectedNode(null); }, []);

  // 更新节点数据
  const updateNodeData = useCallback((id: string, newData: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: newData } : n));
    setSelectedNode(prev => prev?.id === id ? { ...prev, data: newData } : prev);
  }, [setNodes]);

  // 拖拽添加节点
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowInstance) return;

    const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const meta = NODE_TYPES_META[type];
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: { label: meta?.label || type },
    };
    setNodes(nds => [...nds, newNode]);
  }, [reactFlowInstance, setNodes]);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    try {
      const graph = { nodes, edges };
      // 从触发器节点 data 中获取 triggerDescription（优先），或使用顶栏的 triggerDesc
      const triggerNode = nodes.find(n => n.type === 'trigger');
      const finalTriggerDesc = (triggerNode?.data as any)?.triggerDesc || triggerDesc;
      if (workflowId === 'new') {
        await workflowApi.createWorkflow({
          name: workflowName || '新工作流',
          triggerDescription: finalTriggerDesc,
          graph,
          mode: workflowMode,
        });
      } else {
        await workflowApi.updateWorkflow(workflowId, {
          name: workflowName,
          triggerDescription: finalTriggerDesc,
          graph,
          mode: workflowMode,
        });
      }
      onBack();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // 删除节点
  const onNodesDelete = useCallback((deleted: Node[]) => {
    if (deleted.some(n => selectedNode?.id === n.id)) setSelectedNode(null);
  }, [selectedNode]);

  return (
    <div style={editorStyles.root}>
      {/* 顶栏 */}
      <div style={editorStyles.topBar}>
        <button style={editorStyles.backBtn} onClick={onBack}>← 返回列表</button>
        <input style={editorStyles.nameInput} value={workflowName} onChange={e => setWorkflowName(e.target.value)} placeholder="工作流名称" />
        {/* 工作流模式切换 */}
        <div style={editorStyles.modeSwitch}>
          <button
            style={{ ...editorStyles.modeBtn, ...(workflowMode === 'independent' ? editorStyles.modeBtnActive : {}) }}
            onClick={() => setWorkflowMode('independent')}
          >🔒 独立</button>
          <button
            style={{ ...editorStyles.modeBtn, ...(workflowMode === 'replace_input' ? editorStyles.modeBtnReplace : {}) }}
            onClick={() => setWorkflowMode('replace_input')}
          >🔄 替代输入</button>
        </div>
        <button style={editorStyles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '💾 保存'}
        </button>
      </div>

      <div style={editorStyles.body}>
        {/* 左侧：节点面板 */}
        <div style={editorStyles.leftPanel}>
          <div style={editorStyles.panelTitle}>节点类型</div>
          {Object.entries(NODE_TYPES_META).map(([type, meta]) => (
            <div
              key={type}
              style={editorStyles.nodeItem}
              draggable
              onDragStart={e => { e.dataTransfer.setData('application/reactflow', type); e.dataTransfer.effectAllowed = 'move'; }}
            >
              <span style={{ ...editorStyles.nodeItemIcon, background: `${meta.color}20`, color: meta.color }}>{meta.icon}</span>
              <span style={editorStyles.nodeItemLabel}>{meta.label}</span>
            </div>
          ))}
        </div>

        {/* 中间：React Flow 画布 */}
        <div style={editorStyles.canvas} ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            colorMode="dark"
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' },
              style: { stroke: '#a855f780', strokeWidth: 2 },
              animated: true,
            }}
          >
            <Background color="#333" gap={20} />
            <Controls />
            <MiniMap
              nodeStrokeColor={(n) => NODE_TYPES_META[n.type || '']?.color || '#666'}
              nodeColor={(n) => NODE_TYPES_META[n.type || '']?.color + '30' || '#333'}
              style={{ background: '#12121a', borderRadius: 8 }}
            />
          </ReactFlow>
        </div>

        {/* 右侧：属性面板 */}
        <div style={editorStyles.rightPanel}>
          <PropertyPanel node={selectedNode} onUpdate={updateNodeData} />
        </div>
      </div>
    </div>
  );
};

const editorStyles: Record<string, React.CSSProperties> = {
  root: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0f' },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
    background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  backBtn: {
    padding: '6px 16px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
    border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer',
  },
  nameInput: {
    flex: 1, padding: '8px 14px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    color: '#f1f5f9', fontSize: 15, fontWeight: 600, outline: 'none',
  },
  saveBtn: {
    padding: '8px 20px', background: 'linear-gradient(135deg, #a855f7, #ec4899)',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  modeSwitch: {
    display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0,
  },
  modeBtn: {
    padding: '6px 14px', background: 'transparent', color: '#64748b',
    border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  modeBtnActive: { background: 'rgba(16,185,129,0.15)', color: '#10b981' },
  modeBtnReplace: { background: 'rgba(168,85,247,0.15)', color: '#a855f7' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  leftPanel: {
    width: 180, background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.06)',
    padding: '16px 12px', overflow: 'auto', flexShrink: 0,
  },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' as const },
  nodeItem: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
    borderRadius: 8, cursor: 'grab', marginBottom: 4,
    border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)',
    transition: 'background 0.15s',
  },
  nodeItemIcon: {
    width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 14, flexShrink: 0,
  },
  nodeItemLabel: { fontSize: 13, color: '#e2e8f0', fontWeight: 500 },
  canvas: { flex: 1 },
  rightPanel: {
    width: 280, background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0, overflow: 'auto',
  },
};

export default WorkflowEditor;
