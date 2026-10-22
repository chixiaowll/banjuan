import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@banjuan/shared-ui/src/i18n/index.js'
import { isUsableSelection, normalizeRect, clampPoint, pointInRect, placeToolbar, type Point, type Rect } from './geometry.js'
import { idleState, pointerDown as selDown, pointerMove as selMove, pointerUp as selUp, nudge as selNudge, escape as selEscape, rightClick as selRightClick, currentRect, cursorFor, handlePoint, HANDLES, type SelState, type Env } from './selection.js'
import { renderShapes, shapeAt, shapeBounds, translateShape, nextNumber, newShapeId, type Shape, type ShapeStyle, type ToolKind } from './shapes.js'
import { initHistory, commit, undo, redo, canUndo, canRedo, type History } from './history.js'
import { bgraToRgba } from './bitmap.js'
import { composeRegion, canvasToPng } from './compose.js'
import { loadStyle, saveStyle } from './prefs.js'
import { Magnifier, colorAt } from './Magnifier.js'
import { Toolbar } from './Toolbar.js'
import { bridge, type ScreenshotSession, type ScreenshotAction } from './bridge.js'

const DIM = 'rgba(0,0,0,0.45)'
const ACCENT = '#1a73e8'
type TextDraft = { at: Point; value: string; editingId: string | null }

/** Error panel: a crash shows a readable message and always offers a way out. */
function ErrorPanel({ text }: { text: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') bridge.cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div onClick={() => bridge.cancel()} style={{ position: 'fixed', inset: 0, background: '#111', color: '#fff', padding: 24, font: '12px ui-monospace, monospace', whiteSpace: 'pre-wrap', overflow: 'auto', cursor: 'pointer', zIndex: 99999 }}>
      {'[screenshot overlay error — click or Esc to close]\n\n' + text}
    </div>
  )
}

class Boundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: any) { return { err: String(e?.stack || e?.message || e) } }
  render() { return this.state.err ? <ErrorPanel text={this.state.err} /> : this.props.children }
}

export default function Overlay() {
  return <Boundary><OverlayInner /></Boundary>
}

function OverlayInner() {
  const t = useT()
  const bgRef = useRef<HTMLCanvasElement>(null)
  const shapesRef = useRef<HTMLCanvasElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<ScreenshotSession | null>(null)
  const [asyncErr, setAsyncErr] = useState<string | null>(null)
  const [sel, setSel] = useState<SelState>(idleState())
  const [tool, setTool] = useState<ToolKind | null>(null)
  const [hist, setHist] = useState<History<Shape[]>>(initHistory([]))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [style, setStyle] = useState<ShapeStyle>(loadStyle)
  const [draft, setDraft] = useState<Shape | null>(null)
  const [moving, setMoving] = useState<Shape | null>(null)
  const [text, setText] = useState<TextDraft | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [barSize, setBarSize] = useState({ w: 420, h: 40 })
  const anchor = useRef<Point | null>(null)
  const moveStart = useRef<{ start: Point; origin: Shape } | null>(null)
  const shapes = hist.present

  const reset = useCallback(() => {
    setSel(idleState()); setTool(null); setHist(initHistory([])); setSelectedId(null)
    setDraft(null); setMoving(null); setText(null); setPointer(null); setNotice(null); setBusy(false)
  }, [])

  // A session arrives: paint the capture first, then tell main it may show the window.
  // Listeners first, then announce the page — main waits for that before sending a session.
  useEffect(() => {
    const offSession = bridge.onSession(s => {
      const c = bgRef.current!
      c.width = s.pixelWidth
      c.height = s.pixelHeight
      c.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(bgraToRgba(s.bitmap), s.pixelWidth, s.pixelHeight), 0, 0)
      reset()
      setSession(s)
      // The window is already shown (transparent), so frames run at full rate:
      // two frames later the capture is on screen and main can make it opaque.
      requestAnimationFrame(() => requestAnimationFrame(() => bridge.ready(s.sessionId)))
    })
    const offReset = bridge.onReset(() => { reset(); setSession(null) })
    bridge.pageReady()
    return () => { offSession(); offReset() }
  }, [reset])

  // Event-handler / async errors aren't caught by the error boundary.
  useEffect(() => {
    const onErr = (e: ErrorEvent) => setAsyncErr(String(e.error?.stack || e.message))
    const onRej = (e: PromiseRejectionEvent) => setAsyncErr(String(e.reason?.stack || e.reason?.message || e.reason))
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej) }
  }, [])

  const bounds = useMemo<Rect>(() => ({ x: 0, y: 0, w: session?.cssWidth ?? window.innerWidth, h: session?.cssHeight ?? window.innerHeight }), [session])
  const locked = shapes.length > 0 || !!text
  const env = useMemo<Env>(() => ({ bounds, windows: [...(session?.windows ?? []), bounds], locked }), [bounds, session, locked])
  const region = currentRect(sel)
  const regionReady = sel.mode === 'selected' && isUsableSelection(region)

  // Main follows the cursor to another display only while nothing is being selected.
  useEffect(() => { if (session) bridge.setIdle(sel.mode === 'idle') }, [sel.mode, session])

  const updateStyle = (s: ShapeStyle) => {
    setStyle(s)
    saveStyle(s)
    if (selectedId) setHist(h => commit(h, h.present.map(x => (x.id === selectedId ? { ...x, style: s } : x))))
  }

  const commitText = useCallback(() => {
    setText(cur => {
      if (cur) {
        const value = cur.value.trim()
        setHist(h => {
          if (cur.editingId) {
            return commit(h, value ? h.present.map(s => (s.id === cur.editingId && s.kind === 'text' ? { ...s, text: value } : s)) : h.present.filter(s => s.id !== cur.editingId))
          }
          return value ? commit(h, [...h.present, { id: newShapeId(), kind: 'text', style, at: cur.at, text: value }]) : h
        })
      }
      return null
    })
  }, [style])

  const finish = useCallback(async (action: ScreenshotAction) => {
    if (!session || !regionReady || !region || busy) return
    if (action === 'insert' && !session.canInsertNote) return
    setBusy(true)
    try {
      // An open text box is part of the image too.
      const pending: Shape[] = text?.value.trim() && !text.editingId ? [{ id: 'pending', kind: 'text', style, at: text.at, text: text.value.trim() }] : []
      const out = composeRegion(bgRef.current!, region, [...shapes, ...pending], session.scaleFactor)
      const png = await canvasToPng(out)
      bridge.finish({ sessionId: session.sessionId, action, png, rect: region, fileNamePrefix: t('screenshot.fileName') })
    } catch (err) {
      console.error('[screenshot] compose failed', err)
      bridge.cancel()
    } finally {
      setBusy(false)
    }
  }, [session, regionReady, region, busy, text, style, shapes, t])

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(n => (n === msg ? null : n)), 1500) }
  const magnifierOn = !!session && !!pointer && (sel.mode === 'idle' || sel.mode === 'dragging' || sel.mode === 'resizing')

  const escapeLadder = useCallback(() => {
    if (tool) { setTool(null); return }
    if (selectedId) { setSelectedId(null); return }
    const next = selEscape(sel, locked)
    if (next === null) bridge.cancel()
    else setSel(next)
  }, [tool, selectedId, sel, locked])

  // Keyboard: Esc ladder, Enter/⌘C copy, ⌘S save, ⌘Z/⇧⌘Z, Delete, arrows, C = copy colour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!session) { if (e.key === 'Escape') bridge.cancel(); return }   // Esc always gets out
      if (text) return   // the text box handles its own keys
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (e.key === 'Escape') { e.preventDefault(); escapeLadder(); return }
      if (e.key === 'Enter' || (mod && key === 'c')) { e.preventDefault(); void finish('copy'); return }
      if (mod && key === 's') { e.preventDefault(); void finish('save'); return }
      if (mod && key === 'z') { e.preventDefault(); setHist(h => (e.shiftKey ? redo(h) : undo(h))); setSelectedId(null); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setHist(h => commit(h, h.present.filter(s => s.id !== selectedId)))
        setSelectedId(null)
        return
      }
      if (!mod && key === 'c' && magnifierOn && pointer && bgRef.current) {
        const hex = colorAt(bgRef.current, pointer, session.scaleFactor)
        void navigator.clipboard.writeText(hex).then(() => flash(t('screenshot.colorCopied', hex)))
        return
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (e.key in arrows) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const [dx, dy] = arrows[e.key].map(v => v * step)
        if (selectedId) setHist(h => commit(h, h.present.map(s => (s.id === selectedId ? translateShape(s, dx, dy) : s))))
        else setSel(s => selNudge(s, dx, dy, env))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pt = (e: React.PointerEvent | React.MouseEvent): Point => ({ x: e.clientX, y: e.clientY })

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !session) return
    const p = pt(e)
    if (text) { commitText(); return }
    if (regionReady && region && tool && pointInRect(p, region)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      const q = clampPoint(p, region)
      const id = newShapeId()
      anchor.current = q
      setSelectedId(null)
      if (tool === 'text') { setText({ at: q, value: '', editingId: null }); return }
      if (tool === 'number') { setHist(h => commit(h, [...h.present, { id, kind: 'number', style, at: q, n: nextNumber(h.present) }])); return }
      if (tool === 'rect' || tool === 'ellipse') setDraft({ id, kind: tool, style, rect: { x: q.x, y: q.y, w: 0, h: 0 } })
      else if (tool === 'arrow') setDraft({ id, kind: 'arrow', style, tail: q, head: q })
      else setDraft({ id, kind: tool, style, points: [q] })
      return
    }
    if (regionReady && region && !tool) {
      const hit = shapeAt(shapes, p)
      if (hit) {
        e.currentTarget.setPointerCapture(e.pointerId)
        setSelectedId(hit.id)
        moveStart.current = { start: p, origin: hit }
        return
      }
      if (selectedId) setSelectedId(null)
    }
    if (locked) return   // an annotated region can't be re-selected
    e.currentTarget.setPointerCapture(e.pointerId)
    setSel(s => selDown(s, p, env))
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pt(e)
    setPointer(p)
    if (draft && region) {
      const q = clampPoint(p, region)
      if (draft.kind === 'rect' || draft.kind === 'ellipse') setDraft({ ...draft, rect: normalizeRect(anchor.current!, q) })
      else if (draft.kind === 'arrow') setDraft({ ...draft, head: q })
      else if (draft.kind === 'pen' || draft.kind === 'highlighter' || draft.kind === 'mosaic') setDraft({ ...draft, points: [...draft.points, q] })
      return
    }
    if (moveStart.current) {
      const { start, origin } = moveStart.current
      setMoving(translateShape(origin, p.x - start.x, p.y - start.y))
      return
    }
    setSel(s => selMove(s, p, env))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pt(e)
    if (draft) {
      const b = shapeBounds(draft)
      const meaningful = draft.kind === 'pen' || draft.kind === 'highlighter' || draft.kind === 'mosaic'
        ? draft.points.length > 1
        : b.w > 6 || b.h > 6
      if (meaningful) setHist(h => commit(h, [...h.present, draft]))
      setDraft(null)
      return
    }
    if (moveStart.current) {
      const moved = moving
      moveStart.current = null
      setMoving(null)
      if (moved) setHist(h => commit(h, h.present.map(s => (s.id === moved.id ? moved : s))))
      return
    }
    setSel(s => selUp(s, p, env))
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!regionReady || !region || tool) return
    const p = pt(e)
    const hit = shapeAt(shapes, p)
    if (hit?.kind === 'text') { setSelectedId(null); setText({ at: hit.at, value: hit.text, editingId: hit.id }); return }
    if (pointInRect(p, region)) void finish('copy')
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (text) { commitText(); return }
    if (selectedId) { setSelectedId(null); return }
    if (locked) { bridge.cancel(); return }
    const next = selRightClick(sel)
    if (next === null) bridge.cancel()
    else setSel(next)
  }

  // Shapes layer: device-crisp canvas over the selection.
  const visible = useMemo(() => {
    let list = moving ? shapes.map(s => (s.id === moving.id ? moving : s)) : shapes
    if (text?.editingId) list = list.filter(s => s.id !== text.editingId)
    return draft ? [...list, draft] : list
  }, [shapes, moving, draft, text])

  useEffect(() => {
    const c = shapesRef.current
    if (!c || !region || !session) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.max(1, Math.round(region.w * dpr))
    c.height = Math.max(1, Math.round(region.h * dpr))
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.save()
    ctx.translate(-region.x * dpr, -region.y * dpr)
    renderShapes(ctx, visible, { scale: dpr, background: bgRef.current!, backgroundScale: session.scaleFactor })
    ctx.restore()
  })

  useLayoutEffect(() => {
    const b = toolbarRef.current
    if (b && (b.offsetWidth !== barSize.w || b.offsetHeight !== barSize.h)) setBarSize({ w: b.offsetWidth, h: b.offsetHeight })
  })

  if (asyncErr) return <ErrorPanel text={asyncErr} />

  const focusRect = region ?? (sel.mode === 'idle' ? sel.hover : null)
  const selectedShape = selectedId ? visible.find(s => s.id === selectedId) ?? null : null
  const styleFor: ToolKind | null = tool ?? selectedShape?.kind ?? null
  const sf = session?.scaleFactor ?? 1
  const barPos = regionReady && region && session ? placeToolbar(region, barSize, session.workArea) : null
  const cursor = tool && regionReady ? 'crosshair' : cursorFor(sel, pointer, env)

  return (
    <div style={{ position: 'fixed', inset: 0, cursor, visibility: session ? 'visible' : 'hidden' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
      <canvas ref={bgRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {/* Dim outside the focus rect with four plain rects — a full-screen clip-path
          animated every frame can wedge the macOS compositor. */}
      {focusRect ? (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: Math.max(0, focusRect.y), background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: focusRect.y + focusRect.h, right: 0, bottom: 0, background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: focusRect.y, width: Math.max(0, focusRect.x), height: focusRect.h, background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: focusRect.x + focusRect.w, top: focusRect.y, right: 0, height: focusRect.h, background: DIM, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: focusRect.x, top: focusRect.y, width: focusRect.w, height: focusRect.h, border: `${region ? 1 : 2}px solid ${ACCENT}`, boxSizing: 'border-box', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: focusRect.x, top: focusRect.y > 24 ? focusRect.y - 22 : focusRect.y + 4, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', font: '11px -apple-system, sans-serif', pointerEvents: 'none' }}>
            {Math.round(focusRect.w * sf)} × {Math.round(focusRect.h * sf)}
          </div>
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: DIM, pointerEvents: 'none' }} />
      )}
      {region && (
        <canvas ref={shapesRef} style={{ position: 'absolute', left: region.x, top: region.y, width: region.w, height: region.h, pointerEvents: 'none' }} />
      )}
      {regionReady && region && !locked && HANDLES.map(h => {
        const q = handlePoint(region, h)
        return <div key={h} style={{ position: 'absolute', left: q.x - 4, top: q.y - 4, width: 8, height: 8, background: '#fff', border: `1px solid ${ACCENT}`, boxSizing: 'border-box', pointerEvents: 'none' }} />
      })}
      {selectedShape && (() => {
        const b = shapeBounds(selectedShape)
        return <div style={{ position: 'absolute', left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, border: `1px dashed ${ACCENT}`, pointerEvents: 'none' }} />
      })()}
      {text && (
        <input autoFocus value={text.value}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => setText({ ...text, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={e => {
            // Enter / Esc act on the text box only, never on the whole screenshot.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.stopPropagation(); commitText() }
            if (e.key === 'Escape') { e.stopPropagation(); setText(null) }
          }}
          style={{ position: 'absolute', left: text.at.x, top: text.at.y, minWidth: 40, font: `${style.fontSize}px -apple-system, "PingFang SC", sans-serif`, color: style.color, background: 'rgba(255,255,255,0.15)', border: `1px dashed ${style.color}`, outline: 'none', padding: 0 }} />
      )}
      {barPos && (
        <div style={{ position: 'absolute', left: barPos.x, top: barPos.y }}>
          <Toolbar ref={toolbarRef} tool={tool} onTool={x => { setTool(x); setSelectedId(null) }} style={style} onStyle={updateStyle} styleFor={styleFor}
            canUndo={canUndo(hist)} canRedo={canRedo(hist)}
            onUndo={() => { setHist(undo); setSelectedId(null) }} onRedo={() => { setHist(redo); setSelectedId(null) }}
            canInsert={!!session?.canInsertNote} onAction={a => { void finish(a) }} onCancel={() => bridge.cancel()} busy={busy} />
        </div>
      )}
      {magnifierOn && bgRef.current && <Magnifier bg={bgRef.current} p={pointer!} scale={sf} bounds={bounds} />}
      {notice && (
        <div style={{ position: 'absolute', left: '50%', top: 24, transform: 'translateX(-50%)', padding: '6px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.75)', color: '#fff', font: '12px -apple-system, sans-serif', pointerEvents: 'none' }}>{notice}</div>
      )}
    </div>
  )
}
