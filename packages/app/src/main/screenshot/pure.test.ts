import { describe, it, expect } from 'vitest'
import { windowsForDisplay, screenshotFileName, zoomBounds } from './pure.js'

describe('windowsForDisplay', () => {
  const display = { x: 1000, y: 0, w: 800, h: 600 }
  it('keeps order, makes rects display-relative and clips them', () => {
    const raw = [
      { x: 1100, y: 50, w: 300, h: 200, owner: 'A' },
      { x: 900, y: 100, w: 400, h: 300, owner: 'B' },      // straddles the left edge
      { x: 0, y: 0, w: 500, h: 500, owner: 'C' },          // other display
      { x: 1500, y: 500, w: 20, h: 20, owner: 'D' },       // too small
    ]
    expect(windowsForDisplay(raw, display)).toEqual([
      { x: 100, y: 50, w: 300, h: 200 },
      { x: 0, y: 100, w: 300, h: 300 },
    ])
  })
})

describe('screenshotFileName', () => {
  it('uses the localized prefix and a sortable timestamp', () => {
    expect(screenshotFileName('截图', new Date(2026, 9, 2, 8, 5, 3))).toBe('截图 2026-10-02 080503.png')
  })
})

describe('zoomBounds', () => {
  it('zooms around the centre and limits the scale to 10%–400%', () => {
    expect(zoomBounds({ x: 100, y: 100, w: 200, h: 100 }, { w: 200, h: 100 }, 1.5)).toEqual({ x: 50, y: 75, w: 300, h: 150 })
    expect(zoomBounds({ x: 0, y: 0, w: 800, h: 400 }, { w: 200, h: 100 }, 10).w).toBe(800)
    expect(zoomBounds({ x: 0, y: 0, w: 20, h: 10 }, { w: 200, h: 100 }, 0.1).w).toBe(20)
  })
})
