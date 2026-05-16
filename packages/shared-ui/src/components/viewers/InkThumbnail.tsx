import React, { useRef, useEffect } from 'react'
import { renderAllStrokes } from '../handwriting/renderStrokes.js'
import type { Stroke } from '@banjuan/core'

interface InkStroke {
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

interface Props {
  strokes: InkStroke[]
  bounds: { x: number; y: number; w: number; h: number }
  maxWidth?: number
  maxHeight?: number
}

let thumbIdCounter = 0

export default function InkThumbnail({ strokes, bounds, maxWidth = 200, maxHeight = 100 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || strokes.length === 0) return

    const bw = bounds.w || 1
    const bh = bounds.h || 1
    const pad = 4
    const innerW = maxWidth - pad * 2
    const innerH = maxHeight - pad * 2

    const mixedCoords = bh > 2
    let sX: number, sY: number, w: number, h: number

    if (mixedCoords) {
      sX = innerW / bw
      sY = innerH / bh
      w = maxWidth
      h = maxHeight
    } else {
      const aspect = bw / bh
      w = maxWidth
      h = w / aspect
      if (h > maxHeight) { h = maxHeight; w = h * aspect }
      w = Math.max(w, 20)
      h = Math.max(h, 20)
      const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh)
      sX = scale
      sY = scale
    }

    const drawW = bw * sX
    const drawH = bh * sY
    const offsetX = pad + ((w - pad * 2) - drawW) / 2
    const offsetY = pad + ((h - pad * 2) - drawH) / 2

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const absStrokes: Stroke[] = strokes.map(s => ({
      id: `thumb-${++thumbIdCounter}`,
      points: s.points.map(p => ({
        x: (p.x - bounds.x) * sX + offsetX,
        y: (p.y - bounds.y) * sY + offsetY,
      })),
      color: s.color,
      width: Math.max(1, Math.min(s.width, 4)),
      opacity: 1,
    }))

    renderAllStrokes(ctx, absStrokes, w, h)
  }, [strokes, bounds, maxWidth, maxHeight])

  if (strokes.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        borderRadius: 3,
        border: '1px solid var(--border)',
        background: '#fff',
      }}
    />
  )
}
