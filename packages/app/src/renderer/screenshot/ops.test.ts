import { describe, it, expect } from 'vitest'
import { popOp, type AnnotationOp } from './ops.js'

const rect: AnnotationOp = { kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 } }
const pen: AnnotationOp = { kind: 'pen', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }

describe('popOp', () => {
  it('removes the last op immutably', () => {
    const before = [rect, pen]
    const after = popOp(before)
    expect(after).toEqual([rect])
    expect(before).toHaveLength(2) // original untouched
  })
  it('is a no-op on an empty list', () => {
    expect(popOp([])).toEqual([])
  })
})
