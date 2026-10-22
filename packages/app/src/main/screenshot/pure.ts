export interface Rect { x: number; y: number; w: number; h: number }
export interface RawWindow { x: number; y: number; w: number; h: number; owner: string }

/** Smallest window offered as a click-to-select target (CSS px, after clipping). */
export const MIN_WINDOW = 40

/**
 * Global window rects (points, frontmost first) → rects relative to one
 * display's overlay, clipped to it. Off-display and tiny ones are dropped;
 * order is kept so the first match under the cursor is the frontmost window.
 */
export function windowsForDisplay(raw: RawWindow[], display: Rect): Rect[] {
  const out: Rect[] = []
  for (const w of raw) {
    const x0 = Math.max(w.x, display.x), y0 = Math.max(w.y, display.y)
    const x1 = Math.min(w.x + w.w, display.x + display.w), y1 = Math.min(w.y + w.h, display.y + display.h)
    if (x1 - x0 < MIN_WINDOW || y1 - y0 < MIN_WINDOW) continue
    out.push({ x: x0 - display.x, y: y0 - display.y, w: x1 - x0, h: y1 - y0 })
  }
  return out
}

/** "截图 2026-10-22 153012.png" — `prefix` is the UI-language word for "screenshot". */
export function screenshotFileName(prefix: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`
}

/** Pin-window bounds after zooming by `factor` around the centre; scale kept within 10%–400% of `natural`. */
export function zoomBounds(b: Rect, natural: { w: number; h: number }, factor: number): Rect {
  const next = Math.min(4, Math.max(0.1, (b.w / natural.w) * factor))
  const w = Math.round(natural.w * next), h = Math.round(natural.h * next)
  return { x: Math.round(b.x + (b.w - w) / 2), y: Math.round(b.y + (b.h - h) / 2), w, h }
}
