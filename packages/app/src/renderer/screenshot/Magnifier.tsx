import React, { useEffect, useRef } from 'react'
import { useT } from '@banjuan/shared-ui/src/i18n/index.js'
import { hexOf } from './bitmap.js'
import type { Point } from './geometry.js'

const ZOOM = 8
const CELLS = 15                    // odd: the centre cell is the pixel under the cursor
const SIZE = CELLS * ZOOM           // 120 css px
const OFFSET = 20

/** Colour of the device pixel under a CSS point of the capture canvas. */
export function colorAt(bg: HTMLCanvasElement, p: Point, scale: number): string {
  const ctx = bg.getContext('2d', { willReadFrequently: true })!
  const [r, g, b] = ctx.getImageData(Math.floor(p.x * scale), Math.floor(p.y * scale), 1, 1).data
  return hexOf(r, g, b)
}

/** 8× loupe next to the cursor with pixel coordinates and colour (C copies it). */
export function Magnifier({ bg, p, scale, bounds }: { bg: HTMLCanvasElement; p: Point; scale: number; bounds: { w: number; h: number } }) {
  const t = useT()
  const ref = useRef<HTMLCanvasElement>(null)
  const dpr = window.devicePixelRatio || 1
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    const half = Math.floor(CELLS / 2)
    ctx.drawImage(bg, Math.floor(p.x * scale) - half, Math.floor(p.y * scale) - half, CELLS, CELLS, 0, 0, c.width, c.height)
    const cell = c.width / CELLS
    ctx.strokeStyle = 'rgba(0, 170, 255, 0.9)'
    ctx.lineWidth = dpr
    ctx.strokeRect(half * cell, half * cell, cell, cell)
  })
  const box = SIZE + 2
  const left = p.x + OFFSET + box > bounds.w ? p.x - OFFSET - box : p.x + OFFSET
  const top = p.y + OFFSET + box + 40 > bounds.h ? p.y - OFFSET - box - 40 : p.y + OFFSET
  return (
    <div style={{ position: 'absolute', left, top, pointerEvents: 'none', background: 'rgba(0,0,0,0.75)', borderRadius: 6, padding: 1, color: '#fff', font: '11px -apple-system, sans-serif' }}>
      <canvas ref={ref} width={SIZE * dpr} height={SIZE * dpr} style={{ width: SIZE, height: SIZE, display: 'block', borderRadius: 5 }} />
      <div style={{ padding: '4px 6px', lineHeight: 1.5 }}>
        <div>{Math.floor(p.x * scale)}, {Math.floor(p.y * scale)}</div>
        <div>{colorAt(bg, p, scale)} · {t('screenshot.magnifierHint')}</div>
      </div>
    </div>
  )
}
