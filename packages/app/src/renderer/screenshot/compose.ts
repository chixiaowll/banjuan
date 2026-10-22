import { renderShapes, type Shape } from './shapes.js'
import type { Rect } from './geometry.js'

/** Selection (CSS px) → integer device-px crop inside the captured bitmap. */
export function deviceCrop(r: Rect, scale: number, bitmap: { w: number; h: number }): Rect {
  const x = Math.min(bitmap.w - 1, Math.max(0, Math.round(r.x * scale)))
  const y = Math.min(bitmap.h - 1, Math.max(0, Math.round(r.y * scale)))
  const w = Math.max(1, Math.min(bitmap.w - x, Math.round(r.w * scale)))
  const h = Math.max(1, Math.min(bitmap.h - y, Math.round(r.h * scale)))
  return { x, y, w, h }
}

/** The final image: the selection cut from the capture at full resolution, with annotations drawn on it. */
export function composeRegion(bg: HTMLCanvasElement, r: Rect, shapes: Shape[], scale: number): HTMLCanvasElement {
  const crop = deviceCrop(r, scale, { w: bg.width, h: bg.height })
  const out = document.createElement('canvas')
  out.width = crop.w
  out.height = crop.h
  const ctx = out.getContext('2d')!
  ctx.drawImage(bg, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
  ctx.save()
  ctx.translate(-crop.x, -crop.y)
  renderShapes(ctx, shapes, { scale, background: bg, backgroundScale: scale })
  ctx.restore()
  return out
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob(b => (b ? b.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject) : reject(new Error('toBlob failed'))), 'image/png')
  })
}
