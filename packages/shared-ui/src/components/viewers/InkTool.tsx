import React, { useRef, useEffect, useState, useCallback } from 'react'
import { renderStroke, renderAllStrokes } from '../handwriting/renderStrokes.js'
import type { Stroke, StrokePoint } from '@banjuan/core'
import { useBanjuanAPI } from '../../api.js'

interface InkStroke {
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

interface Props {
  active: boolean
  eraserActive?: boolean
  color: string
  lineWidth: number
  pageNum: number
  docId: string
  existingAnnotationId: string | null
  existingStrokes: InkStroke[]
  onCreated: () => void
}

let inkIdCounter = 0
function inkToAbsolute(strokes: InkStroke[], w: number, h: number): Stroke[] {
  return strokes.map(s => ({
    id: `ink-${++inkIdCounter}`,
    points: s.points.map(p => ({ x: p.x * w, y: p.y * h })),
    color: s.color,
    width: s.width,
    opacity: 1,
  }))
}

export default function InkTool({ active, eraserActive, color, lineWidth, pageNum, docId, existingAnnotationId, existingStrokes, onCreated }: Props) {
  const api = useBanjuanAPI()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentPointsRef = useRef<StrokePoint[]>([])

  const getRelativePos = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const absStrokes = inkToAbsolute(existingStrokes, rect.width, rect.height)
    renderAllStrokes(ctx, absStrokes, rect.width, rect.height)
  }, [existingStrokes])

  useEffect(() => { redraw() }, [redraw])

  const handleErase = useCallback(async (e: React.PointerEvent) => {
    if (!containerRef.current || !existingAnnotationId) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = getRelativePos(e)
    const threshold = 20

    for (let si = 0; si < existingStrokes.length; si++) {
      const stroke = existingStrokes[si]
      for (const pt of stroke.points) {
        const dx = (pt.x - pos.x) * rect.width
        const dy = (pt.y - pos.y) * rect.height
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          const remaining = existingStrokes.filter((_, i) => i !== si)
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
          onCreated()
          return
        }
      }
    }
  }, [existingStrokes, existingAnnotationId, pageNum, onCreated])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (eraserActive) {
      e.preventDefault()
      handleErase(e)
      return
    }
    if (!active) return
    e.preventDefault()
    setDrawing(true)
    const pos = getRelativePos(e)
    currentPointsRef.current = [pos]
  }, [active, eraserActive, handleErase])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing) return
    const pos = getRelativePos(e)
    currentPointsRef.current.push(pos)

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

    const absStrokes = inkToAbsolute(existingStrokes, w, h)
    renderAllStrokes(ctx, absStrokes, w, h)

    const liveStroke: Stroke = {
      id: 'live',
      points: currentPointsRef.current.map(p => ({ x: p.x * w, y: p.y * h })),
      color, width: lineWidth, opacity: 1,
    }
    renderStroke(ctx, liveStroke)
  }, [drawing, color, lineWidth, existingStrokes])

  const handlePointerUp = useCallback(async () => {
    if (!drawing) return
    setDrawing(false)
    const points = currentPointsRef.current
    if (points.length < 2) return

    const newStroke: InkStroke = { points, color, width: lineWidth }
    const allStrokes = [...existingStrokes, newStroke]
    const allPts = allStrokes.flatMap(s => s.points)
    const xs = allPts.map(p => p.x)
    const ys = allPts.map(p => p.y)
    const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    const position = { type: 'ink' as const, page: pageNum, strokes: allStrokes, bounds }

    if (existingAnnotationId) {
      await api.annotations.update(existingAnnotationId, { position })
    } else {
      await api.annotations.create({
        docId, type: 'ink', page: pageNum, position, color,
      })
    }
    currentPointsRef.current = []
    onCreated()
  }, [drawing, docId, pageNum, color, lineWidth, onCreated, existingStrokes, existingAnnotationId])

  const isInteractive = active || (eraserActive && existingStrokes.length > 0)

  return (
    <div ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      style={{ position: 'absolute', inset: 0,
        cursor: eraserActive ? 'pointer' : active ? 'crosshair' : 'default',
        pointerEvents: isInteractive ? 'auto' : 'none', zIndex: isInteractive ? 10 : 2,
        touchAction: 'none',
        display: isInteractive || existingStrokes.length > 0 ? undefined : 'none' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  )
}
