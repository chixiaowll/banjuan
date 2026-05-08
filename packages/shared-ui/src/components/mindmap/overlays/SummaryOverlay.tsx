import React from 'react'
import { useMindmapStore, type MindmapNodeData } from '../useMindmapStore.js'
import type { Node } from '@xyflow/react'

const BRACE_WIDTH = 20
const GAP = 16

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

export default function SummaryOverlay() {
  const { summaries, rfNodes, removeSummary } = useMindmapStore()

  if (summaries.length === 0) return null

  return (
    <>
      {summaries.map(s => (
        <SummaryBrace key={s.id} summary={s} rfNodes={rfNodes}
          onRemove={() => removeSummary(s.id)} />
      ))}
    </>
  )
}

function SummaryBrace({ summary, rfNodes, onRemove }: {
  summary: { id: string; nodeIds: string[]; summaryNodeId: string }
  rfNodes: Node<MindmapNodeData>[]
  onRemove: () => void
}) {
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null)

  const allIds = new Set<string>()
  for (const id of summary.nodeIds) {
    allIds.add(id)
    for (const desc of collectDescendantIds(id, rfNodes)) {
      allIds.add(desc)
    }
  }

  const matchedNodes = rfNodes.filter(n => allIds.has(n.id) && !n.hidden)
  const summaryNode = rfNodes.find(n => n.id === summary.summaryNodeId)
  if (matchedNodes.length === 0) return null

  let minY = Infinity, maxY = -Infinity, maxX = -Infinity
  for (const n of matchedNodes) {
    const w = n.width ?? n.measured?.width ?? 160
    const h = n.height ?? n.measured?.height ?? 40
    if (n.position.y < minY) minY = n.position.y
    if (n.position.y + h > maxY) maxY = n.position.y + h
    if (n.position.x + w > maxX) maxX = n.position.x + w
  }

  const braceX = maxX + GAP
  const braceTop = minY
  const braceHeight = maxY - minY
  const midY = braceTop + braceHeight / 2

  if (summaryNode) {
    const snW = summaryNode.width ?? summaryNode.measured?.width ?? 160
    const snH = summaryNode.height ?? summaryNode.measured?.height ?? 40
    const targetX = braceX + BRACE_WIDTH + GAP
    const targetY = midY - snH / 2
    if (Math.abs(summaryNode.position.x - targetX) > 1 || Math.abs(summaryNode.position.y - targetY) > 1) {
      summaryNode.position = { x: targetX, y: targetY }
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <svg
        style={{
          position: 'absolute',
          left: braceX, top: braceTop,
          width: BRACE_WIDTH, height: braceHeight,
          overflow: 'visible',
          pointerEvents: 'auto',
          cursor: 'context-menu',
        }}
        onContextMenu={handleContextMenu}
      >
        <CurlyBrace width={BRACE_WIDTH} height={braceHeight} color="var(--text-muted, #888)" />
      </svg>
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setContextMenu(null)} />
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
              Remove Summary
            </button>
          </div>
        </>
      )}
    </>
  )
}

function CurlyBrace({ width, height, color }: { width: number; height: number; color: string }) {
  const midY = height / 2
  const tipX = width
  const r = Math.min(12, height / 6)

  const d = [
    `M 0,${r}`,
    `Q 0,0 ${r},0`,
    `L ${width / 2 - r},0`,
    `Q ${width / 2},0 ${width / 2},${r}`,
    `L ${width / 2},${midY - r}`,
    `Q ${width / 2},${midY} ${tipX},${midY}`,
    `Q ${width / 2},${midY} ${width / 2},${midY + r}`,
    `L ${width / 2},${height - r}`,
    `Q ${width / 2},${height} ${width / 2 - r},${height}`,
    `L ${r},${height}`,
    `Q 0,${height} 0,${height - r}`,
  ].join(' ')

  return (
    <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
  )
}
