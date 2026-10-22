import { describe, it, expect } from 'vitest'
import { shapeBounds, hitTest, translateShape, nextNumber, textWidth, DEFAULT_STYLE, type Shape } from './shapes.js'

const style = { ...DEFAULT_STYLE, width: 4 }
const rect: Shape = { id: 'r', kind: 'rect', style, rect: { x: 10, y: 10, w: 100, h: 50 } }
const ellipse: Shape = { id: 'e', kind: 'ellipse', style, rect: { x: 0, y: 0, w: 100, h: 50 } }
const arrow: Shape = { id: 'a', kind: 'arrow', style, tail: { x: 0, y: 0 }, head: { x: 100, y: 0 } }
const pen: Shape = { id: 'p', kind: 'pen', style, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] }
const text: Shape = { id: 't', kind: 'text', style: { ...style, fontSize: 20 }, at: { x: 10, y: 10 }, text: 'ab中' }
const num: Shape = { id: 'n', kind: 'number', style, at: { x: 100, y: 100 }, n: 3 }

describe('hitTest', () => {
  it('rect: the border, not the hollow inside', () => {
    expect(hitTest(rect, { x: 10, y: 30 })).toBe(true)
    expect(hitTest(rect, { x: 60, y: 35 })).toBe(false)
  })
  it('ellipse: near the outline', () => {
    expect(hitTest(ellipse, { x: 100, y: 25 })).toBe(true)
    expect(hitTest(ellipse, { x: 50, y: 25 })).toBe(false)
  })
  it('arrow and pen: near any segment', () => {
    expect(hitTest(arrow, { x: 50, y: 3 })).toBe(true)
    expect(hitTest(arrow, { x: 50, y: 30 })).toBe(false)
    expect(hitTest(pen, { x: 52, y: 25 })).toBe(true)
    expect(hitTest(pen, { x: 25, y: 25 })).toBe(false)
  })
  it('text: inside its box; number: inside its circle', () => {
    expect(hitTest(text, { x: 15, y: 15 })).toBe(true)
    expect(hitTest(text, { x: 200, y: 15 })).toBe(false)
    expect(hitTest(num, { x: 105, y: 100 })).toBe(true)
    expect(hitTest(num, { x: 140, y: 100 })).toBe(false)
  })
})

describe('shapeBounds / translateShape / nextNumber', () => {
  it('bounds include the stroke', () => {
    expect(shapeBounds(rect)).toEqual({ x: 8, y: 8, w: 104, h: 54 })
    expect(shapeBounds(text)).toEqual({ x: 10, y: 10, w: textWidth('ab中', 20), h: 20 * 1.25 })
  })
  it('translate moves every coordinate', () => {
    expect(translateShape(arrow, 5, -5)).toMatchObject({ tail: { x: 5, y: -5 }, head: { x: 105, y: -5 } })
    expect(translateShape(pen, 1, 1)).toMatchObject({ points: [{ x: 1, y: 1 }, { x: 51, y: 1 }, { x: 51, y: 51 }] })
  })
  it('numbers continue from the highest', () => {
    expect(nextNumber([])).toBe(1)
    expect(nextNumber([rect, num])).toBe(4)
  })
  it('CJK characters are full width, others ~0.6em', () => {
    expect(textWidth('ab中', 20)).toBe(20 * 0.6 * 2 + 20)
  })
})
