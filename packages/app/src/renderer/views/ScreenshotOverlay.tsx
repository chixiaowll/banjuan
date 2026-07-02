import React, { useEffect, useRef, useState, useCallback } from 'react'
import { normalizeRect, toDevicePx, type Point, type Rect } from '../screenshot/geometry.js'
import { renderOps, popOp, STROKE, type AnnotationOp } from '../screenshot/ops.js'

type Tool = 'rect' | 'arrow' | 'pen' | 'text'
interface Init { image: string; width: number; height: number; scaleFactor: number }

// The preload bridge is exposed as `window.electronAPI` (see electron-api.ts).
const el = (window as any).electronAPI as {
  screenshot: {
    onInit: (cb: (p: Init) => void) => () => void
    confirm: (dataUrl: string) => void
    cancel: () => void
  }
}

export default function ScreenshotOverlay() {
  const [init, setInit] = useState<Init | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [sel, setSel] = useState<Rect | null>(null)         // selected region, CSS px
  const [selecting, setSelecting] = useState(false)
  const dragStart = useRef<Point | null>(null)
  const [tool, setTool] = useState<Tool>('rect')
  const [ops, setOps] = useState<AnnotationOp[]>([])
  const drawing = useRef<AnnotationOp | null>(null)
  const drawAnchor = useRef<Point | null>(null)              // fixed origin for rect drag
  const [, force] = useState(0)                              // repaint tick during a drag
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [textDraft, setTextDraft] = useState<{ at: Point; value: string } | null>(null)

  // Receive the captured image from main.
  useEffect(() => el.screenshot.onInit(setInit), [])

  const confirm = useCallback(() => {
    if (!init || !sel || sel.w < 2 || sel.h < 2) { el.screenshot.cancel(); return }
    const img = imgRef.current!
    // Derive true device-px-per-CSS-px from the ACTUAL captured image size, not
    // init.scaleFactor: desktopCapturer uses one thumbnail size for all displays,
    // so a non-primary display's image may not equal bounds×scaleFactor.
    const scale = img.naturalWidth / init.width
    const dev = toDevicePx(sel, scale)
    const out = document.createElement('canvas')
    out.width = Math.round(dev.w); out.height = Math.round(dev.h)
    const ctx = out.getContext('2d')!
    ctx.drawImage(img, dev.x, dev.y, dev.w, dev.h, 0, 0, dev.w, dev.h)
    ctx.save(); ctx.translate(-sel.x * scale, -sel.y * scale)
    renderOps(ctx, ops, scale)
    ctx.restore()
    el.screenshot.confirm(out.toDataURL('image/png'))
  }, [init, sel, ops])

  // Esc cancels; Enter confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); el.screenshot.cancel() }
      else if (e.key === 'Enter' && sel && !textDraft) { e.preventDefault(); confirm() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, textDraft, confirm])

  // Repaint the annotation canvas whenever ops/selection/live-draw change.
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !sel) return
    c.width = sel.w; c.height = sel.h
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.save(); ctx.translate(-sel.x, -sel.y)             // ops are in overlay coords
    renderOps(ctx, drawing.current ? [...ops, drawing.current] : ops)
    ctx.restore()
  })

  const pt = (e: React.PointerEvent): Point => ({ x: e.clientX, y: e.clientY })

  // --- region selection (before a region exists) ---
  const onDownSelect = (e: React.PointerEvent) => {
    if (sel) return
    dragStart.current = pt(e); setSelecting(true)
  }
  const onMoveSelect = (e: React.PointerEvent) => {
    if (!selecting || !dragStart.current) return
    setSel(normalizeRect(dragStart.current, pt(e)))
  }
  const onUpSelect = () => { setSelecting(false); dragStart.current = null }

  // --- annotation (after a region exists) ---
  const onDownDraw = (e: React.PointerEvent) => {
    if (!sel) return
    e.stopPropagation()
    const p = pt(e)
    if (tool === 'text') { setTextDraft({ at: p, value: '' }); return }
    drawAnchor.current = p
    if (tool === 'rect') drawing.current = { kind: 'rect', rect: { x: p.x, y: p.y, w: 0, h: 0 } }
    else if (tool === 'arrow') drawing.current = { kind: 'arrow', tail: p, head: p }
    else drawing.current = { kind: 'pen', points: [p] }
    force(n => n + 1)
  }
  const onMoveDraw = (e: React.PointerEvent) => {
    const d = drawing.current
    if (!d) return
    const p = pt(e)
    if (d.kind === 'rect') d.rect = normalizeRect(drawAnchor.current!, p)
    else if (d.kind === 'arrow') d.head = p
    else if (d.kind === 'pen') d.points.push(p)
    force(n => n + 1)
  }
  const onUpDraw = () => {
    if (drawing.current) { setOps(o => [...o, drawing.current!]); drawing.current = null }
  }

  const commitText = () => {
    if (textDraft && textDraft.value.trim()) {
      setOps(o => [...o, { kind: 'text', at: textDraft.at, text: textDraft.value, fontPx: 18 }])
    }
    setTextDraft(null)
  }

  if (!init) return null

  const stage = sel && !selecting                            // region locked -> annotate mode
  const toolBtn = (t: Tool, label: string) => (
    <button onClick={() => setTool(t)} style={{
      padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
      border: '1px solid #0003', background: tool === t ? STROKE : '#fff', color: tool === t ? '#fff' : '#222',
    }}>{label}</button>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, cursor: sel ? 'default' : 'crosshair', userSelect: 'none' }}
      onPointerDown={onDownSelect} onPointerMove={onMoveSelect} onPointerUp={onUpSelect}
    >
      <img ref={imgRef} src={init.image} draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
        clipPath: sel ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${sel.y}px, ${sel.x}px ${sel.y}px, ${sel.x}px ${sel.y + sel.h}px, ${sel.x + sel.w}px ${sel.y + sel.h}px, ${sel.x + sel.w}px ${sel.y}px, 0 ${sel.y}px)` : undefined,
        pointerEvents: 'none',
      }} />
      {sel && (
        <>
          <div style={{ position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h, border: `1px solid ${STROKE}`, pointerEvents: 'none' }} />
          <canvas ref={canvasRef}
            style={{ position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h, cursor: 'crosshair' }}
            onPointerDown={onDownDraw} onPointerMove={onMoveDraw} onPointerUp={onUpDraw}
          />
          {textDraft && (
            <input autoFocus value={textDraft.value}
              onChange={e => setTextDraft({ ...textDraft, value: e.target.value })}
              onBlur={commitText} onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setTextDraft(null) }}
              style={{ position: 'absolute', left: textDraft.at.x, top: textDraft.at.y, font: '18px sans-serif', color: STROKE, background: 'transparent', border: `1px dashed ${STROKE}`, outline: 'none' }} />
          )}
          {stage && (
            <div style={{
              position: 'absolute', left: sel.x, top: Math.min(sel.y + sel.h + 8, window.innerHeight - 44),
              display: 'flex', gap: 6, padding: 6, borderRadius: 8, background: '#fff', boxShadow: '0 2px 12px #0004',
            }}>
              {toolBtn('rect', '▭')}{toolBtn('arrow', '↗')}{toolBtn('pen', '✎')}{toolBtn('text', 'T')}
              <button onClick={() => setOps(popOp)} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid #0003', background: '#fff' }}>↶</button>
              <button onClick={() => el.screenshot.cancel()} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid #0003', background: '#fff' }}>✕</button>
              <button onClick={confirm} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: 'none', background: STROKE, color: '#fff' }}>✓</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
