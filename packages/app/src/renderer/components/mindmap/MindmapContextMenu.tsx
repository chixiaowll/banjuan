import React from 'react'
import { useMindmapStore } from './useMindmapStore.js'

interface Props {
  x: number
  y: number
  nodeId: string
  onClose: () => void
}

const NODE_TYPES = [
  { type: 'text', label: 'Text' },
  { type: 'note', label: 'Note' },
  { type: 'document', label: 'Document' },
  { type: 'annotation', label: 'Annotation' },
  { type: 'image', label: 'Image' },
  { type: 'link', label: 'Link' },
  { type: 'tag', label: 'Tag' },
]

export default function MindmapContextMenu({ x, y, nodeId, onClose }: Props) {
  const { addNode, addSiblingNode, removeNode, updateNodeData, setEditingNodeId, openSidePanel, rfNodes } = useMindmapStore()
  const node = rfNodes.find(n => n.id === nodeId)
  const isRoot = !node?.data.parentId

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 1000,
    background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    padding: '4px 0', minWidth: 180, fontSize: 13,
  }

  const itemStyle: React.CSSProperties = {
    padding: '8px 16px', cursor: 'pointer', display: 'block', width: '100%',
    border: 'none', background: 'none', textAlign: 'left', fontSize: 13,
    color: 'var(--text, #333)',
  }

  const divider = <div style={{ height: 1, background: 'var(--border, #e0e0e0)', margin: '4px 0' }} />

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} />
      <div style={menuStyle}>
        <button style={itemStyle} onClick={() => { addNode(nodeId); onClose() }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          Add Child
        </button>
        {!isRoot && (
          <button style={itemStyle} onClick={() => { addSiblingNode(nodeId); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Add Sibling
          </button>
        )}
        <button style={itemStyle} onClick={() => { setEditingNodeId(nodeId); onClose() }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          Edit Title
        </button>
        {divider}
        <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--text-muted, #999)', fontWeight: 600 }}>
          Convert to...
        </div>
        {NODE_TYPES.map(({ type, label }) => (
          <button key={type} style={{ ...itemStyle, paddingLeft: 24 }}
            onClick={() => { updateNodeData(nodeId, { nodeType: type }); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            {label}
          </button>
        ))}
        {divider}
        <button style={itemStyle} onClick={() => { openSidePanel('properties', nodeId); onClose() }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          Properties
        </button>
        {node?.data.nodeType === 'note' && node?.data.noteId && (
          <button style={itemStyle} onClick={() => { openSidePanel('noteEditor', nodeId); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Edit Note
          </button>
        )}
        {divider}
        {!isRoot && (
          <button style={{ ...itemStyle, color: '#e74c3c' }}
            onClick={() => { removeNode(nodeId); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Delete
          </button>
        )}
      </div>
    </>
  )
}
