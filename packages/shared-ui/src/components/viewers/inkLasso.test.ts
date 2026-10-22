import { describe, it, expect } from 'vitest'
import {
  inkEntries, flattenStrokes, pointInPolygon, boundsOf, strokeBounds, selectInLasso,
  selectionBounds, inRect, applyToSelection, type InkEntry,
} from './inkLasso.js'

const stroke = (...pts: Array<[number, number]>) => ({ points: pts.map(([x, y]) => ({ x, y })), color: '#000', width: 2 })
const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]

describe('inkLasso geometry', () => {
  it('pointInPolygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })

  it('bounds', () => {
    expect(boundsOf([{ x: 1, y: 2 }, { x: 4, y: -1 }])).toEqual({ x: 1, y: -1, w: 3, h: 3 })
    expect(boundsOf([])).toBeNull()
    expect(strokeBounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('selects strokes with any point inside the lasso', () => {
    const work = [[{ x: 5, y: 5 }, { x: 20, y: 20 }], [{ x: 20, y: 20 }], [{ x: 1, y: 9 }]]
    expect([...selectInLasso(work, square)]).toEqual([0, 2])
    expect(selectInLasso(work, square.slice(0, 2)).size).toBe(0)   // not a polygon yet
    expect(selectionBounds(work, new Set([0, 2]))).toEqual({ x: 1, y: 5, w: 19, h: 15 })
    expect(selectionBounds(work, new Set())).toBeNull()
  })

  it('inRect honours the margin', () => {
    const r = { x: 10, y: 10, w: 10, h: 10 }
    expect(inRect({ x: 5, y: 15 }, r, 6)).toBe(true)
    expect(inRect({ x: 5, y: 15 }, r, 4)).toBe(false)
  })
})

describe('inkEntries / applyToSelection', () => {
  const annotations = [
    { id: 'a', type: 'ink', page: 1, position: { type: 'ink', page: 1, strokes: [stroke([0, 0]), stroke([1, 1])], bounds: {} } },
    { id: 'h', type: 'highlight', page: 1, position: { type: 'pdf' } },
    { id: 'b', type: 'ink', page: 2, position: { type: 'ink', page: 2, strokes: [stroke([2, 2])], bounds: {} } },
    { id: 'c', type: 'ink', page: 1, position: { type: 'ink', page: 1, strokes: [stroke([3, 3])], bounds: {} } },
  ]

  it('collects ink annotations, optionally filtered', () => {
    expect(inkEntries(annotations).map(e => e.annotationId)).toEqual(['a', 'b', 'c'])
    const page1 = inkEntries(annotations, a => a.page === 1)
    expect(page1.map(e => e.annotationId)).toEqual(['a', 'c'])
    expect(flattenStrokes(page1)).toHaveLength(3)
  })

  it('moves the selected strokes, per annotation, leaving the rest alone', () => {
    const entries: InkEntry[] = inkEntries(annotations, a => a.page === 1)   // strokes: a0, a1, c0
    const out = applyToSelection(entries, new Set([1, 2]), { move: { x: 10, y: 0 } })
    expect(out.map(o => o.entry.annotationId)).toEqual(['a', 'c'])
    expect(out[0].strokes[0]).toBe(entries[0].strokes[0])
    expect(out[0].strokes[1].points).toEqual([{ x: 11, y: 1 }])
    expect(out[1].strokes[0].points).toEqual([{ x: 13, y: 3 }])
  })

  it('deletes the selected strokes; an annotation left empty comes back empty', () => {
    const entries = inkEntries(annotations, a => a.page === 1)
    const out = applyToSelection(entries, new Set([0, 2]), { remove: true })
    expect(out.map(o => [o.entry.annotationId, o.strokes.length])).toEqual([['a', 1], ['c', 0]])
  })
})
