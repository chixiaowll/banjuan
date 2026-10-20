export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Build a positive-width/height rect from any two drag corners. */
export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

/** Smallest selection (CSS px, each axis) treated as intentional rather than click jitter. */
export const MIN_SELECTION = 4

/** True when `r` is big enough to annotate / copy. */
export function isUsableSelection(r: Rect | null): r is Rect {
  return !!r && r.w >= MIN_SELECTION && r.h >= MIN_SELECTION
}

/** Scale a rect from CSS px to device px (multiply by scaleFactor). */
export function toDevicePx(r: Rect, scale: number): Rect {
  return { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }
}

/**
 * Two barb points for an arrowhead at `head`, given the line from `tail`.
 * `size` is the barb length in the same units as the points.
 */
export function arrowHead(tail: Point, head: Point, size: number): [Point, Point] {
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x)
  const spread = Math.PI / 7
  return [
    { x: head.x - size * Math.cos(angle - spread), y: head.y - size * Math.sin(angle - spread) },
    { x: head.x - size * Math.cos(angle + spread), y: head.y - size * Math.sin(angle + spread) },
  ]
}

/**
 * Where to put the toolbar (top-left, overlay CSS px): below the selection and
 * right-aligned with it; above when there's no room below; pinned to the bottom
 * of the work area when neither fits (e.g. a full-screen selection). `area` is
 * the display's work area, so the bar never sits under the menu bar or Dock.
 */
export function placeToolbar(sel: Rect, bar: { w: number; h: number }, area: Rect, gap = 8): Point {
  const minX = area.x + gap
  const maxX = area.x + area.w - bar.w - gap
  const x = Math.max(minX, Math.min(sel.x + sel.w - bar.w, maxX))
  const below = sel.y + sel.h + gap
  const above = sel.y - gap - bar.h
  const bottom = area.y + area.h - gap
  const y = below + bar.h <= bottom ? below
    : above >= area.y + gap ? above
    : bottom - bar.h
  return { x, y }
}
