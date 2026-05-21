import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { renderStroke } from '../handwriting/renderStrokes.js'
import type { Stroke } from '@banjuan/core'
import { useEpubViewer } from './EpubViewerContext.js'
import { useBanjuanAPI } from '../../api.js'

interface InkStroke {
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

interface InkAnnotation {
  id: string
  position: {
    type: 'ink'
    strokes: InkStroke[]
    bounds: { x: number; y: number; w: number; h: number }
  }
  color: string
}

interface Props {
  docId: string
  annotations: any[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onUpdated: () => void
}

interface FlatStroke {
  annotationId: string
  strokeIndex: number
  stroke: InkStroke
}

function isPointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function computeBounds(strokes: InkStroke[]) {
  const allPts = strokes.flatMap(s => s.points)
  const xs = allPts.map(p => p.x)
  const ys = allPts.map(p => p.y)
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  }
}

function getSelBounds(flatStrokes: FlatStroke[], indices: Set<number>, containerWidth: number): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const i of indices) {
    if (i >= flatStrokes.length) continue
    for (const p of flatStrokes[i].stroke.points) {
      const px = p.x * containerWidth
      const py = p.y
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }
  }
  if (minX === Infinity) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

let lassoIdCounter = 0

const SEL_MARGIN_PX = 12

export default function EpubInkLassoTool({ docId, annotations, containerRef, onUpdated }: Props) {
  const api = useBanjuanAPI()
  const ctx = useEpubViewer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const active = ctx.activeTool === 'lasso'

  type Mode = 'idle' | 'lasso' | 'dragging'
  const modeRef = useRef<Mode>('idle')
  const [mode, setMode] = useState<Mode>('idle')

  const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const selectedRef = useRef<Set<number>>(new Set())
  selectedRef.current = selectedIndices

  const selBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const find = () => {
      if (cancelled) return
      const sc = containerRef.current?.querySelector('.epub-container') as HTMLElement | null
      if (sc) setScrollContainer(sc)
      else timer = setTimeout(find, 100)
    }
    find()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [containerRef, ctx.rendition])

  const [scrollTop, setScrollTop] = useState(0)
  useEffect(() => {
    if (!scrollContainer) return
    const handler = () => setScrollTop(scrollContainer.scrollTop)
    handler()
    scrollContainer.addEventListener('scroll', handler, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', handler)
  }, [scrollContainer])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !scrollContainer || !active) return
    const handleWheel = (e: WheelEvent) => {
      scrollContainer.scrollBy({ top: e.deltaY, left: e.deltaX })
      e.preventDefault()
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [scrollContainer, active])

  const inkAnnotations: InkAnnotation[] = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.type === 'ink'
  )

  const flatStrokes: FlatStroke[] = inkAnnotations.flatMap(ann =>
    ann.position.strokes.map((s, i) => ({
      annotationId: ann.id,
      strokeIndex: i,
      stroke: s,
    }))
  )

  const getDocCoord = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: (e.clientY - rect.top) + scrollTop,
    }
  }

  const redraw = useCallback((opts?: {
    lassoPoints?: Array<{ x: number; y: number }>
    selected?: Set<number>
    dragOffset?: { x: number; y: number }
  }) => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)
    const w = rect.width

    const sel = opts?.selected || selectedRef.current
    const offset = opts?.dragOffset || { x: 0, y: 0 }

    for (let i = 0; i < flatStrokes.length; i++) {
      const s = flatStrokes[i].stroke
      const absStroke: Stroke = {
        id: `lasso-${++lassoIdCounter}`,
        points: s.points.map(p => ({ x: p.x * w, y: p.y - scrollTop })),
        color: s.color,
        width: s.width,
        opacity: 1,
      }
      if (sel.has(i)) {
        c.save()
        c.translate(offset.x, offset.y)
        renderStroke(c, absStroke)
        c.restore()
      } else {
        renderStroke(c, absStroke)
      }
    }

    const bounds = sel.size > 0 ? getSelBounds(flatStrokes, sel, w) : null
    if (bounds) {
      const m = 8
      const bx = bounds.x + offset.x
      const by = bounds.y - scrollTop + offset.y
      const bw = bounds.w
      const bh = bounds.h
      c.save()
      c.setLineDash([6, 3])
      c.strokeStyle = '#3182ce'
      c.lineWidth = 1.5
      c.strokeRect(bx - m, by - m, bw + m * 2, bh + m * 2)
      const corners = [
        [bx - m, by - m], [bx + bw + m, by - m],
        [bx - m, by + bh + m], [bx + bw + m, by + bh + m],
      ]
      c.setLineDash([])
      c.fillStyle = 'white'
      for (const [cx, cy] of corners) {
        c.beginPath()
        c.arc(cx, cy, 4, 0, Math.PI * 2)
        c.fill()
        c.stroke()
      }
      c.restore()
    }

    const lassoP = opts?.lassoPoints
    if (lassoP && lassoP.length > 2) {
      c.save()
      c.beginPath()
      c.moveTo(lassoP[0].x, lassoP[0].y - scrollTop)
      for (let i = 1; i < lassoP.length; i++) {
        c.lineTo(lassoP[i].x, lassoP[i].y - scrollTop)
      }
      c.closePath()
      c.fillStyle = 'rgba(49,130,206,0.06)'
      c.fill()
      c.setLineDash([5, 3])
      c.strokeStyle = '#3182ce'
      c.lineWidth = 1.5
      c.stroke()
      c.restore()
    }
  }, [flatStrokes, containerRef, scrollTop])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    if (!active) {
      setSelectedIndices(new Set())
      selBoundsRef.current = null
      lassoPointsRef.current = []
      modeRef.current = 'idle'
      setMode('idle')
    }
  }, [active])

  const isInsideSelection = useCallback((pos: { x: number; y: number }): boolean => {
    const b = selBoundsRef.current
    if (!b || selectedRef.current.size === 0) return false
    const w = containerRef.current?.getBoundingClientRect().width || 1
    return pos.x >= b.x - SEL_MARGIN_PX && pos.x <= b.x + b.w + SEL_MARGIN_PX &&
           pos.y >= b.y - SEL_MARGIN_PX && pos.y <= b.y + b.h + SEL_MARGIN_PX
  }, [containerRef])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!active || e.pointerType === 'touch') return
    e.preventDefault()
    const pos = getDocCoord(e)

    if (selectedRef.current.size > 0 && isInsideSelection(pos)) {
      modeRef.current = 'dragging'
      setMode('dragging')
      dragStartRef.current = pos
      dragOffsetRef.current = { x: 0, y: 0 }
      return
    }

    setSelectedIndices(new Set())
    selBoundsRef.current = null
    modeRef.current = 'lasso'
    setMode('lasso')
    lassoPointsRef.current = [pos]
  }, [active, isInsideSelection])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (modeRef.current === 'lasso') {
      lassoPointsRef.current.push(getDocCoord(e))
      redraw({ lassoPoints: lassoPointsRef.current, selected: new Set() })
      return
    }
    if (modeRef.current === 'dragging') {
      const pos = getDocCoord(e)
      const dx = pos.x - dragStartRef.current.x
      const dy = pos.y - dragStartRef.current.y
      dragOffsetRef.current = { x: dx, y: dy }
      redraw({ dragOffset: { x: dx, y: dy } })
      return
    }
  }, [redraw])

  const applyDrag = useCallback(async () => {
    const offset = dragOffsetRef.current
    if (offset.x === 0 && offset.y === 0) return
    const sel = selectedRef.current
    const w = containerRef.current?.getBoundingClientRect().width || 1

    const affectedAnnotations = new Map<string, { original: InkAnnotation; strokeUpdates: Map<number, InkStroke> }>()

    for (const i of sel) {
      if (i >= flatStrokes.length) continue
      const fs = flatStrokes[i]
      if (!affectedAnnotations.has(fs.annotationId)) {
        const ann = inkAnnotations.find(a => a.id === fs.annotationId)!
        affectedAnnotations.set(fs.annotationId, { original: ann, strokeUpdates: new Map() })
      }
      const entry = affectedAnnotations.get(fs.annotationId)!
      const moved: InkStroke = {
        ...fs.stroke,
        points: fs.stroke.points.map(p => ({
          x: p.x + offset.x / w,
          y: p.y + offset.y,
        })),
      }
      entry.strokeUpdates.set(fs.strokeIndex, moved)
    }

    for (const [annId, { original, strokeUpdates }] of affectedAnnotations) {
      const newStrokes = original.position.strokes.map((s, i) =>
        strokeUpdates.has(i) ? strokeUpdates.get(i)! : s
      )
      const bounds = computeBounds(newStrokes)
      await api.annotations.update(annId, {
        position: { type: 'ink', strokes: newStrokes, bounds },
      })
    }

    dragOffsetRef.current = { x: 0, y: 0 }
    onUpdated()
  }, [flatStrokes, inkAnnotations, containerRef, onUpdated])

  const handlePointerUp = useCallback(() => {
    if (modeRef.current === 'dragging') {
      modeRef.current = 'idle'
      setMode('idle')
      applyDrag()
      return
    }
    if (modeRef.current === 'lasso') {
      modeRef.current = 'idle'
      setMode('idle')
      const lasso = lassoPointsRef.current
      if (lasso.length < 3) {
        lassoPointsRef.current = []
        redraw()
        return
      }
      const w = containerRef.current?.getBoundingClientRect().width || 1
      const indices = new Set<number>()
      for (let i = 0; i < flatStrokes.length; i++) {
        const hit = flatStrokes[i].stroke.points.some(p =>
          isPointInPolygon(p.x * w, p.y, lasso)
        )
        if (hit) indices.add(i)
      }
      lassoPointsRef.current = []
      if (indices.size === 0) {
        redraw()
        return
      }
      setSelectedIndices(indices)
      selBoundsRef.current = getSelBounds(flatStrokes, indices, w)
      redraw({ selected: indices })
    }
  }, [flatStrokes, redraw, applyDrag, containerRef])

  const deleteSelected = useCallback(async () => {
    if (selectedRef.current.size === 0) return
    const sel = selectedRef.current

    const removals = new Map<string, Set<number>>()
    for (const i of sel) {
      if (i >= flatStrokes.length) continue
      const fs = flatStrokes[i]
      if (!removals.has(fs.annotationId)) removals.set(fs.annotationId, new Set())
      removals.get(fs.annotationId)!.add(fs.strokeIndex)
    }

    for (const [annId, strokeIndices] of removals) {
      const ann = inkAnnotations.find(a => a.id === annId)
      if (!ann) continue
      const remaining = ann.position.strokes.filter((_, i) => !strokeIndices.has(i))
      if (remaining.length === 0) {
        await api.annotations.delete(annId)
      } else {
        const bounds = computeBounds(remaining)
        await api.annotations.update(annId, {
          position: { type: 'ink', strokes: remaining, bounds },
        })
      }
    }

    setSelectedIndices(new Set())
    selBoundsRef.current = null
    onUpdated()
  }, [flatStrokes, inkAnnotations, onUpdated])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedRef.current.size > 0) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, deleteSelected])

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc) }
  }, [ctxMenu])

  if (!active && flatStrokes.length === 0) return null

  const cursor = active
    ? (mode === 'dragging' ? 'grabbing' : selectedIndices.size > 0 ? 'default' : 'crosshair')
    : 'default'

  return (
    <div
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => {
        if (selectedRef.current.size > 0) {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY })
        }
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor,
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 10 : 2,
        touchAction: 'pan-y',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      {ctxMenu && (
        <div ref={ctxMenuRef} style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 4, minWidth: 120,
        }}>
          <button
            onClick={() => { deleteSelected(); setCtxMenu(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              cursor: 'pointer', fontSize: 13, color: '#e53e3e', border: 'none',
              background: 'none', width: '100%', textAlign: 'left', borderRadius: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--selected)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}
