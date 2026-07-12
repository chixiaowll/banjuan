import { describe, it, expect } from 'vitest'
import { normalizeRect, arrowHead, toDevicePx, type Rect } from './geometry.js'

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
