import getStroke from 'perfect-freehand'
import type { Stroke } from '@banjuan/core'

function getSvgPathFromStroke(strokePoints: number[][]): string {
  if (strokePoints.length === 0) return ''
  if (strokePoints.length === 1) {
    const [x, y] = strokePoints[0]
    return `M ${x} ${y} L ${x + 0.01} ${y + 0.01}`
  }
  let d = `M ${strokePoints[0][0]} ${strokePoints[0][1]}`
  for (let i = 1; i < strokePoints.length - 1; i++) {
    const [x0, y0] = strokePoints[i]
    const [x1, y1] = strokePoints[i + 1]
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`
  }
  const last = strokePoints[strokePoints.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

export function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, complete = true) {
  const outlinePoints = getStroke(
    stroke.points.map(p => [p.x, p.y, p.pressure ?? 0.5]),
    {
      size: stroke.width,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      // Never simulate pressure from velocity: it spikes as the stroke slows to
      // a stop, leaving a fat blob at every stroke end.
      simulatePressure: false,
      // A finished stroke must be marked complete so perfect-freehand finalizes
      // the end; otherwise it caps the last point with a round "still-drawing"
      // dot — the blob at every stroke end. Taper the end to a clean point.
      last: complete,
      start: { cap: true, taper: 0 },
      end: { cap: !complete, taper: complete ? stroke.width * 2 : 0 },
    }
  )
  if (outlinePoints.length === 0) return

  const path = new Path2D(getSvgPathFromStroke(outlinePoints))
  ctx.save()
  ctx.globalAlpha = stroke.opacity
  ctx.fillStyle = stroke.color
  ctx.fill(path)
  ctx.restore()
}

export function renderAllStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  for (const stroke of strokes) {
    renderStroke(ctx, stroke)
  }
}

export function generateThumbnailDataUrl(
  strokes: Stroke[],
  pageWidth: number,
  pageHeight: number,
): string | null {
  try {
    const srcCanvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    srcCanvas.width = pageWidth * dpr
    srcCanvas.height = pageHeight * dpr
    const srcCtx = srcCanvas.getContext('2d')
    if (!srcCtx) return null
    srcCtx.scale(dpr, dpr)
    renderAllStrokes(srcCtx, strokes, pageWidth, pageHeight)

    const thumbW = 400
    const thumbH = 300
    const thumbCanvas = document.createElement('canvas')
    thumbCanvas.width = thumbW
    thumbCanvas.height = thumbH
    const tCtx = thumbCanvas.getContext('2d')
    if (!tCtx) return null
    tCtx.imageSmoothingEnabled = true
    tCtx.imageSmoothingQuality = 'high'
    tCtx.fillStyle = '#ffffff'
    tCtx.fillRect(0, 0, thumbW, thumbH)
    tCtx.drawImage(srcCanvas, 0, 0, thumbW, thumbH)
    return thumbCanvas.toDataURL('image/png')
  } catch {
    return null
  }
}
