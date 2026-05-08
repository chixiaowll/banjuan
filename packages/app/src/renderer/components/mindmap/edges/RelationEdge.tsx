import React, { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react'
import { useMindmapStore } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'

interface EdgeStyle {
  sx: number; sy: number
  tx: number; ty: number
  c1x: number; c1y: number
  c2x: number; c2y: number
}

function parseEdgeStyle(raw: string | null | undefined): EdgeStyle | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (typeof p.sx === 'number' && typeof p.sy === 'number' &&
        typeof p.tx === 'number' && typeof p.ty === 'number' &&
        typeof p.c1x === 'number' && typeof p.c1y === 'number' &&
        typeof p.c2x === 'number' && typeof p.c2y === 'number') return p
  } catch {}
  return null
}

function serializeEdgeStyle(s: EdgeStyle): string {
  return JSON.stringify({
    sx: Math.round(s.sx), sy: Math.round(s.sy),
    tx: Math.round(s.tx), ty: Math.round(s.ty),
    c1x: Math.round(s.c1x), c1y: Math.round(s.c1y),
    c2x: Math.round(s.c2x), c2y: Math.round(s.c2y),
  })
}

const GAP = 4

interface Side {
  ox: number; oy: number
  dx: number; dy: number
}

function makeSides(w: number, h: number): Side[] {
  return [
    { ox:  w / 2 + GAP, oy: 0,             dx:  1, dy:  0 },
    { ox: -w / 2 - GAP, oy: 0,             dx: -1, dy:  0 },
    { ox: 0,            oy:  h / 2 + GAP,  dx:  0, dy:  1 },
    { ox: 0,            oy: -h / 2 - GAP,  dx:  0, dy: -1 },
  ]
}

function pickSide(sides: Side[], angle: number): Side {
  let best = sides[0], bestScore = -Infinity
  for (const s of sides) {
    const score = Math.cos(angle - Math.atan2(s.dy, s.dx))
    if (score > bestScore) { bestScore = score; best = s }
  }
  return best
}

function computeBestOffsets(
  srcW: number, srcH: number,
  tgtW: number, tgtH: number,
  sCx: number, sCy: number,
  tCx: number, tCy: number,
): EdgeStyle {
  const angle = Math.atan2(tCy - sCy, tCx - sCx)

  const bestSrc = pickSide(makeSides(srcW, srcH), angle)
  const bestTgt = pickSide(makeSides(tgtW, tgtH), angle + Math.PI)

  const dist = Math.hypot(
    (sCx + bestSrc.ox) - (tCx + bestTgt.ox),
    (sCy + bestSrc.oy) - (tCy + bestTgt.oy),
  )
  const pull = Math.max(30, Math.min(120, dist * 0.35))

  return {
    sx: bestSrc.ox, sy: bestSrc.oy,
    tx: bestTgt.ox, ty: bestTgt.oy,
    c1x: bestSrc.ox + bestSrc.dx * pull,
    c1y: bestSrc.oy + bestSrc.dy * pull,
    c2x: bestTgt.ox + bestTgt.dx * pull,
    c2y: bestTgt.oy + bestTgt.dy * pull,
  }
}

function getNodeCenter(node: any, fallbackW: number, fallbackH: number) {
  try {
    const w = node?.measured?.width ?? fallbackW
    const h = node?.measured?.height ?? fallbackH
    const x = node?.internals?.positionAbsolute?.x ?? node?.position?.x ?? 0
    const y = node?.internals?.positionAbsolute?.y ?? node?.position?.y ?? 0
    return { cx: x + w / 2, cy: y + h / 2, w, h }
  } catch {
    return { cx: 0, cy: 0, w: fallbackW, h: fallbackH }
  }
}

type DragTarget = 'label' | 'source' | 'target' | 'cp1' | 'cp2'

export default function RelationEdge(props: EdgeProps) {
  const { id, source, target, data, selected } = props
  const { theme: themeName, updateRelationEdge, removeRelationEdge } = useMindmapStore()
  const theme = getTheme(themeName)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; orig: EdgeStyle } | null>(null)
  const [localStyle, setLocalStyle] = useState<EdgeStyle | null>(null)
  const initializedRef = useRef(false)

  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  const label = (data as any)?.label ?? ''
  const storedStyle = useMemo(() => parseEdgeStyle((data as any)?.style), [data])

  const src = getNodeCenter(sourceNode, 160, 40)
  const tgt = getNodeCenter(targetNode, 160, 40)

  const computedStyle = useMemo(() => {
    if (storedStyle) return storedStyle
    if (!sourceNode || !targetNode) return null
    return computeBestOffsets(src.w, src.h, tgt.w, tgt.h, src.cx, src.cy, tgt.cx, tgt.cy)
  }, [storedStyle, sourceNode, targetNode, src.w, src.h, tgt.w, tgt.h, src.cx, src.cy, tgt.cx, tgt.cy])

  useEffect(() => {
    if (storedStyle || initializedRef.current || !computedStyle) return
    initializedRef.current = true
    updateRelationEdge(id, { style: serializeEdgeStyle(computedStyle) }).catch(() => {
      initializedRef.current = false
    })
  }, [id, storedStyle, computedStyle, updateRelationEdge])

  const activeStyle = dragTarget ? localStyle : computedStyle

  if (!activeStyle) return null

  const px1 = src.cx + activeStyle.sx
  const py1 = src.cy + activeStyle.sy
  const px2 = tgt.cx + activeStyle.tx
  const py2 = tgt.cy + activeStyle.ty
  const cp1x = src.cx + activeStyle.c1x
  const cp1y = src.cy + activeStyle.c1y
  const cp2x = tgt.cx + activeStyle.c2x
  const cp2y = tgt.cy + activeStyle.c2y
  const path = `M ${px1},${py1} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${px2},${py2}`

  const labelX = (px1 + 3 * cp1x + 3 * cp2x + px2) / 8
  const labelY = (py1 + 3 * cp1y + 3 * cp2y + py2) / 8

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); setEditValue(label); setEditing(true)
  }
  const commitEdit = () => {
    setEditing(false)
    if (editValue !== label) updateRelationEdge(id, { label: editValue || undefined })
  }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditing(false)
  }
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const getZoom = (el: HTMLElement) => {
    const vp = el.closest('.react-flow')?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!vp) return 1
    const t = window.getComputedStyle(vp).transform
    if (t && t !== 'none') { const m = t.match(/matrix\(([^,]+)/); if (m) return parseFloat(m[1]) }
    return 1
  }

  const makePointerDown = (dt: DragTarget) => (e: React.PointerEvent) => {
    if (editing || e.button === 2) return
    e.stopPropagation(); e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, orig: { ...activeStyle } }
    setLocalStyle({ ...activeStyle })
    setDragTarget(dt)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !dragTarget || !localStyle) return
    const zoom = getZoom(e.currentTarget as HTMLElement)
    const dx = (e.clientX - dragRef.current.startX) / zoom
    const dy = (e.clientY - dragRef.current.startY) / zoom
    const o = dragRef.current.orig
    if (dragTarget === 'source')
      setLocalStyle({ ...localStyle, sx: o.sx + dx, sy: o.sy + dy })
    else if (dragTarget === 'target')
      setLocalStyle({ ...localStyle, tx: o.tx + dx, ty: o.ty + dy })
    else if (dragTarget === 'cp1')
      setLocalStyle({ ...localStyle, c1x: o.c1x + dx, c1y: o.c1y + dy })
    else if (dragTarget === 'cp2')
      setLocalStyle({ ...localStyle, c2x: o.c2x + dx, c2y: o.c2y + dy })
    else {
      setLocalStyle({
        ...localStyle,
        c1x: o.c1x + dx, c1y: o.c1y + dy,
        c2x: o.c2x + dx, c2y: o.c2y + dy,
      })
    }
  }

  const clampToEdge = (ox: number, oy: number, halfW: number, halfH: number): { ox: number; oy: number } => {
    const margin = GAP
    if (Math.abs(ox) <= halfW && Math.abs(oy) <= halfH) {
      const dRight = halfW + margin - ox
      const dLeft = ox + halfW + margin
      const dBottom = halfH + margin - oy
      const dTop = oy + halfH + margin
      const min = Math.min(dRight, dLeft, dBottom, dTop)
      if (min === dRight) return { ox: halfW + margin, oy }
      if (min === dLeft) return { ox: -halfW - margin, oy }
      if (min === dBottom) return { ox, oy: halfH + margin }
      return { ox, oy: -halfH - margin }
    }
    return { ox, oy }
  }

  const onPointerUp = () => {
    if (!dragRef.current || !dragTarget || !localStyle) {
      setDragTarget(null); dragRef.current = null; return
    }
    let final = { ...localStyle }
    if (dragTarget === 'source') {
      const c = clampToEdge(final.sx, final.sy, src.w / 2, src.h / 2)
      final = { ...final, sx: c.ox, sy: c.oy }
    } else if (dragTarget === 'target') {
      const c = clampToEdge(final.tx, final.ty, tgt.w / 2, tgt.h / 2)
      final = { ...final, tx: c.ox, ty: c.oy }
    }
    setLocalStyle(final)
    updateRelationEdge(id, { style: serializeEdgeStyle(final) })
    setDragTarget(null); dragRef.current = null
  }

  const dotStyle: React.CSSProperties = {
    width: 10, height: 10, borderRadius: '50%',
    border: '2px solid white', cursor: 'grab', pointerEvents: 'all',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)', position: 'absolute',
  }

  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={20}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onContextMenu={handleContextMenu as any} />
      <path d={path} fill="none"
        stroke={selected ? '#4A90D9' : theme.relation.color}
        strokeWidth={selected ? theme.relation.width + 1 : theme.relation.width}
        strokeDasharray={theme.relation.dasharray}
        style={{ pointerEvents: 'none' }}
        markerEnd={`url(#relation-arrow-${id})`} />
      <defs>
        <marker id={`relation-arrow-${id}`} viewBox="0 0 10 10"
          refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z"
            fill={selected ? '#4A90D9' : theme.relation.color} />
        </marker>
      </defs>
      <EdgeLabelRenderer>
        {selected && (
          <div className="nodrag nopan"
            onPointerDown={makePointerDown('source')}
            onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            style={{ ...dotStyle, background: '#e74c3c',
              transform: `translate(-50%, -50%) translate(${px1}px,${py1}px)` }} />
        )}
        {selected && (
          <div className="nodrag nopan"
            onPointerDown={makePointerDown('target')}
            onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            style={{ ...dotStyle, background: '#27ae60',
              transform: `translate(-50%, -50%) translate(${px2}px,${py2}px)` }} />
        )}
        {selected && (
          <>
            <div className="nodrag nopan"
              onPointerDown={makePointerDown('cp1')}
              onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              style={{ ...dotStyle, background: '#f39c12', width: 8, height: 8,
                transform: `translate(-50%, -50%) translate(${cp1x}px,${cp1y}px)` }} />
            <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
              <line x1={px1} y1={py1} x2={cp1x} y2={cp1y}
                stroke="#f39c12" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
            </svg>
            <div className="nodrag nopan"
              onPointerDown={makePointerDown('cp2')}
              onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              style={{ ...dotStyle, background: '#f39c12', width: 8, height: 8,
                transform: `translate(-50%, -50%) translate(${cp2x}px,${cp2y}px)` }} />
            <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
              <line x1={px2} y1={py2} x2={cp2x} y2={cp2y}
                stroke="#f39c12" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
            </svg>
          </>
        )}
        <div className="nodrag nopan"
          onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu}
          onPointerDown={makePointerDown('label')}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            font: theme.relation.labelFont, color: theme.relation.color,
            background: 'white', padding: editing ? 0 : '2px 8px',
            borderRadius: 4,
            border: selected ? `1px solid ${theme.relation.color}` : '1px solid transparent',
            cursor: dragTarget === 'label' ? 'grabbing' : 'grab',
            pointerEvents: 'all', minWidth: 20, textAlign: 'center',
            userSelect: 'none',
            boxShadow: dragTarget === 'label' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
          }}>
          {editing ? (
            <input ref={inputRef} className="nodrag nopan"
              value={editValue} onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit} onKeyDown={handleKeyDown} autoFocus
              style={{ border: '1px solid #4A90D9', borderRadius: 4, padding: '2px 6px',
                font: theme.relation.labelFont, color: theme.relation.color,
                outline: 'none', width: 80, textAlign: 'center' }} />
          ) : (
            <span style={{ opacity: label ? 1 : 0.4 }}>{label || '···'}</span>
          )}
        </div>
      </EdgeLabelRenderer>
      {contextMenu && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null) }} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            padding: '4px 0', minWidth: 140, fontSize: 13,
          }}>
            <button
              style={{
                padding: '8px 16px', cursor: 'pointer', display: 'block', width: '100%',
                border: 'none', background: 'none', textAlign: 'left', fontSize: 13,
                color: '#e74c3c',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover, #f5f5f5)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              onClick={() => { removeRelationEdge(id); setContextMenu(null) }}>
              Delete
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
