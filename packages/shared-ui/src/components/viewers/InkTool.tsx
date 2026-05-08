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

export default function InkTool({ active, color, lineWidth, pageNum, docId, existingAnnotationId, existingStrokes, onCreated }: Props) {
  const api = useBanjuanAPI()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentPointsRef = useRef<StrokePoint[]>([])

  const getRelativePos = (e: React.MouseEvent): { x: number; y: number } => {
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active) return
    e.preventDefault()
    setDrawing(true)
    const pos = getRelativePos(e)
    currentPointsRef.current = [pos]
  }, [active])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
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

  const handleMouseUp = useCallback(async () => {
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

  return (
    <div ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
      style={{ position: 'absolute', inset: 0, cursor: active ? 'crosshair' : 'default',
        pointerEvents: active ? 'auto' : 'none', zIndex: active ? 10 : 2,
        display: active || existingStrokes.length > 0 ? undefined : 'none' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  )
}
