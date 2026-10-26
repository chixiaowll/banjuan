import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { renderStroke } from '../handwriting/renderStrokes.js'
import { useBanjuanAPI } from '../../api.js'
import { useIsActiveTab } from '../tabActive.js'
import { isEditableTarget } from '../../utils/keyboard.js'
import { useT } from '../../i18n/index.js'
import { useFitInViewport } from '../../utils/useFitInViewport.js'
import { useEscapeKey } from '../../utils/useEscapeKey.js'
import { toast, errorMessage } from '../feedback.js'
import { canvasScale } from './canvasScale.js'
import {
  flattenStrokes, selectInLasso, selectionBounds, inRect, applyToSelection, strokeBounds,
  type InkEntry, type Point,
} from './inkLasso.js'

/**
 * The ink lasso of the PDF, EPUB and Markdown viewers: draw a loop to select
 * strokes, drag the selection to move it, Delete / Backspace or the context
 * menu to remove it. The viewer supplies its coordinate mapping (`measure`)
 * and the markup; this hook does the rest.
 */

/** A viewer's coordinate mapping, measured afresh for each redraw / pointer event. */
export interface LassoFrame {
  /** Canvas size in CSS px. */
  w: number
  h: number
  /** Also set the canvas' CSS size to w × h (otherwise the viewer sizes it, e.g. 100%). */
  fixedCssSize?: boolean
  /** Stored point → work space (CSS px; may be scroll-independent, see workToCanvas). */
  toWork(p: Point): Point
  /** A work-space delta → stored delta. */
  workDeltaToStored(d: Point): Point
  /** Pointer position → work space. */
  eventToWork(e: { clientX: number; clientY: number }): Point
  /** Work space → canvas px, when they differ (EPUB: minus the scroll offset). */
  workToCanvas?(p: Point): Point
}

interface Options {
  active: boolean
  entries: InkEntry[]
  measure: (canvas: HTMLCanvasElement) => LassoFrame | null
  onUpdated: () => void
  /** Pointer events to leave alone (EPUB: touch, which scrolls). */
  ignorePointer?: (e: React.PointerEvent) => boolean
  /**
   * Elements whose size changes call for a repaint, besides the canvas' parent
   * (Markdown: the content, which grows as it renders). Read on every render.
   */
  resizeTargets?: Array<Element | null | undefined>
  stopPropagation?: boolean
}

type Mode = 'idle' | 'lasso' | 'dragging'
const SELECT_COLOR = '#3182ce'
/** How far outside the selection box (CSS px) a press still grabs it. */
const GRAB_MARGIN = 12

export function useInkLasso({ active, entries, measure, onUpdated, ignorePointer, stopPropagation, resizeTargets }: Options) {
  const api = useBanjuanAPI()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const measureRef = useRef(measure)
  measureRef.current = measure
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const strokes = useMemo(() => flattenStrokes(entries), [entries])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  const modeRef = useRef<Mode>('idle')
  const [mode, setModeState] = useState<Mode>('idle')
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m) }
  const [selected, setSelectedState] = useState<Set<number>>(() => new Set())
  const selectedRef = useRef(selected)
  const setSelected = (s: Set<number>) => { selectedRef.current = s; setSelectedState(s) }
  const lassoRef = useRef<Point[]>([])
  const dragStartRef = useRef<Point>({ x: 0, y: 0 })
  const offsetRef = useRef<Point>({ x: 0, y: 0 })

  const workStrokes = (frame: LassoFrame) => strokesRef.current.map(s => s.points.map(frame.toWork))

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const frame = canvas && measureRef.current(canvas)
    if (!canvas || !frame || !frame.w || !frame.h) return
    const dpr = canvasScale(frame.w, frame.h, 8_388_608)
    canvas.width = Math.round(frame.w * dpr)
    canvas.height = Math.round(frame.h * dpr)
    if (frame.fixedCssSize) {
      canvas.style.width = `${frame.w}px`
      canvas.style.height = `${frame.h}px`
    }
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)
    const toCanvas = frame.workToCanvas ?? ((p: Point) => p)
    const sel = selectedRef.current
    const off = offsetRef.current
    const shift = (p: Point) => ({ x: p.x + off.x, y: p.y + off.y })

    const work = workStrokes(frame)
    strokesRef.current.forEach((s, i) => {
      const pts = sel.has(i) ? work[i].map(p => toCanvas(shift(p))) : work[i].map(toCanvas)
      renderStroke(c, { id: `lasso-${i}`, points: pts, color: s.color, width: s.width, opacity: 1 })
    })

    const b = sel.size ? selectionBounds(work, sel) : null
    if (b) {
      const m = 8
      const tl = toCanvas(shift({ x: b.x, y: b.y }))
      const x = tl.x - m, y = tl.y - m, w = b.w + m * 2, h = b.h + m * 2
      c.save()
      c.setLineDash([6, 3])
      c.strokeStyle = SELECT_COLOR
      c.lineWidth = 1.5
      c.strokeRect(x, y, w, h)
      c.setLineDash([])
      c.fillStyle = 'white'
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        c.beginPath()
        c.arc(cx, cy, 4, 0, Math.PI * 2)
        c.fill()
        c.stroke()
      }
      c.restore()
    }

    const lasso = lassoRef.current
    if (modeRef.current === 'lasso' && lasso.length > 2) {
      c.save()
      c.beginPath()
      const p0 = toCanvas(lasso[0])
      c.moveTo(p0.x, p0.y)
      for (let i = 1; i < lasso.length; i++) {
        const p = toCanvas(lasso[i])
        c.lineTo(p.x, p.y)
      }
      c.closePath()
      c.fillStyle = 'rgba(49,130,206,0.06)'
      c.fill()
      c.setLineDash([5, 3])
      c.strokeStyle = SELECT_COLOR
      c.lineWidth = 1.5
      c.stroke()
      c.restore()
    }
  }, [])

  // New ink from the viewer (or our own move landing): drop the preview offset and repaint.
  useEffect(() => {
    offsetRef.current = { x: 0, y: 0 }
    if (selectedRef.current.size && [...selectedRef.current].some(i => i >= strokes.length)) setSelected(new Set())
    redraw()
  }, [strokes, redraw])

  // Zoom, window resizes, content still rendering: repaint at the new size.
  // Re-subscribes only when the set of watched elements changes.
  const observed = useRef<{ ro: ResizeObserver; els: Element[] } | null>(null)
  useEffect(() => {
    const els = [canvasRef.current?.parentElement, ...(resizeTargets ?? [])]
      .filter((el): el is Element => !!el && el !== canvasRef.current)
    const cur = observed.current
    if (cur && cur.els.length === els.length && cur.els.every((el, i) => el === els[i])) return
    cur?.ro.disconnect()
    const ro = new ResizeObserver(() => redraw())
    for (const el of els) ro.observe(el)
    observed.current = { ro, els }
    redraw()
  })
  useEffect(() => () => observed.current?.ro.disconnect(), [])

  useEffect(() => {
    if (active) return
    setSelected(new Set())
    lassoRef.current = []
    offsetRef.current = { x: 0, y: 0 }
    setMode('idle')
    redraw()
  }, [active, redraw])

  const persist = useCallback(async (op: { move: Point } | { remove: true }) => {
    const changes = applyToSelection(entriesRef.current, selectedRef.current, op)
    if (!changes.length) return
    try {
      for (const { entry, strokes } of changes) {
        if (strokes.length === 0) await api.annotations.delete(entry.annotationId)
        else await api.annotations.update(entry.annotationId, { position: { ...entry.position, type: 'ink', strokes, bounds: strokeBounds(strokes) } as any })
      }
    } catch (e) {
      toast.error(errorMessage(e))
      offsetRef.current = { x: 0, y: 0 }
      redraw()
    }
    onUpdated()
  }, [api, onUpdated, redraw])

  const deleteSelected = useCallback(async () => {
    if (!selectedRef.current.size) return
    await persist({ remove: true })
    setSelected(new Set())
    redraw()
  }, [persist, redraw])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!active || ignorePointer?.(e)) return
    const canvas = canvasRef.current
    const frame = canvas && measureRef.current(canvas)
    if (!frame) return
    e.preventDefault()
    if (stopPropagation) e.stopPropagation()
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* not capturable */ }
    const pos = frame.eventToWork(e)
    const bounds = selectedRef.current.size ? selectionBounds(workStrokes(frame), selectedRef.current) : null
    if (bounds && inRect(pos, bounds, GRAB_MARGIN)) {
      dragStartRef.current = pos
      offsetRef.current = { x: 0, y: 0 }
      setMode('dragging')
      return
    }
    setSelected(new Set())
    lassoRef.current = [pos]
    setMode('lasso')
    redraw()
  }, [active, ignorePointer, stopPropagation, redraw])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (modeRef.current === 'idle') return
    const canvas = canvasRef.current
    const frame = canvas && measureRef.current(canvas)
    if (!frame) return
    const pos = frame.eventToWork(e)
    if (modeRef.current === 'lasso') lassoRef.current.push(pos)
    else offsetRef.current = { x: pos.x - dragStartRef.current.x, y: pos.y - dragStartRef.current.y }
    redraw()
  }, [redraw])

  const onPointerUp = useCallback(() => {
    const m = modeRef.current
    if (m === 'idle') return
    setMode('idle')
    const canvas = canvasRef.current
    const frame = canvas && measureRef.current(canvas)
    if (m === 'dragging') {
      const off = offsetRef.current
      // The preview stays shifted until the moved ink comes back (no flicker).
      if (frame && (off.x || off.y)) void persist({ move: frame.workDeltaToStored(off) })
      return
    }
    const sel = frame ? selectInLasso(workStrokes(frame), lassoRef.current) : new Set<number>()
    lassoRef.current = []
    setSelected(sel)
    redraw()
  }, [persist, redraw])

  const isActiveTab = useIsActiveTab()
  useEffect(() => {
    if (!active || !isActiveTab) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return   // Backspace in a note editor isn't "delete ink"
      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedRef.current.size > 0) {
        e.preventDefault()
        void deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, isActiveTab, deleteSelected])

  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!selectedRef.current.size) return
    e.preventDefault()
    setMenuAt({ x: e.clientX, y: e.clientY })
  }, [])

  const menu = menuAt ? <LassoMenu at={menuAt} onDelete={() => void deleteSelected()} onClose={() => setMenuAt(null)} /> : null

  const cursor = !active ? 'default' : mode === 'dragging' ? 'grabbing' : selected.size ? 'default' : 'crosshair'

  return {
    canvasRef,
    redraw,
    cursor,
    menu,
    strokeCount: strokes.length,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onContextMenu },
  }
}

function LassoMenu({ at, onDelete, onClose }: { at: { x: number; y: number }; onDelete: () => void; onClose: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useFitInViewport(ref)
  useEscapeKey(true, onClose)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  return (
    <div ref={ref} style={{
      position: 'fixed', left: at.x, top: at.y, zIndex: 9999,
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 4, minWidth: 120,
    }}>
      <button
        onClick={() => { onDelete(); onClose() }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          cursor: 'pointer', fontSize: 13, color: '#e53e3e', border: 'none',
          background: 'none', width: '100%', textAlign: 'left', borderRadius: 4,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--selected)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <Trash2 size={14} /> {t('common.delete')}
      </button>
    </div>
  )
}
