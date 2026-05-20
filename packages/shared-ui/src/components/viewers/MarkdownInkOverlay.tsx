import React, { useRef, useEffect, useState, useCallback } from 'react'
import { renderStroke, renderAllStrokes } from '../handwriting/renderStrokes.js'
import type { Stroke, StrokePoint } from '@banjuan/core'
import { useMarkdownViewer } from './MarkdownViewerContext.js'
import { useBanjuanAPI } from '../../api.js'
import type { HeadingItem } from '../notes/NoteOutlinePanel.js'

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
  color: string
}

interface Props {
  docId: string
  annotations: any[]
  headings: HeadingItem[]
  scrollContainer: HTMLElement | null
  onCreated: () => void
  onUndoRef?: React.MutableRefObject<(() => void) | null>
  onRedoRef?: React.MutableRefObject<(() => void) | null>
}

let inkIdCounter = 0

function toAbsoluteStrokes(strokes: InkStroke[], containerW: number): Stroke[] {
  return strokes.map(s => ({
    id: `ink-${++inkIdCounter}`,
    points: s.points.map(p => ({ x: p.x * containerW, y: p.y })),
    color: s.color,
    width: s.width,
    opacity: 1,
  }))
}

function findSectionId(y: number, headings: HeadingItem[], scrollContainer: HTMLElement): string {
  const canvasRect = scrollContainer.getBoundingClientRect()
  let lastId = '__before_first__'

  for (const h of headings) {
    const el = scrollContainer.querySelector(`[data-id="${h.id}"]`) as HTMLElement | null
    if (!el) continue
    const elRect = el.getBoundingClientRect()
    const elY = elRect.top - canvasRect.top + scrollContainer.scrollTop
    if (y < elY) break
    lastId = h.id
  }

  return lastId
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

export default function MarkdownInkOverlay({ docId, annotations, headings, scrollContainer, onCreated, onUndoRef, onRedoRef }: Props) {
  const api = useBanjuanAPI()
  const ctx = useMarkdownViewer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentPointsRef = useRef<StrokePoint[]>([])
  const isActive = ctx.activeTool === 'ink' || ctx.activeTool === 'eraser'

  const inkAnnotations: InkAnnotation[] = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.type === 'ink'
  )

  const redraw = useCallback(() => {
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

    for (const ann of inkAnnotations) {
      const absStrokes = toAbsoluteStrokes(ann.position.strokes, containerW)
      renderAllStrokes(c, absStrokes, containerW, containerH)
    }
  }, [inkAnnotations, scrollContainer])

  useEffect(() => { redraw() }, [redraw])

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
    const rect = canvasRef.current!.getBoundingClientRect()
    const containerW = scrollContainer?.scrollWidth ?? rect.width
    const x = (e.clientX - rect.left) / containerW
    const absY = e.clientY - rect.top
    currentPointsRef.current = [{ x, y: absY }]
  }, [ctx.activeTool, scrollContainer])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing || ctx.activeTool !== 'ink') return
    const canvas = canvasRef.current
    if (!canvas || !scrollContainer) return
    const rect = canvas.getBoundingClientRect()
    const containerW = scrollContainer.scrollWidth
    const containerH = scrollContainer.scrollHeight
    const x = (e.clientX - rect.left) / containerW
    const absY = e.clientY - rect.top
    currentPointsRef.current.push({ x, y: absY })

    const dpr = window.devicePixelRatio || 1
    canvas.width = containerW * dpr
    canvas.height = containerH * dpr
    canvas.style.width = `${containerW}px`
    canvas.style.height = `${containerH}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)

    for (const ann of inkAnnotations) {
      const absStrokes = toAbsoluteStrokes(ann.position.strokes, containerW)
      renderAllStrokes(c, absStrokes, containerW, containerH)
    }

    const liveStroke: Stroke = {
      id: 'live',
      points: currentPointsRef.current.map(p => ({ x: p.x * containerW, y: p.y })),
      color: ctx.inkColor,
      width: ctx.inkWidth,
      opacity: 1,
    }
    renderStroke(c, liveStroke)
  }, [drawing, ctx.activeTool, ctx.inkColor, ctx.inkWidth, inkAnnotations, scrollContainer])

  const handlePointerUp = useCallback(async () => {
    if (!drawing) return
    setDrawing(false)
    const points = currentPointsRef.current
    if (points.length < 2 || !scrollContainer) return

    const newStroke: InkStroke = {
      points: points.map(p => ({ x: p.x, y: p.y })),
      color: ctx.inkColor,
      width: ctx.inkWidth,
    }

    const avgY = points.reduce((s, p) => s + p.y, 0) / points.length
    const sectionId = findSectionId(avgY, headings, scrollContainer)

    const existing = inkAnnotations.find(a => (a.position.sectionId ?? '__before_first__') === sectionId)
    const allStrokes = existing
      ? [...existing.position.strokes, newStroke]
      : [newStroke]

    const bounds = computeBounds(allStrokes)
    const position = { type: 'ink' as const, sectionId, strokes: allStrokes, bounds }

    if (existing) {
      ctx.pushInkUndo({ annotationId: existing.id, strokes: [...existing.position.strokes] })
    } else {
      ctx.pushInkUndo({ annotationId: '__new__', strokes: [] })
    }
    ctx.clearInkRedo()

    if (existing) {
      await api.annotations.update(existing.id, { position })
    } else {
      await api.annotations.create({
        docId,
        type: 'ink',
        position,
        color: ctx.inkColor,
      })
    }
    currentPointsRef.current = []
    onCreated()
  }, [drawing, docId, ctx.inkColor, ctx.inkWidth, scrollContainer, onCreated, inkAnnotations, headings])

  const handleUndo = useCallback(async () => {
    const entry = ctx.popInkUndo()
    if (!entry) return
    const current = inkAnnotations.find(a => a.id === entry.annotationId)
    if (current) {
      ctx.pushInkRedo({ annotationId: current.id, strokes: [...current.position.strokes] })
      if (entry.strokes.length === 0) {
        await api.annotations.delete(current.id)
      } else {
        const bounds = computeBounds(entry.strokes)
        await api.annotations.update(current.id, {
          position: { ...current.position, strokes: entry.strokes, bounds },
        })
      }
    }
    onCreated()
  }, [inkAnnotations, onCreated])

  const handleRedo = useCallback(async () => {
    const entry = ctx.popInkRedo()
    if (!entry) return
    const current = inkAnnotations.find(a => a.id === entry.annotationId)
    if (current) {
      ctx.pushInkUndo({ annotationId: current.id, strokes: [...current.position.strokes] })
      const bounds = computeBounds(entry.strokes)
      await api.annotations.update(current.id, {
        position: { ...current.position, strokes: entry.strokes, bounds },
      })
    }
    onCreated()
  }, [inkAnnotations, onCreated])

  useEffect(() => {
    if (onUndoRef) onUndoRef.current = handleUndo
    if (onRedoRef) onRedoRef.current = handleRedo
  }, [handleUndo, handleRedo, onUndoRef, onRedoRef])

  const handleErase = useCallback(async (e: React.PointerEvent) => {
    if (!canvasRef.current || !scrollContainer) return
    const rect = canvasRef.current.getBoundingClientRect()
    const containerW = scrollContainer.scrollWidth
    const clickX = (e.clientX - rect.left) / containerW
    const clickY = e.clientY - rect.top
    const threshold = 20

    for (const ann of inkAnnotations) {
      for (let si = 0; si < ann.position.strokes.length; si++) {
        const stroke = ann.position.strokes[si]
        for (const pt of stroke.points) {
          const dx = (pt.x - clickX) * containerW
          const dy = pt.y - clickY
          if (Math.sqrt(dx * dx + dy * dy) < threshold) {
            const remaining = ann.position.strokes.filter((_, i) => i !== si)
            if (remaining.length === 0) {
              await api.annotations.delete(ann.id)
            } else {
              const bounds = computeBounds(remaining)
              await api.annotations.update(ann.id, {
                position: { type: 'ink', sectionId: ann.position.sectionId, strokes: remaining, bounds },
              })
            }
            onCreated()
            return
          }
        }
      }
    }
  }, [inkAnnotations, scrollContainer, onCreated])

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
        pointerEvents: isActive ? 'auto' : 'none',
        cursor: ctx.activeTool === 'ink' ? 'crosshair' : ctx.activeTool === 'eraser' ? 'pointer' : 'default',
        zIndex: isActive ? 10 : 2,
        touchAction: 'none',
      }}
    />
  )
}
