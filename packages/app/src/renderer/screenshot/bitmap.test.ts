import { describe, it, expect } from 'vitest'
import { bgraToRgba, hexOf } from './bitmap.js'

describe('bgraToRgba', () => {
  it('swaps B and R and makes every pixel opaque (aligned buffer)', () => {
    const src = new Uint8Array([0, 0, 255, 255, 10, 20, 30, 0])   // red, then B=10 G=20 R=30 A=0
    expect([...bgraToRgba(src)]).toEqual([255, 0, 0, 255, 30, 20, 10, 255])
  })
  it('handles a view that is not 4-byte aligned', () => {
    const backing = new Uint8Array(9)
    backing.set([0, 0, 255, 255, 1, 2, 3, 4], 1)
    expect([...bgraToRgba(backing.subarray(1))]).toEqual([255, 0, 0, 255, 3, 2, 1, 255])
  })
})

describe('hexOf', () => {
  it('formats #RRGGBB', () => {
    expect(hexOf(255, 0, 16)).toBe('#FF0010')
  })
})
