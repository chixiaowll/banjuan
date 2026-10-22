import { describe, it, expect } from 'vitest'
import { normalizeRect, arrowHead, toDevicePx, isUsableSelection, placeToolbar, distToSegment, clampPoint, pointInRect, type Rect } from './geometry.js'

describe('normalizeRect', () => {
  it('orders corners so width/height are positive when dragged up-left', () => {
    const r = normalizeRect({ x: 100, y: 100 }, { x: 40, y: 30 })
    expect(r).toEqual({ x: 40, y: 30, w: 60, h: 70 })
  })
  it('handles a normal down-right drag', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 60, y: 80 })).toEqual({ x: 10, y: 20, w: 50, h: 60 })
  })
})

describe('toDevicePx', () => {
  it('scales a rect by the device pixel ratio', () => {
    const r: Rect = { x: 10, y: 20, w: 30, h: 40 }
    expect(toDevicePx(r, 2)).toEqual({ x: 20, y: 40, w: 60, h: 80 })
  })
})

describe('arrowHead', () => {
  it('returns two barb points behind the head for a rightward arrow', () => {
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
    expect(a.x).toBeLessThan(100)
    expect(b.x).toBeLessThan(100)
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y))
    expect(Math.abs(a.y)).toBeGreaterThan(0)
  })
})

describe('isUsableSelection', () => {
  it('rejects a missing selection and accidental jitter-sized drags', () => {
    expect(isUsableSelection(null)).toBe(false)
    expect(isUsableSelection({ x: 100, y: 100, w: 1, h: 1 })).toBe(false)
    expect(isUsableSelection({ x: 100, y: 100, w: 300, h: 3 })).toBe(false)
  })
  it('accepts a selection at least the minimum size on both axes', () => {
    expect(isUsableSelection({ x: 0, y: 0, w: 4, h: 4 })).toBe(true)
    expect(isUsableSelection({ x: 0, y: 0, w: 300, h: 200 })).toBe(true)
  })
})

describe('placeToolbar', () => {
  // 1512x982 display; work area excludes a 38px menu bar and a 60px Dock.
  const area: Rect = { x: 0, y: 38, w: 1512, h: 884 }
  const bar = { w: 240, h: 40 }

  it('sits below the selection, right-aligned with it', () => {
    expect(placeToolbar({ x: 300, y: 200, w: 400, h: 200 }, bar, area)).toEqual({ x: 460, y: 408 })
  })
  it('stays inside the right edge when the selection hugs it', () => {
    expect(placeToolbar({ x: 1470, y: 200, w: 42, h: 100 }, bar, area).x).toBe(1512 - 240 - 8)
  })
  it('stays inside the left edge for a narrow selection near it', () => {
    expect(placeToolbar({ x: 10, y: 200, w: 40, h: 100 }, bar, area).x).toBe(8)
  })
  it('flips above the selection when the Dock leaves no room below', () => {
    expect(placeToolbar({ x: 300, y: 600, w: 400, h: 300 }, bar, area).y).toBe(600 - 8 - 40)
  })
  it('pins to the bottom of the work area when neither side fits', () => {
    expect(placeToolbar({ x: 0, y: 0, w: 1512, h: 982 }, bar, area).y).toBe(38 + 884 - 40 - 8)
  })
})


describe('distToSegment', () => {
  it('is the perpendicular distance inside the segment and the end distance outside it', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
    expect(distToSegment({ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0)
  })
})

describe('clampPoint / pointInRect', () => {
  const r = { x: 10, y: 10, w: 100, h: 50 }
  it('clamps into the rect', () => {
    expect(clampPoint({ x: 0, y: 200 }, r)).toEqual({ x: 10, y: 60 })
    expect(clampPoint({ x: 50, y: 30 }, r)).toEqual({ x: 50, y: 30 })
  })
  it('includes edges', () => {
    expect(pointInRect({ x: 10, y: 60 }, r)).toBe(true)
    expect(pointInRect({ x: 9, y: 30 }, r)).toBe(false)
  })
})
