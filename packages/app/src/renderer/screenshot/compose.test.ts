import { describe, it, expect } from 'vitest'
import { deviceCrop } from './compose.js'

describe('deviceCrop', () => {
  it('scales to device px, rounds, and stays inside the bitmap', () => {
    expect(deviceCrop({ x: 10.2, y: 20.6, w: 100, h: 50 }, 2, { w: 2000, h: 1000 })).toEqual({ x: 20, y: 41, w: 200, h: 100 })
    expect(deviceCrop({ x: 990, y: 490, w: 100, h: 100 }, 2, { w: 2000, h: 1000 })).toEqual({ x: 1980, y: 980, w: 20, h: 20 })
  })
})
