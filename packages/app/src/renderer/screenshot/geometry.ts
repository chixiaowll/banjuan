export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Build a positive-width/height rect from any two drag corners. */
export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
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
