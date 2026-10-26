import { describe, it, expect, vi } from 'vitest'
import { createHandwritingStore } from './useHandwritingStore.js'

const stroke = (x: number) => ({ id: `s${x}`, tool: 'pen', color: '#000', width: 2, points: [{ x, y: x, pressure: 0.5 }] }) as any

describe('handwriting store', () => {
  it('a snapshot captured before turning the page lands on the page it came from', async () => {
    const update = vi.fn(async () => {})
    const pages = [{ id: 'p1', template: 'blank', snapshot: { strokes: [] } }, { id: 'p2', template: 'blank', snapshot: { strokes: [] } }]
    const api = { notes: { get: async () => ({ content: JSON.stringify({ pages, currentPageIndex: 0 }), typeMeta: {} }), update } } as any
    const store = createHandwritingStore(api)
    await store.getState().init('n1')
    store.getState().setCurrentPage(1)                       // user turned to page 2 …
    store.getState().savePageSnapshot('p1', { strokes: [stroke(1)] })   // … then page 1's pending strokes arrive
    expect(store.getState().pages[0].snapshot.strokes).toHaveLength(1)
    expect(store.getState().pages[1].snapshot.strokes).toHaveLength(0)
    await store.getState().flushPendingSave()
    expect(JSON.parse((update.mock.calls[0] as any[])[1].content).pages[0].snapshot.strokes).toHaveLength(1)
  })

  it('ignores a snapshot for a page deleted meanwhile', async () => {
    const pages = [{ id: 'p1', template: 'blank', snapshot: { strokes: [] } }]
    const api = { notes: { get: async () => ({ content: JSON.stringify({ pages }), typeMeta: {} }), update: async () => {} } } as any
    const store = createHandwritingStore(api)
    await store.getState().init('n1')
    store.getState().savePageSnapshot('gone', { strokes: [stroke(1)] })
    expect(store.getState().pages.map(p => p.snapshot.strokes.length)).toEqual([0])
  })
})
