import { describe, it, expect } from 'vitest'
import { parsePageRange } from './page-range.js'

describe('parsePageRange', () => {
  it('reads one page or an inclusive range', () => {
    expect(parsePageRange('3')).toEqual({ from: 3, to: 3 })
    expect(parsePageRange('3-5')).toEqual({ from: 3, to: 5 })
    expect(parsePageRange(' 12 - 20 ')).toEqual({ from: 12, to: 20 })
  })

  it('refuses anything else', () => {
    for (const bad of ['', '0', '5-3', 'a', '3-', '-3', '1,2', '2.5']) expect(parsePageRange(bad)).toBeNull()
  })
})
