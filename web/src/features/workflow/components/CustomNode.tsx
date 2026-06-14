import React, { useContext, createContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NODE_TYPES_META } from '../constants/node-types';
import { getNodeSummary } from '../utils/node-summary';
import { nodeStyles } from '../styles/node.styles';
import type { FlowDirection } from '../types';

/** 方向上下文 */
export const DirectionContext = createContext<FlowDirection>('TB');

/** 自定义节点组件 */
function CustomNode({ id, data, type, selected }: NodeProps) {
  const direction = useContext(DirectionContext);
  const meta = NODE_TYPES_META[type || 'trigger'] || NODE_TYPES_META.trigger;
  const summary = getNodeSummary(type || '', data as Record<string, any>);
  const isCondition = type === 'condition';
  const isTrigger = type === 'trigger';
  const isEnd = type === 'end';
  const targetPos = direction === 'LR' ? Position.Left : Position.Top;
  const sourcePos = direction === 'LR' ? Position.Right : Position.Bottom;

  return (
    <div style={{
      ...nodeStyles.wrapper,
      borderColor: selected ? meta.color : 'rgba(255,255,255,0.1)',
      boxShadow: selected ? `0 0 24px ${meta.color}40` : '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      {/* 入口 Handle */}
      {!isTrigger && (
        <Handle type="target" position={targetPos} style={nodeStyles.handle} />
      )}

      {/* 头部 */}
      <div style={{ ...nodeStyles.header, borderColor: meta.color, background: meta.color }}>
        <span style={{ ...nodeStyles.icon, color: '#fff' }}>{meta.icon}</span>
        <span style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>{meta.label}</span>
      </div>

      {/* 摘要 */}
      {summary && <div style={nodeStyles.summary}>{summary}</div>}

      {/* 最终回复标记 */}
      {(data as any).isFinalReply && (
        <div style={{ padding: '3px 14px 6px', fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>📤 最终回复</div>
      )}

      {/* 出口 Handle */}
      {isCondition ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 14px 6px' }}>
            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>✅ 是</span>
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>❌ 否</span>
          </div>
          {direction === 'LR' ? (
            <>
              <Handle type="source" position={Position.Right} id="true"
                style={{ ...nodeStyles.handle, top: '35%', background: '#10b981' }} />
              <Handle type="source" position={Position.Right} id="false"
                style={{ ...nodeStyles.handle, top: '65%', background: '#ef4444' }} />
            </>
          ) : (
            <>
              <Handle type="source" position={Position.Bottom} id="true"
                style={{ ...nodeStyles.handle, left: '30%', background: '#10b981' }} />
              <Handle type="source" position={Position.Bottom} id="false"
                style={{ ...nodeStyles.handle, left: '70%', background: '#ef4444' }} />
            </>
          )}
        </>
      ) : !isEnd ? (
        <Handle type="source" position={sourcePos} style={nodeStyles.handle} />
      ) : null}
    </div>
  );
}

export default CustomNode;
