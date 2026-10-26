import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
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
  /** Strokes of the page's (visible) ink annotations, for drawing. Writes read the stored ones afresh. */
  existingStrokes: InkStroke[]
  onCreated: () => void
}

const boundsOf = (strokes: InkStroke[]) => {
  const pts = strokes.flatMap(s => s.points)
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
const sameStroke = (a: InkStroke, b: InkStroke) =>
  a.points.length === b.points.length && a.color === b.color && a.width === b.width &&
  a.points.every((p, i) => p.x === b.points[i].x && p.y === b.points[i].y)

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

export default function InkTool({ active, eraserActive, color, lineWidth, pageNum, docId, existingStrokes: propStrokes, onCreated }: Props) {
  const api = useBanjuanAPI()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentPointsRef = useRef<StrokePoint[]>([])

  // Writes run one at a time, each on the annotation as stored right now — not
  // on the props, which lag behind until the parent reloads. Writing from the
  // props lost the previous stroke when strokes came quickly, and merged every
  // ink annotation of the page into the first one.
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  const ownIdRef = useRef<string | null>(null)
  // Strokes drawn here that the props don't show yet (drawn until they do).
  const [pending, setPending] = useState<InkStroke[]>([])
  const existingStrokes = useMemo(() => {
    const unseen = pending.filter(p => !propStrokes.some(s => sameStroke(s, p)))
    return unseen.length ? [...propStrokes, ...unseen] : propStrokes
  }, [propStrokes, pending])
  useEffect(() => {
    setPending(prev => {
      const left = prev.filter(p => !propStrokes.some(s => sameStroke(s, p)))
      return left.length === prev.length ? prev : left
    })
  }, [propStrokes])

  const storedInk = useCallback(async () =>
    (await api.annotations.list({ docId, page: pageNum })).filter(a => a.position && (a.position as any).type === 'ink'),
  [api, docId, pageNum])
  const enqueue = useCallback((job: () => Promise<void>) => {
    writeQueue.current = writeQueue.current.then(job).catch(e => console.error('[InkTool] saving ink failed', e))
    return writeQueue.current
  }, [])

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

  const handleErase = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = getRelativePos(e)
    const threshold = 20
    const near = (stroke: InkStroke) => stroke.points.some(pt =>
      Math.hypot((pt.x - pos.x) * rect.width, (pt.y - pos.y) * rect.height) < threshold)
    void enqueue(async () => {
      // The stroke is removed from the annotation it actually belongs to.
      for (const ann of await storedInk()) {
        const strokes: InkStroke[] = (ann.position as any).strokes ?? []
        const si = strokes.findIndex(near)
        if (si === -1) continue
        const remaining = strokes.filter((_, i) => i !== si)
        if (remaining.length === 0) {
          await api.annotations.delete(ann.id)
          if (ownIdRef.current === ann.id) ownIdRef.current = null
        } else {
          await api.annotations.update(ann.id, {
            position: { type: 'ink', page: pageNum, strokes: remaining, bounds: boundsOf(remaining) },
          })
        }
        onCreated()
        return
      }
    })
  }, [enqueue, storedInk, api, pageNum, onCreated])

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
    currentPointsRef.current = []
    setPending(prev => [...prev, newStroke])
    await enqueue(async () => {
      // Append to this page's ink annotation as stored now (the one this tool
      // wrote to, else the first), or create one.
      const anns = await storedInk()
      const target = anns.find(a => a.id === ownIdRef.current) ?? anns[0]
      if (target) {
        ownIdRef.current = target.id
        const strokes = [...((target.position as any).strokes ?? []), newStroke]
        await api.annotations.update(target.id, { position: { type: 'ink', page: pageNum, strokes, bounds: boundsOf(strokes) } })
      } else {
        const strokes = [newStroke]
        const created = await api.annotations.create({
          docId, type: 'ink', page: pageNum, color,
          position: { type: 'ink', page: pageNum, strokes, bounds: boundsOf(strokes) },
        })
        ownIdRef.current = created.id
      }
    })
    onCreated()
  }, [drawing, docId, pageNum, color, lineWidth, onCreated, enqueue, storedInk, api])

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
