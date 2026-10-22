import { describe, it, expect } from 'vitest'
import { mapLimit } from '../src/storage/map-limit.js'

describe('mapLimit', () => {
  it('keeps input order and never exceeds the concurrency limit', async () => {
    let inFlight = 0, peak = 0
    const out = await mapLimit([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, n * 3))
      inFlight--
      return n * 10
    })
    expect(out).toEqual([50, 10, 40, 20, 30, 0, 60])
    expect(peak).toBeLessThanOrEqual(3)
  })
  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([])
  })
})
