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

const CLUSTER_PAD_X = 0.05
const CLUSTER_PAD_Y = 10

function boundsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  if (a.x + a.w + CLUSTER_PAD_X < b.x) return false
  if (b.x + b.w + CLUSTER_PAD_X < a.x) return false
  if (a.y + a.h + CLUSTER_PAD_Y < b.y) return false
  if (b.y + b.h + CLUSTER_PAD_Y < a.y) return false
  return true
}

function getScale(el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  const logical = el.clientWidth
  if (!logical) return 1
  return rect.width / logical
}

export default function EpubInkOverlay({ docId, annotations, containerRef, onCreated }: Props) {
  const api = useBanjuanAPI()
  const ctx = useEpubViewer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentPointsRef = useRef<StrokePoint[]>([])
  const isActive = ctx.activeTool === 'ink' || ctx.activeTool === 'eraser'

  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const scrollTopRef = useRef(0)
  const rafIdRef = useRef(0)
  const inkAnnotationsRef = useRef<InkAnnotation[]>([])

  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const find = () => {
      if (cancelled) return
      const sc = containerRef.current?.querySelector('.epub-container') as HTMLElement | null
      if (sc) { setScrollContainer(sc); scrollContainerRef.current = sc }
      else timer = setTimeout(find, 100)
    }
    find()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [containerRef, ctx.rendition])

  const inkAnnotations: InkAnnotation[] = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.type === 'ink'
  )
  inkAnnotationsRef.current = inkAnnotations

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const logicalW = container.clientWidth
    const logicalH = container.clientHeight
    if (!logicalW || !logicalH) return
    const dpr = window.devicePixelRatio || 1
    const st = scrollTopRef.current

    canvas.width = logicalW * dpr
    canvas.height = logicalH * dpr
    canvas.style.width = `${logicalW}px`
    canvas.style.height = `${logicalH}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)

    const allStrokes: Stroke[] = inkAnnotationsRef.current.flatMap(ann =>
      ann.position.strokes.map(s => ({
        id: `epub-ink-${++inkIdCounter}`,
        points: s.points.map(p => ({ x: p.x * logicalW, y: p.y - st })),
        color: s.color,
        width: s.width,
        opacity: 1,
      }))
    )
    renderAllStrokes(c, allStrokes, logicalW, logicalH)
  }, [containerRef])

  // Sync scroll → immediate canvas redraw (no React state in the hot path)
  useEffect(() => {
    if (!scrollContainer) return
    const onScroll = () => {
      scrollTopRef.current = scrollContainer.scrollTop
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(drawFrame)
    }
    scrollTopRef.current = scrollContainer.scrollTop
    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollContainer.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafIdRef.current)
    }
  }, [scrollContainer, drawFrame])

  // Redraw when annotations change
  useEffect(() => { drawFrame() }, [inkAnnotations.length, drawFrame])

  // Redraw on container resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => drawFrame())
    ro.observe(container)
    return () => ro.disconnect()
  }, [containerRef, drawFrame])

  // Forward wheel events through canvas to scroll container
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !scrollContainer || !isActive || !container) return
    const handleWheel = (e: WheelEvent) => {
      const scale = getScale(container)
      scrollContainer.scrollBy({ top: e.deltaY / scale })
      e.preventDefault()
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [scrollContainer, isActive, containerRef])

  const toDocCoord = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const container = containerRef.current!
    const rect = container.getBoundingClientRect()
    const scale = getScale(container)
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / scale + scrollTopRef.current,
    }
  }, [containerRef])

  const handleErase = useCallback(async (e: React.PointerEvent) => {
    const container = containerRef.current
    if (!container) return
    const logicalW = container.clientWidth
    const { x: clickX, y: clickY } = toDocCoord(e)
    const threshold = 20

    for (const ann of inkAnnotationsRef.current) {
      for (let si = 0; si < ann.position.strokes.length; si++) {
        const stroke = ann.position.strokes[si]
        for (const pt of stroke.points) {
          const dx = (pt.x - clickX) * logicalW
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
  }, [containerRef, onCreated, toDocCoord])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (ctx.activeTool === 'eraser') {
      handleErase(e)
      return
    }
    if (ctx.activeTool !== 'ink') return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrawing(true)
    currentPointsRef.current = [toDocCoord(e)]
  }, [ctx.activeTool, handleErase, toDocCoord])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing || ctx.activeTool !== 'ink') return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    currentPointsRef.current.push(toDocCoord(e))

    const logicalW = container.clientWidth
    const logicalH = container.clientHeight
    const st = scrollTopRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = logicalW * dpr
    canvas.height = logicalH * dpr
    canvas.style.width = `${logicalW}px`
    canvas.style.height = `${logicalH}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)

    const existingStrokes: Stroke[] = inkAnnotationsRef.current.flatMap(ann =>
      ann.position.strokes.map(s => ({
        id: `epub-ink-${++inkIdCounter}`,
        points: s.points.map(p => ({ x: p.x * logicalW, y: p.y - st })),
        color: s.color,
        width: s.width,
        opacity: 1,
      }))
    )

    const liveStroke: Stroke = {
      id: 'live',
      points: currentPointsRef.current.map(p => ({ x: p.x * logicalW, y: p.y - st })),
      color: ctx.inkColor,
      width: ctx.inkWidth,
      opacity: 1,
    }
    renderAllStrokes(c, [...existingStrokes, liveStroke], logicalW, logicalH)
  }, [drawing, ctx.activeTool, ctx.inkColor, ctx.inkWidth, containerRef, toDocCoord])

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

    const newBounds = computeBounds([newStroke])
    const overlapping = inkAnnotationsRef.current.find(a => boundsOverlap(a.position.bounds, newBounds))

    if (overlapping) {
      const allStrokes = [...overlapping.position.strokes, newStroke]
      const bounds = computeBounds(allStrokes)
      ctx.pushInkUndo({ annotationId: overlapping.id, strokes: [...overlapping.position.strokes] })
      await api.annotations.update(overlapping.id, {
        position: { type: 'ink', strokes: allStrokes, bounds },
      })
    } else {
      ctx.pushInkUndo({ annotationId: '__new__', strokes: [] })
      await api.annotations.create({
        docId,
        type: 'ink',
        position: { type: 'ink', strokes: [newStroke], bounds: newBounds },
        color: ctx.inkColor,
      })
    }
    ctx.clearInkRedo()
    currentPointsRef.current = []
    onCreated()
  }, [drawing, docId, ctx.inkColor, ctx.inkWidth, onCreated])

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
        zIndex: isActive ? 10 : 1,
        touchAction: 'pan-y',
      }}
    />
  )
}
