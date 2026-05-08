import React, { useRef, useEffect, useState, useCallback } from 'react'
import { renderStroke } from '../handwriting/renderStrokes.js'
import type { Stroke } from '@banjuan/core'
import { useBanjuanAPI } from '../../api.js'

interface InkStroke {
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

interface Props {
  active: boolean
  pageNum: number
  docId: string
  existingAnnotationId: string | null
  existingStrokes: InkStroke[]
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

let lassoIdCounter = 0
function toAbsolute(strokes: InkStroke[], w: number, h: number): Stroke[] {
  return strokes.map(s => ({
    id: `lasso-${++lassoIdCounter}`,
    points: s.points.map(p => ({ x: p.x * w, y: p.y * h })),
    color: s.color,
    width: s.width,
    opacity: 1,
  }))
}

const SEL_MARGIN = 0.02

export default function InkLassoTool({ active, pageNum, docId, existingAnnotationId, existingStrokes, onUpdated }: Props) {
  const api = useBanjuanAPI()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const getRelativePos = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
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
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const w = rect.width
    const h = rect.height

    const sel = opts?.selected || selectedRef.current
    const offset = opts?.dragOffset || { x: 0, y: 0 }
    const absStrokes = toAbsolute(existingStrokes, w, h)

    for (let i = 0; i < absStrokes.length; i++) {
      if (sel.has(i)) {
        ctx.save()
        ctx.translate(offset.x * w, offset.y * h)
        renderStroke(ctx, absStrokes[i])
        ctx.restore()
      } else {
        renderStroke(ctx, absStrokes[i])
      }
    }

    // Selection bounding box
    const bounds = sel.size > 0 ? getSelBounds(existingStrokes, sel) : null
    if (bounds) {
      const m = 8
      const bx = (bounds.x + offset.x) * w
      const by = (bounds.y + offset.y) * h
      const bw = bounds.w * w
      const bh = bounds.h * h
      ctx.save()
      ctx.setLineDash([6, 3])
      ctx.strokeStyle = '#3182ce'
      ctx.lineWidth = 1.5
      ctx.strokeRect(bx - m, by - m, bw + m * 2, bh + m * 2)
      const corners = [
        [bx - m, by - m], [bx + bw + m, by - m],
        [bx - m, by + bh + m], [bx + bw + m, by + bh + m],
      ]
      ctx.setLineDash([])
      ctx.fillStyle = 'white'
      for (const [cx, cy] of corners) {
        ctx.beginPath()
        ctx.arc(cx, cy, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }

    // Lasso path
    const lassoP = opts?.lassoPoints
    if (lassoP && lassoP.length > 2) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(lassoP[0].x * w, lassoP[0].y * h)
      for (let i = 1; i < lassoP.length; i++) {
        ctx.lineTo(lassoP[i].x * w, lassoP[i].y * h)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(49,130,206,0.06)'
      ctx.fill()
      ctx.setLineDash([5, 3])
      ctx.strokeStyle = '#3182ce'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }
  }, [existingStrokes])

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
    return pos.x >= b.x - SEL_MARGIN && pos.x <= b.x + b.w + SEL_MARGIN &&
           pos.y >= b.y - SEL_MARGIN && pos.y <= b.y + b.h + SEL_MARGIN
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active) return
    e.preventDefault()
    const pos = getRelativePos(e)

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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (modeRef.current === 'lasso') {
      lassoPointsRef.current.push(getRelativePos(e))
      redraw({ lassoPoints: lassoPointsRef.current, selected: new Set() })
      return
    }
    if (modeRef.current === 'dragging') {
      const pos = getRelativePos(e)
      const dx = pos.x - dragStartRef.current.x
      const dy = pos.y - dragStartRef.current.y
      dragOffsetRef.current = { x: dx, y: dy }
      redraw({ dragOffset: { x: dx, y: dy } })
      return
    }
  }, [redraw])

  const applyDrag = useCallback(async () => {
    const offset = dragOffsetRef.current
    if ((offset.x === 0 && offset.y === 0) || !existingAnnotationId) return
    const sel = selectedRef.current
    const newStrokes = existingStrokes.map((s, i) => {
      if (!sel.has(i)) return s
      return { ...s, points: s.points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y })) }
    })
    const allPts = newStrokes.flatMap(s => s.points)
    const xs = allPts.map(p => p.x)
    const ys = allPts.map(p => p.y)
    const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    await api.annotations.update(existingAnnotationId, {
      position: { type: 'ink', page: pageNum, strokes: newStrokes, bounds },
    })
    dragOffsetRef.current = { x: 0, y: 0 }
    onUpdated()
  }, [existingStrokes, existingAnnotationId, pageNum, onUpdated])

  const handleMouseUp = useCallback(() => {
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
      for (let i = 0; i < existingStrokes.length; i++) {
        const hit = existingStrokes[i].points.some(p => isPointInPolygon(p.x, p.y, lasso))
        if (hit) indices.add(i)
      }
      lassoPointsRef.current = []
      if (indices.size === 0) {
        redraw()
        return
      }
      setSelectedIndices(indices)
      selBoundsRef.current = getSelBounds(existingStrokes, indices)
      redraw({ selected: indices })
    }
  }, [existingStrokes, redraw, applyDrag])

  const deleteSelected = useCallback(async () => {
    if (selectedRef.current.size === 0 || !existingAnnotationId) return
    const remaining = existingStrokes.filter((_, i) => !selectedRef.current.has(i))
    if (remaining.length === 0) {
      await api.annotations.delete(existingAnnotationId)
    } else {
      const allPts = remaining.flatMap(s => s.points)
      const xs = allPts.map(p => p.x)
      const ys = allPts.map(p => p.y)
      const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      await api.annotations.update(existingAnnotationId, {
        position: { type: 'ink', page: pageNum, strokes: remaining, bounds },
      })
    }
    setSelectedIndices(new Set())
    selBoundsRef.current = null
    onUpdated()
  }, [existingStrokes, existingAnnotationId, pageNum, onUpdated])

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

  if (!active && existingStrokes.length === 0) return null

  const cursor = active
    ? (mode === 'dragging' ? 'grabbing' : selectedIndices.size > 0 ? 'default' : 'crosshair')
    : 'default'

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'absolute', inset: 0,
        cursor,
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 10 : 2,
        display: active || existingStrokes.length > 0 ? undefined : 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  )
}
