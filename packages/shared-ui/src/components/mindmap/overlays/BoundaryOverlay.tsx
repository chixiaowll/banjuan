import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Node } from '@xyflow/react'
import { useMindmapStore, type MindmapNodeData } from '../useMindmapStore.js'
import { useNodeSizeStore } from '../useNodeSizeStore.js'

const PADDING = 24
const BORDER_RADIUS = 12

function collectDescendantIds(nodeId: string, allNodes: Node<MindmapNodeData>[]): string[] {
  const ids: string[] = []
  for (const n of allNodes) {
    if (n.data.parentId === nodeId) {
      ids.push(n.id)
      ids.push(...collectDescendantIds(n.id, allNodes))
    }
  }
  return ids
}

export default function BoundaryOverlay() {
  const { boundaries, rfNodes, updateBoundary, removeBoundary } = useMindmapStore()
  const nodeSizes = useNodeSizeStore(s => s.sizes)

  if (boundaries.length === 0) return null

  return (
    <>
      {boundaries.map(b => (
        <BoundaryBox key={b.id} boundary={b} rfNodes={rfNodes} nodeSizes={nodeSizes}
          onUpdateLabel={(label) => updateBoundary(b.id, { label })}
          onRemove={() => removeBoundary(b.id)}
        />
      ))}
    </>
  )
}

function BoundaryBox({ boundary, rfNodes, nodeSizes, onUpdateLabel, onRemove }: {
  boundary: { id: string; nodeIds: string[]; label: string; color: string | null }
  rfNodes: Node<MindmapNodeData>[]
  nodeSizes: Map<string, { width: number; height: number }>
  onUpdateLabel: (label: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(boundary.label)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const allIds = new Set<string>()
  for (const id of boundary.nodeIds) {
    allIds.add(id)
    for (const desc of collectDescendantIds(id, rfNodes)) {
      allIds.add(desc)
    }
  }

  const matchedNodes = rfNodes.filter(n => allIds.has(n.id) && !n.hidden)
  if (matchedNodes.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of matchedNodes) {
    const ns = nodeSizes.get(n.id)
    const w = ns?.width ?? n.measured?.width ?? n.width ?? 160
    const h = ns?.height ?? n.measured?.height ?? n.height ?? 40
    if (n.position.x < minX) minX = n.position.x
    if (n.position.y < minY) minY = n.position.y
    if (n.position.x + w > maxX) maxX = n.position.x + w
    if (n.position.y + h > maxY) maxY = n.position.y + h
  }

  const x = minX - PADDING
  const y = minY - PADDING
  const width = maxX - minX + PADDING * 2
  const height = maxY - minY + PADDING * 2
  const color = boundary.color || '#5e81ac'

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(boundary.label)
    setEditing(true)
  }

  const commitEdit = () => {
    setEditing(false)
    if (editValue !== boundary.label) onUpdateLabel(editValue)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x, top: y, width, height,
          border: `2px dashed ${color}`,
          borderRadius: BORDER_RADIUS,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
      <div
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: x + 12,
          top: y,
          transform: 'translateY(-50%)',
          pointerEvents: 'auto',
          cursor: 'pointer',
          zIndex: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            style={{
              fontSize: 11, fontWeight: 600, color,
              background: 'var(--surface, #fff)', border: `1px solid ${color}`,
              borderRadius: 3, padding: '1px 4px', outline: 'none',
              width: Math.max(60, editValue.length * 8 + 20), whiteSpace: 'nowrap',
            }}
          />
        ) : (
          <span style={{
            fontSize: 11, fontWeight: 600, color,
            background: 'var(--surface, #fff)',
            padding: '0 4px',
            userSelect: 'none',
          }}>
            {boundary.label || 'Boundary'}
          </span>
        )}
      </div>
      {contextMenu && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null) }} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            padding: '4px 0', minWidth: 140,
          }}>
            <button
              style={{
                padding: '8px 16px', width: '100%', border: 'none', background: 'none',
                textAlign: 'left', fontSize: 13, color: '#e74c3c', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              onClick={() => { setContextMenu(null); onRemove() }}
            >
              Remove Boundary
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
