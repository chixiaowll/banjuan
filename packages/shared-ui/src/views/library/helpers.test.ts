import { describe, it, expect } from 'vitest'
import { readingProgress } from './helpers.js'

describe('readingProgress', () => {
  it('reads the fraction the viewers save', () => {
    expect(readingProgress({ metadata: { readingPosition: { page: 3, totalPages: 10, percentage: 0.3 } } })).toBe(30)
    expect(readingProgress({ metadata: { readingPosition: { scrollTop: 0, percentage: 1 } } })).toBe(100)
  })
  it('reads the 0–100 percentages EPUBs used to store', () => {
    expect(readingProgress({ metadata: { readingPosition: { cfi: 'x', percentage: 35 } } })).toBe(35)
  })
  it('falls back to page / total, and to 0', () => {
    expect(readingProgress({ metadata: { readingPosition: { page: 5, totalPages: 20 } } })).toBe(25)
    expect(readingProgress({ metadata: {} })).toBe(0)
    expect(readingProgress({})).toBe(0)
  })
})
