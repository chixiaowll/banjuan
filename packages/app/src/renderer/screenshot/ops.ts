import { arrowHead, type Point, type Rect } from './geometry.js'

export type AnnotationOp =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'arrow'; tail: Point; head: Point }
  | { kind: 'pen'; points: Point[] }
  | { kind: 'text'; at: Point; text: string; fontPx: number }

export const STROKE = '#ff3b30'
export const STROKE_WIDTH = 3

/** Immutably drop the last op (undo). */
export function popOp(ops: AnnotationOp[]): AnnotationOp[] {
  return ops.length ? ops.slice(0, -1) : ops
}

/**
 * Draw ops onto a 2D context. `scale` multiplies every coordinate (1 for the
 * on-screen preview which already uses CSS px; scaleFactor for the final
 * device-px compose). Stroke width scales too so lines stay visually constant.
 */
export function renderOps(ctx: CanvasRenderingContext2D, ops: AnnotationOp[], scale = 1): void {
  ctx.strokeStyle = STROKE
  ctx.fillStyle = STROKE
  ctx.lineWidth = STROKE_WIDTH * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const op of ops) {
    if (!op) continue   // defensive: never let a stray null op crash the whole render
    if (op.kind === 'rect') {
      ctx.strokeRect(op.rect.x * scale, op.rect.y * scale, op.rect.w * scale, op.rect.h * scale)
    } else if (op.kind === 'arrow') {
      const tail = { x: op.tail.x * scale, y: op.tail.y * scale }
      const head = { x: op.head.x * scale, y: op.head.y * scale }
      ctx.beginPath()
      ctx.moveTo(tail.x, tail.y)
      ctx.lineTo(head.x, head.y)
      const [a, b] = arrowHead(tail, head, 16 * scale)
      ctx.moveTo(head.x, head.y); ctx.lineTo(a.x, a.y)
      ctx.moveTo(head.x, head.y); ctx.lineTo(b.x, b.y)
      ctx.stroke()
    } else if (op.kind === 'pen') {
      ctx.beginPath()
      op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale)))
      ctx.stroke()
    } else if (op.kind === 'text') {
      ctx.font = `${op.fontPx * scale}px -apple-system, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(op.text, op.at.x * scale, op.at.y * scale)
    }
  }
}
