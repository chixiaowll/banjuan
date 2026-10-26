import { describe, it, expect } from 'vitest'
import { layoutMindmap } from './useLayoutEngine.js'

const node = (id: string, parentId: string | null, sortOrder = 0) => ({
  id, type: 'default', position: { x: 0, y: 0 },
  data: { id, mindmapId: 'm', parentId, title: id, content: null, hyperlink: null, imageUrl: null, color: null, notes: null, shape: null, styleOverrides: null, positionX: null, positionY: null, sortOrder, collapsed: false, floating: false, depth: parentId ? 1 : 0 },
}) as any
const nodes = [node('r', null), ...['a', 'b', 'c', 'd'].map((id, i) => node(id, 'r', i))]
const run = (layout: string) => {
  const out = layoutMindmap(nodes, [], { layout, nodeSizes: new Map() })
  const pos = Object.fromEntries(out.nodes.map(n => [n.id, n.position]))
  return { pos, edges: out.edges }
}

describe('mind-map layouts', () => {
  it('logic chart: every branch to the right of the root', () => {
    const { pos, edges } = run('logical')
    for (const id of ['a', 'b', 'c', 'd']) expect(pos[id].x).toBeGreaterThan(pos.r.x)
    expect(edges.every(e => e.sourceHandle === 'source-right' && e.targetHandle === 'target-left')).toBe(true)
  })

  it('mind map: branches split to both sides, edges leave from the matching side', () => {
    const { pos, edges } = run('mindmap')
    const right = ['a', 'b', 'c', 'd'].filter(id => pos[id].x > pos.r.x)
    const left = ['a', 'b', 'c', 'd'].filter(id => pos[id].x < pos.r.x)
    expect(right.length).toBe(2)
    expect(left.length).toBe(2)
    for (const id of left) expect(edges.find(e => e.target === id)).toMatchObject({ sourceHandle: 'source-left', targetHandle: 'target-right' })
  })

  it('organization chart: children in a row below the root', () => {
    const { pos, edges } = run('organization')
    const ys = ['a', 'b', 'c', 'd'].map(id => pos[id].y)
    expect(new Set(ys).size).toBe(1)
    expect(ys[0]).toBeGreaterThan(pos.r.y)
    const xs = ['a', 'b', 'c', 'd'].map(id => pos[id].x)
    expect([...xs].sort((p, q) => p - q)).toEqual(xs)
    expect(edges.every(e => e.sourceHandle === 'source-bottom' && e.targetHandle === 'target-top')).toBe(true)
  })
})
