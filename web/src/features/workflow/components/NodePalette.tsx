import React from 'react';
import { NODE_TYPES_META } from '../constants/node-types';
import { editorStyles } from '../styles/editor.styles';

/** 左侧节点拖拽面板 */
const NodePalette: React.FC = () => {
  return (
    <div style={editorStyles.leftPanel}>
      <div style={editorStyles.panelTitle}>节点类型</div>
      {Object.entries(NODE_TYPES_META).map(([type, meta]) => (
        <div
          key={type}
          style={editorStyles.nodeItem}
          draggable
          onDragStart={e => {
            e.dataTransfer.setData('application/reactflow', type);
            e.dataTransfer.effectAllowed = 'move';
          }}
        >
          <span style={{ ...editorStyles.nodeItemIcon, background: `${meta.color}20`, color: meta.color }}>{meta.icon}</span>
          <span style={editorStyles.nodeItemLabel}>{meta.label}</span>
        </div>
      ))}
    </div>
  );
};

export default NodePalette;
