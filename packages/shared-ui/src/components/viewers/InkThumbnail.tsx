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
    const aspect = bw / bh
    let w = maxWidth
    let h = w / aspect
    if (h > maxHeight) { h = maxHeight; w = h * aspect }
    w = Math.max(w, 20)
    h = Math.max(h, 20)

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const pad = 4
    const scaleX = (w - pad * 2) / bw
    const scaleY = (h - pad * 2) / bh
    const scale = Math.min(scaleX, scaleY)

    const absStrokes: Stroke[] = strokes.map(s => ({
      id: `thumb-${++thumbIdCounter}`,
      points: s.points.map(p => ({
        x: (p.x - bounds.x) * scale + pad,
        y: (p.y - bounds.y) * scale + pad,
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
