import React, { useRef, useEffect, useState, useCallback } from 'react'
import { renderStroke, renderAllStrokes } from '../handwriting/renderStrokes.js'
import type { Stroke, StrokePoint } from '@banjuan/core'
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
  onCreated: () => void
}

let inkIdCounter = 0

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

export default function EpubInkOverlay({ docId, annotations, containerRef, onCreated }: Props) {
  const api = useBanjuanAPI()
  const ctx = useEpubViewer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentPointsRef = useRef<StrokePoint[]>([])
  const isActive = ctx.activeTool === 'ink' || ctx.activeTool === 'eraser'

  // Find epub.js's internal scroll container
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

  // Track scroll position
  const [scrollTop, setScrollTop] = useState(0)
  useEffect(() => {
    if (!scrollContainer) return
    const handler = () => setScrollTop(scrollContainer.scrollTop)
    handler()
    scrollContainer.addEventListener('scroll', handler, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', handler)
  }, [scrollContainer])

  const inkAnnotations: InkAnnotation[] = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.type === 'ink'
  )

  const redraw = useCallback(() => {
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

    for (const ann of inkAnnotations) {
      const strokes: Stroke[] = ann.position.strokes.map(s => ({
        id: `epub-ink-${++inkIdCounter}`,
        points: s.points.map(p => ({ x: p.x * rect.width, y: p.y - scrollTop })),
        color: s.color,
        width: s.width,
        opacity: 1,
      }))
      renderAllStrokes(c, strokes, rect.width, rect.height)
    }
  }, [inkAnnotations, containerRef, scrollTop])

  useEffect(() => { redraw() }, [redraw])

  const toDocCoord = (e: React.PointerEvent, rect: DOMRect): { x: number; y: number } => ({
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) + scrollTop,
  })

  const handleErase = useCallback(async (e: React.PointerEvent) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const { x: clickX, y: clickY } = toDocCoord(e, rect)
    const threshold = 20

    for (const ann of inkAnnotations) {
      for (let si = 0; si < ann.position.strokes.length; si++) {
        const stroke = ann.position.strokes[si]
        for (const pt of stroke.points) {
          const dx = (pt.x - clickX) * rect.width
          const dy = pt.y - clickY
          if (Math.sqrt(dx * dx + dy * dy) < threshold) {
            const remaining = ann.position.strokes.filter((_, i) => i !== si)
            if (remaining.length === 0) {
              await api.annotations.delete(ann.id)
            } else {
              const bounds = computeBounds(remaining)
              await api.annotations.update(ann.id, {
                position: { type: 'ink' as const, strokes: remaining, bounds },
              })
            }
            onCreated()
            return
          }
        }
      }
    }
  }, [inkAnnotations, containerRef, onCreated, scrollTop])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (ctx.activeTool === 'eraser') {
      handleErase(e)
      return
    }
    if (ctx.activeTool !== 'ink') return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrawing(true)
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    currentPointsRef.current = [toDocCoord(e, rect)]
  }, [ctx.activeTool, containerRef, handleErase, scrollTop])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing || ctx.activeTool !== 'ink') return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    currentPointsRef.current.push(toDocCoord(e, rect))

    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)

    for (const ann of inkAnnotations) {
      const strokes: Stroke[] = ann.position.strokes.map(s => ({
        id: `epub-ink-${++inkIdCounter}`,
        points: s.points.map(p => ({ x: p.x * rect.width, y: p.y - scrollTop })),
        color: s.color,
        width: s.width,
        opacity: 1,
      }))
      renderAllStrokes(c, strokes, rect.width, rect.height)
    }

    const liveStroke: Stroke = {
      id: 'live',
      points: currentPointsRef.current.map(p => ({ x: p.x * rect.width, y: p.y - scrollTop })),
      color: ctx.inkColor,
      width: ctx.inkWidth,
      opacity: 1,
    }
    renderStroke(c, liveStroke)
  }, [drawing, ctx.activeTool, ctx.inkColor, ctx.inkWidth, inkAnnotations, containerRef, scrollTop])

  const handlePointerUp = useCallback(async () => {
    if (!drawing) return
    setDrawing(false)
    const points = currentPointsRef.current
    if (points.length < 2) return

    const newStroke: InkStroke = {
      points: points.map(p => ({ x: p.x, y: p.y })),
      color: ctx.inkColor,
      width: ctx.inkWidth,
    }

    const existing = inkAnnotations[0]
    const allStrokes = existing
      ? [...existing.position.strokes, newStroke]
      : [newStroke]
    const bounds = computeBounds(allStrokes)
    const position = { type: 'ink' as const, strokes: allStrokes, bounds }

    if (existing) {
      ctx.pushInkUndo({ annotationId: existing.id, strokes: [...existing.position.strokes] })
      await api.annotations.update(existing.id, { position })
    } else {
      ctx.pushInkUndo({ annotationId: '__new__', strokes: [] })
      await api.annotations.create({
        docId, type: 'ink', position, color: ctx.inkColor,
      })
    }
    ctx.clearInkRedo()
    currentPointsRef.current = []
    onCreated()
  }, [drawing, docId, ctx.inkColor, ctx.inkWidth, onCreated, inkAnnotations])

  if (!isActive && inkAnnotations.length === 0) return null

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
        width: '100%',
        height: '100%',
        pointerEvents: isActive ? 'auto' : 'none',
        cursor: ctx.activeTool === 'ink' ? 'crosshair' : ctx.activeTool === 'eraser' ? 'pointer' : 'default',
        zIndex: isActive ? 10 : 2,
        touchAction: 'none',
      }}
    />
  )
}
