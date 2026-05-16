import React, { useRef, useEffect, useState, useCallback } from 'react'
import { renderStroke, renderAllStrokes } from '../handwriting/renderStrokes.js'
import type { Stroke } from '@banjuan/core'
import { useMarkdownViewer } from './MarkdownViewerContext.js'
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
    sectionId?: string
    strokes: InkStroke[]
    bounds: { x: number; y: number; w: number; h: number }
  }
}

interface Props {
  docId: string
  annotations: any[]
  scrollContainer: HTMLElement | null
  onUpdated: () => void
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
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

let lassoIdCounter = 0
function toAbsoluteStrokes(strokes: InkStroke[], containerW: number): Stroke[] {
  return strokes.map(s => ({
    id: `lasso-${++lassoIdCounter}`,
    points: s.points.map(p => ({ x: p.x * containerW, y: p.y })),
    color: s.color,
    width: s.width,
    opacity: 1,
  }))
}

function getSelBounds(strokes: InkStroke[], indices: Set<number>): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const i of indices) {
    if (i >= strokes.length) continue
    for (const p of strokes[i].points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }
  }
  if (minX === Infinity) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export default function MarkdownInkLassoTool({ docId, annotations, scrollContainer, onUpdated }: Props) {
  const api = useBanjuanAPI()
  const ctx = useMarkdownViewer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const active = ctx.activeTool === 'lasso'

  const inkAnnotations: InkAnnotation[] = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.type === 'ink'
  )
  const allStrokes = inkAnnotations.flatMap(a => a.position.strokes)

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

  const getPos = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const containerW = scrollContainer?.scrollWidth ?? rect.width
    return { x: (e.clientX - rect.left) / containerW, y: e.clientY - rect.top }
  }

  const redraw = useCallback((opts?: {
    lassoPoints?: Array<{ x: number; y: number }>
    selected?: Set<number>
    dragOffset?: { x: number; y: number }
  }) => {
    const canvas = canvasRef.current
    if (!canvas || !scrollContainer) return
    const containerW = scrollContainer.scrollWidth
    const containerH = scrollContainer.scrollHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = containerW * dpr
    canvas.height = containerH * dpr
    canvas.style.width = `${containerW}px`
    canvas.style.height = `${containerH}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)

    const sel = opts?.selected || selectedRef.current
    const offset = opts?.dragOffset || { x: 0, y: 0 }
    const absStrokes = toAbsoluteStrokes(allStrokes, containerW)

    for (let i = 0; i < absStrokes.length; i++) {
      if (sel.has(i)) {
        c.save()
        c.translate(offset.x * containerW, offset.y)
        renderStroke(c, absStrokes[i])
        c.restore()
      } else {
        renderStroke(c, absStrokes[i])
      }
    }

    const bounds = sel.size > 0 ? getSelBounds(allStrokes, sel) : null
    if (bounds) {
      const m = 8
      const bx = (bounds.x + offset.x) * containerW
      const by = bounds.y + offset.y
      const bw = bounds.w * containerW
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
      c.moveTo(lassoP[0].x * containerW, lassoP[0].y)
      for (let i = 1; i < lassoP.length; i++) {
        c.lineTo(lassoP[i].x * containerW, lassoP[i].y)
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
  }, [allStrokes, scrollContainer])

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

  const SEL_MARGIN_X = 0.02
  const SEL_MARGIN_Y = 20

  const isInsideSelection = useCallback((pos: { x: number; y: number }): boolean => {
    const b = selBoundsRef.current
    if (!b || selectedRef.current.size === 0) return false
    return pos.x >= b.x - SEL_MARGIN_X && pos.x <= b.x + b.w + SEL_MARGIN_X &&
           pos.y >= b.y - SEL_MARGIN_Y && pos.y <= b.y + b.h + SEL_MARGIN_Y
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!active) return
    e.preventDefault()
    e.stopPropagation()
    const pos = getPos(e)

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
      lassoPointsRef.current.push(getPos(e))
      redraw({ lassoPoints: lassoPointsRef.current, selected: new Set() })
      return
    }
    if (modeRef.current === 'dragging') {
      const pos = getPos(e)
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
    if (sel.size === 0) return

    let globalIdx = 0
    for (const ann of inkAnnotations) {
      const newStrokes = ann.position.strokes.map((s, i) => {
        const gi = globalIdx + i
        if (!sel.has(gi)) return s
        return { ...s, points: s.points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y })) }
      })
      globalIdx += ann.position.strokes.length

      const changed = newStrokes.some((s, i) => s !== ann.position.strokes[i])
      if (changed) {
        const bounds = computeBounds(newStrokes)
        await api.annotations.update(ann.id, {
          position: { type: 'ink', sectionId: ann.position.sectionId, strokes: newStrokes, bounds },
        })
      }
    }

    dragOffsetRef.current = { x: 0, y: 0 }
    onUpdated()
  }, [inkAnnotations, onUpdated])

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
      const indices = new Set<number>()
      for (let i = 0; i < allStrokes.length; i++) {
        const hit = allStrokes[i].points.some(p => isPointInPolygon(p.x, p.y, lasso))
        if (hit) indices.add(i)
      }
      lassoPointsRef.current = []
      if (indices.size === 0) {
        redraw()
        return
      }
      setSelectedIndices(indices)
      selBoundsRef.current = getSelBounds(allStrokes, indices)
      redraw({ selected: indices })
    }
  }, [allStrokes, redraw, applyDrag])

  const deleteSelected = useCallback(async () => {
    if (selectedRef.current.size === 0) return
    const sel = selectedRef.current

    let globalIdx = 0
    for (const ann of inkAnnotations) {
      const remaining = ann.position.strokes.filter((_, i) => !sel.has(globalIdx + i))
      const hadDeletion = remaining.length < ann.position.strokes.length
      globalIdx += ann.position.strokes.length

      if (!hadDeletion) continue
      if (remaining.length === 0) {
        await api.annotations.delete(ann.id)
      } else {
        const bounds = computeBounds(remaining)
        await api.annotations.update(ann.id, {
          position: { type: 'ink', sectionId: ann.position.sectionId, strokes: remaining, bounds },
        })
      }
    }

    setSelectedIndices(new Set())
    selBoundsRef.current = null
    onUpdated()
  }, [inkAnnotations, onUpdated])

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

  if (!active && allStrokes.length === 0) return null

  const cursor = active
    ? (mode === 'dragging' ? 'grabbing' : selectedIndices.size > 0 ? 'default' : 'crosshair')
    : 'default'

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: active ? 'auto' : 'none',
        cursor,
        zIndex: active ? 11 : 2,
        touchAction: 'none',
      }}
    />
  )
}
