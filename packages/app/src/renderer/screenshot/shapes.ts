import { arrowHead, distToSegment, type Point, type Rect } from './geometry.js'

export type ToolKind = 'rect' | 'ellipse' | 'arrow' | 'pen' | 'highlighter' | 'text' | 'mosaic' | 'number'
export interface ShapeStyle { color: string; width: number; fontSize: number }

interface Base { id: string; style: ShapeStyle }
export type Shape =
  | (Base & { kind: 'rect' | 'ellipse'; rect: Rect })
  | (Base & { kind: 'arrow'; tail: Point; head: Point })
  | (Base & { kind: 'pen' | 'highlighter' | 'mosaic'; points: Point[] })
  | (Base & { kind: 'text'; at: Point; text: string })
  | (Base & { kind: 'number'; at: Point; n: number })

export const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#1d1d1f']
export const WIDTHS = [2, 4, 8]
export const FONT_SIZES = [14, 18, 28]
export const DEFAULT_STYLE: ShapeStyle = { color: COLORS[0], width: WIDTHS[1], fontSize: FONT_SIZES[1] }
export const MOSAIC_CELL = 10
export const HIT_TOLERANCE = 6
const HIGHLIGHTER_ALPHA = 0.35
const LINE_HEIGHT = 1.25
const FONT_FAMILY = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'

/** Stroke width actually drawn for a shape (highlighter and mosaic are broad brushes). */
export function strokeWidth(s: Shape): number {
  if (s.kind === 'highlighter') return s.style.width * 4 + 6
  if (s.kind === 'mosaic') return s.style.width * 4 + 8
  return s.style.width
}

export const numberRadius = (style: ShapeStyle) => 10 + style.width * 1.5

/** Width estimate without a canvas: CJK full width, others 0.6em. */
export function textWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) w += /[⺀-鿿가-힯＀-￯]/.test(ch) ? fontSize : fontSize * 0.6
  return w
}

export const newShapeId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function pointsBounds(points: Point[], pad: number): Rect {
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }
}

export function shapeBounds(s: Shape): Rect {
  const half = strokeWidth(s) / 2
  switch (s.kind) {
    case 'rect': case 'ellipse':
      return { x: s.rect.x - half, y: s.rect.y - half, w: s.rect.w + half * 2, h: s.rect.h + half * 2 }
    case 'arrow': return pointsBounds([s.tail, s.head], half + 8)
    case 'pen': case 'highlighter': case 'mosaic': return pointsBounds(s.points, half)
    case 'text': return { x: s.at.x, y: s.at.y, w: textWidth(s.text, s.style.fontSize), h: s.style.fontSize * LINE_HEIGHT }
    case 'number': {
      const r = numberRadius(s.style)
      return { x: s.at.x - r, y: s.at.y - r, w: r * 2, h: r * 2 }
    }
  }
}

export function hitTest(s: Shape, p: Point, tol = HIT_TOLERANCE): boolean {
  const reach = tol + strokeWidth(s) / 2
  switch (s.kind) {
    case 'rect': {
      const { x, y, w, h } = s.rect
      const c = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
      return c.some((a, i) => distToSegment(p, a, c[(i + 1) % 4]) <= reach)
    }
    case 'ellipse': {
      const rx = s.rect.w / 2, ry = s.rect.h / 2
      if (rx <= 0 || ry <= 0) return false
      const d = Math.hypot((p.x - (s.rect.x + rx)) / rx, (p.y - (s.rect.y + ry)) / ry)
      return Math.abs(d - 1) * Math.min(rx, ry) <= reach
    }
    case 'arrow': return distToSegment(p, s.tail, s.head) <= reach
    case 'pen': case 'highlighter': case 'mosaic':
      if (s.points.length === 1) return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= reach
      return s.points.some((a, i) => i > 0 && distToSegment(p, s.points[i - 1], a) <= reach)
    case 'text': {
      const b = shapeBounds(s)
      return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
    }
    case 'number': return Math.hypot(p.x - s.at.x, p.y - s.at.y) <= numberRadius(s.style)
  }
}

export function translateShape(s: Shape, dx: number, dy: number): Shape {
  const mv = (p: Point) => ({ x: p.x + dx, y: p.y + dy })
  switch (s.kind) {
    case 'rect': case 'ellipse': return { ...s, rect: { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy } }
    case 'arrow': return { ...s, tail: mv(s.tail), head: mv(s.head) }
    case 'pen': case 'highlighter': case 'mosaic': return { ...s, points: s.points.map(mv) }
    case 'text': case 'number': return { ...s, at: mv(s.at) }
  }
}

export function nextNumber(shapes: Shape[]): number {
  return shapes.reduce((m, s) => (s.kind === 'number' ? Math.max(m, s.n) : m), 0) + 1
}

/** Topmost shape under `p` (last drawn wins). */
export function shapeAt(shapes: Shape[], p: Point): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitTest(shapes[i], p)) return shapes[i]
  return null
}

export interface RenderOptions {
  /** Target pixels per CSS px (1 on-screen at dpr 1; devicePixelRatio; the capture scale when composing). */
  scale: number
  /** The captured screen (device px), for mosaic sampling. */
  background?: CanvasImageSource & { width: number; height: number }
  /** Device px per CSS px of `background`. */
  backgroundScale?: number
}

function strokePath(ctx: CanvasRenderingContext2D, points: Point[], k: number, ox = 0, oy = 0): void {
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo((p.x - ox) * k, (p.y - oy) * k) : ctx.lineTo((p.x - ox) * k, (p.y - oy) * k)))
  if (points.length === 1) ctx.lineTo((points[0].x - ox) * k + 0.01, (points[0].y - oy) * k)
  ctx.stroke()
}

type StrokeShape = Extract<Shape, { points: Point[] }>

function drawMosaic(ctx: CanvasRenderingContext2D, s: StrokeShape, k: number, o: RenderOptions): void {
  if (!o.background) return
  const bs = o.backgroundScale ?? 1
  const b = shapeBounds(s)
  const cols = Math.max(1, Math.ceil(b.w / MOSAIC_CELL)), rows = Math.max(1, Math.ceil(b.h / MOSAIC_CELL))
  const small = document.createElement('canvas')
  small.width = cols; small.height = rows
  small.getContext('2d')!.drawImage(o.background, b.x * bs, b.y * bs, cols * MOSAIC_CELL * bs, rows * MOSAIC_CELL * bs, 0, 0, cols, rows)
  const tmp = document.createElement('canvas')
  tmp.width = Math.max(1, Math.ceil(cols * MOSAIC_CELL * k)); tmp.height = Math.max(1, Math.ceil(rows * MOSAIC_CELL * k))
  const t = tmp.getContext('2d')!
  t.imageSmoothingEnabled = false
  t.drawImage(small, 0, 0, tmp.width, tmp.height)
  // Keep the pixelated image only under the brush stroke.
  t.globalCompositeOperation = 'destination-in'
  t.lineWidth = strokeWidth(s) * k; t.lineCap = 'round'; t.lineJoin = 'round'; t.strokeStyle = '#000'
  strokePath(t, s.points, k, b.x, b.y)
  ctx.drawImage(tmp, b.x * k, b.y * k)
}

export function renderShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], o: RenderOptions): void {
  const k = o.scale
  for (const s of shapes) {
    ctx.save()
    ctx.strokeStyle = s.style.color
    ctx.fillStyle = s.style.color
    ctx.lineWidth = strokeWidth(s) * k
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    switch (s.kind) {
      case 'rect':
        ctx.strokeRect(s.rect.x * k, s.rect.y * k, s.rect.w * k, s.rect.h * k)
        break
      case 'ellipse':
        ctx.beginPath()
        ctx.ellipse((s.rect.x + s.rect.w / 2) * k, (s.rect.y + s.rect.h / 2) * k, (s.rect.w / 2) * k, (s.rect.h / 2) * k, 0, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'arrow': {
        const tail = { x: s.tail.x * k, y: s.tail.y * k }, head = { x: s.head.x * k, y: s.head.y * k }
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke()
        const [a, b] = arrowHead(tail, head, (12 + s.style.width * 2) * k)
        ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.closePath(); ctx.fill()
        break
      }
      case 'pen':
        strokePath(ctx, s.points, k)
        break
      case 'highlighter':
        ctx.globalAlpha = HIGHLIGHTER_ALPHA
        ctx.lineCap = 'butt'
        strokePath(ctx, s.points, k)
        break
      case 'mosaic':
        drawMosaic(ctx, s, k, o)
        break
      case 'text':
        ctx.font = `${s.style.fontSize * k}px ${FONT_FAMILY}`
        ctx.textBaseline = 'top'
        ctx.fillText(s.text, s.at.x * k, s.at.y * k)
        break
      case 'number': {
        const r = numberRadius(s.style) * k
        ctx.beginPath(); ctx.arc(s.at.x * k, s.at.y * k, r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.round(r * 1.1)}px ${FONT_FAMILY}`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(s.n), s.at.x * k, s.at.y * k + r * 0.05)
        break
      }
    }
    ctx.restore()
  }
}
