import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, testDeps } from './helpers.js'

describe('mindmaps.restore (undo/redo)', () => {
  it('brings back a deleted subtree and undoes a rename, in the database and the file', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    const mm = await lib.notes.create({ title: 'Map', type: 'mindmap' })
    const r = (await lib.mindmaps.getNodes(mm.id)).find(n => !n.parentId)!
    const a = await lib.mindmaps.addNode(mm.id, { title: 'A', parentId: r.id })
    const a1 = await lib.mindmaps.addNode(mm.id, { title: 'A1', parentId: a.id })
    const b = await lib.mindmaps.addNode(mm.id, { title: 'B', parentId: r.id })
    const edge = await lib.mindmaps.addEdge(mm.id, { sourceId: a1.id, targetId: b.id, label: 'rel' })
    const { summary } = await lib.mindmaps.addSummary(mm.id, { nodeIds: [a.id, b.id] })
    const before = {
      nodes: (await lib.mindmaps.getNodes(mm.id)).map(({ mindmapId: _m, createdAt: _c, ...n }) => n),
      edges: (await lib.mindmaps.getEdges(mm.id)).map(({ mindmapId: _m, ...e }) => e),
    }

    await lib.mindmaps.updateNode(b.id, { title: 'B renamed' })
    await lib.mindmaps.removeNode(a.id)            // takes A1 and the edge with it
    expect((await lib.mindmaps.getNodes(mm.id)).map(n => n.title).sort()).not.toContain('A1')

    await lib.mindmaps.restore(mm.id, before)       // undo both
    const nodes = await lib.mindmaps.getNodes(mm.id)
    expect(nodes.find(n => n.id === b.id)!.title).toBe('B')
    expect(nodes.find(n => n.id === a1.id)).toMatchObject({ title: 'A1', parentId: a.id })
    expect((await lib.mindmaps.getEdges(mm.id)).map(e => e.id)).toEqual([edge.id])
    const file = JSON.parse(readFileSync(join(root, '.banjuan', 'notes', `${mm.id}.json`), 'utf8'))
    expect(file.nodes.map((n: any) => n.title).sort()).toEqual([...before.nodes.map(n => n.title)].sort())
    expect(file.edges.map((e: any) => e.id)).toEqual([edge.id])

    // Redo past the summary's creation the other way: drop the summary node.
    await lib.mindmaps.restore(mm.id, { nodes: before.nodes.filter(n => n.title !== 'Summary'), edges: before.edges })
    expect((await lib.mindmaps.getSummaries(mm.id)).map(s => s.id)).not.toContain(summary.id)
    await lib.close()
  })
})
