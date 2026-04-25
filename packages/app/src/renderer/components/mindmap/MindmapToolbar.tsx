import React from 'react'

interface Props {
  title: string
  selectedNodeId: string | null
  onAddRoot: () => void
  onAddChild: () => void
  onDeleteNode: () => void
  onEditNode: () => void
  onTitleChange: (title: string) => void
}

export default function MindmapToolbar({
  title, selectedNodeId, onAddRoot, onAddChild, onDeleteNode, onEditNode, onTitleChange,
}: Props) {
  return (
    <div style={{
      padding: '8px 16px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
    }}>
      <input
        value={title} onChange={(e) => onTitleChange(e.target.value)}
        style={{ fontWeight: 600, fontSize: 14, background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none', width: 200 }}
      />
      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
      <button onClick={onAddRoot} style={{ fontSize: 12 }}>+ 根节点</button>
      <button onClick={onAddChild} disabled={!selectedNodeId} style={{ fontSize: 12 }}>+ 子节点</button>
      <button onClick={onEditNode} disabled={!selectedNodeId} style={{ fontSize: 12 }}>编辑</button>
      <button onClick={onDeleteNode} disabled={!selectedNodeId} style={{ fontSize: 12, color: '#f38ba8', borderColor: '#f38ba8' }}>删除</button>
    </div>
  )
}
