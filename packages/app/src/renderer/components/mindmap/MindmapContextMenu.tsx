import React from 'react'
import { useMindmapStore } from './useMindmapStore.js'

interface Props {
  x: number
  y: number
  nodeId: string
  onClose: () => void
}

const itemStyle: React.CSSProperties = {
  padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', width: '100%',
  border: 'none', background: 'none', textAlign: 'left', fontSize: 13,
  color: 'var(--text, #333)',
}

function hoverOn(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = 'var(--hover, #f5f5f5)' }
function hoverOff(e: React.MouseEvent<HTMLButtonElement>) { e.currentTarget.style.background = 'none' }

export default function MindmapContextMenu({ x, y, nodeId, onClose }: Props) {
  const { addNode, addFloatingNode, addSiblingNode, removeNode, setEditingNodeId, openSidePanel, rfNodes } = useMindmapStore()
  const node = rfNodes.find(n => n.id === nodeId)
  const isRoot = !node?.data.parentId && !node?.data.floating
  const canDelete = !isRoot

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 1000,
    background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    padding: '4px 0', minWidth: 180, fontSize: 13,
  }

  const divider = <div style={{ height: 1, background: 'var(--border, #e0e0e0)', margin: '4px 0' }} />

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} />
      <div style={menuStyle}>
        <button style={itemStyle} onClick={() => { addNode(nodeId); onClose() }}
          onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          Add Child
        </button>

        {!isRoot && (
          <button style={itemStyle} onClick={() => { addSiblingNode(nodeId); onClose() }}
            onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            Add Sibling
          </button>
        )}

        <button style={itemStyle} onClick={() => { setEditingNodeId(nodeId); onClose() }}
          onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          Edit Title
        </button>
        <button style={itemStyle} onClick={() => { openSidePanel('contentEditor', nodeId); onClose() }}
          onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <span>Edit Content</span>
          <span style={{ fontSize: 11, opacity: 0.4 }}>Enter</span>
        </button>

        {divider}

        <button style={itemStyle} onClick={() => { openSidePanel('properties', nodeId); onClose() }}
          onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          Properties
        </button>

        {divider}

        {canDelete && (
          <button style={{ ...itemStyle, color: '#e74c3c' }}
            onClick={() => { removeNode(nodeId); onClose() }}
            onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
            Delete
          </button>
        )}
      </div>
    </>
  )
}
