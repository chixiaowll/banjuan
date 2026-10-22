import { normalizeRect, isUsableSelection, pointInRect, type Point, type Rect } from './geometry.js'

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const DRAG_THRESHOLD = 4
const HANDLE_HIT = 7

export type SelState =
  | { mode: 'idle'; hover: Rect | null }
  | { mode: 'dragging'; origin: Point; rect: Rect; candidate: Rect | null }
  | { mode: 'selected'; rect: Rect }
  | { mode: 'resizing'; rect: Rect; handle: Handle; start: Point; startRect: Rect }
  | { mode: 'moving'; rect: Rect; start: Point; startRect: Rect }

/** bounds: the display (overlay) rect; windows: click-to-select targets, frontmost first; locked: annotations exist. */
export interface Env { bounds: Rect; windows: Rect[]; locked: boolean }

export const idleState = (): SelState => ({ mode: 'idle', hover: null })

export function currentRect(s: SelState): Rect | null {
  return s.mode === 'idle' ? null : s.rect
}

export function windowAt(p: Point, windows: Rect[]): Rect | null {
  return windows.find(w => pointInRect(p, w)) ?? null
}

export function handlePoint(r: Rect, h: Handle): Point {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2
  return { x, y }
}

export function handleAt(p: Point, r: Rect): Handle | null {
  return HANDLES.find(h => { const q = handlePoint(r, h); return Math.abs(p.x - q.x) <= HANDLE_HIT && Math.abs(p.y - q.y) <= HANDLE_HIT }) ?? null
}

function clampRect(r: Rect, b: Rect): Rect {
  const x = Math.max(b.x, r.x), y = Math.max(b.y, r.y)
  return { x, y, w: Math.max(0, Math.min(b.x + b.w, r.x + r.w) - x), h: Math.max(0, Math.min(b.y + b.h, r.y + r.h) - y) }
}

function resizeRect(r: Rect, h: Handle, dx: number, dy: number): Rect {
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h
  if (h.includes('w')) x0 += dx
  if (h.includes('e')) x1 += dx
  if (h.includes('n')) y0 += dy
  if (h.includes('s')) y1 += dy
  return normalizeRect({ x: x0, y: y0 }, { x: x1, y: y1 })
}

function moveInside(r: Rect, dx: number, dy: number, b: Rect): Rect {
  return {
    ...r,
    x: Math.min(b.x + b.w - r.w, Math.max(b.x, r.x + dx)),
    y: Math.min(b.y + b.h - r.h, Math.max(b.y, r.y + dy)),
  }
}

export function pointerDown(s: SelState, p: Point, env: Env): SelState {
  if (s.mode === 'selected') {
    if (env.locked) return s
    const h = handleAt(p, s.rect)
    if (h) return { mode: 'resizing', rect: s.rect, handle: h, start: p, startRect: s.rect }
    if (pointInRect(p, s.rect)) return { mode: 'moving', rect: s.rect, start: p, startRect: s.rect }
  }
  if (s.mode === 'idle' || s.mode === 'selected') {
    return { mode: 'dragging', origin: p, rect: { x: p.x, y: p.y, w: 0, h: 0 }, candidate: windowAt(p, env.windows) }
  }
  return s
}

export function pointerMove(s: SelState, p: Point, env: Env): SelState {
  switch (s.mode) {
    case 'idle': {
      const hover = windowAt(p, env.windows)
      return hover === s.hover ? s : { mode: 'idle', hover }
    }
    case 'dragging': return { ...s, rect: clampRect(normalizeRect(s.origin, p), env.bounds) }
    case 'resizing': return { ...s, rect: clampRect(resizeRect(s.startRect, s.handle, p.x - s.start.x, p.y - s.start.y), env.bounds) }
    case 'moving': return { ...s, rect: moveInside(s.startRect, p.x - s.start.x, p.y - s.start.y, env.bounds) }
    default: return s
  }
}

export function pointerUp(s: SelState, p: Point, env: Env): SelState {
  switch (s.mode) {
    case 'dragging': {
      const moved = Math.hypot(p.x - s.origin.x, p.y - s.origin.y) >= DRAG_THRESHOLD
      if (!moved && s.candidate) return { mode: 'selected', rect: clampRect(s.candidate, env.bounds) }
      if (isUsableSelection(s.rect)) return { mode: 'selected', rect: s.rect }
      return { mode: 'idle', hover: windowAt(p, env.windows) }
    }
    case 'resizing': case 'moving':
      return isUsableSelection(s.rect) ? { mode: 'selected', rect: s.rect } : { mode: 'selected', rect: s.startRect }
    default: return s
  }
}

export function nudge(s: SelState, dx: number, dy: number, env: Env): SelState {
  if (s.mode !== 'selected' || env.locked) return s
  return { mode: 'selected', rect: moveInside(s.rect, dx, dy, env.bounds) }
}

/** Esc: drop an un-annotated selection; otherwise null = leave the screenshot. */
export function escape(s: SelState, locked: boolean): SelState | null {
  return s.mode === 'selected' && !locked ? idleState() : null
}

/** Right click: drop the selection; with nothing selected, null = leave. */
export function rightClick(s: SelState): SelState | null {
  return s.mode === 'idle' ? null : idleState()
}

export function cursorFor(s: SelState, p: Point | null, env: Env): string {
  if (s.mode === 'moving') return 'move'
  if (s.mode === 'dragging') return 'crosshair'
  if (s.mode === 'resizing') return `${s.handle}-resize`
  if (s.mode === 'selected' && p && !env.locked) {
    const h = handleAt(p, s.rect)
    if (h) return `${h}-resize`
    if (pointInRect(p, s.rect)) return 'move'
  }
  return 'crosshair'
}
