import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, testDeps } from './helpers.js'

// Mind-map node edits, title/typeMeta saves, tag changes and moves all rewrite
// the same note file (read → modify → write). Fired together — as the canvas
// does — none may be lost to another's stale read.
describe('concurrent changes to one note file', () => {
  it('keeps every change', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    const mm = await lib.notes.create({ title: 'Map', type: 'mindmap' })
    const rootNode = (await lib.mindmaps.getNodes(mm.id)).find(n => !n.parentId)!
    const kids = []
    for (let i = 0; i < 6; i++) kids.push(await lib.mindmaps.addNode(mm.id, { title: `n${i}`, parentId: rootNode.id }))
    await lib.tags.create({ name: 'tagged' })

    await Promise.all([
      ...kids.map((k, i) => lib.mindmaps.updateNode(k.id, { title: `renamed ${i}`, color: '#f00' })),
      lib.notes.update(mm.id, { title: 'Map v2', typeMeta: { layout: 'tree' } }),
      lib.tags.assign(mm.id, 'mindmap', ['tagged']),
      lib.mindmaps.addEdge(mm.id, { sourceId: kids[0].id, targetId: kids[1].id }),
      lib.notes.move(mm.id, 'Folder'),
      lib.mindmaps.addNode(mm.id, { title: 'late', parentId: kids[2].id }),
    ])

    const row = (await lib.notes.get(mm.id))!
    const file = JSON.parse(readFileSync(join(root, '.banjuan', 'notes', 'Folder', `${mm.id}.json`), 'utf8'))
    expect(row.title).toBe('Map v2')
    expect(file.meta.title).toBe('Map v2')
    expect(file.meta.typeMeta).toEqual({ layout: 'tree' })
    expect(file.tags).toEqual(['tagged'])
    expect(file.edges).toHaveLength(1)
    for (let i = 0; i < 6; i++) expect(file.nodes.find((n: any) => n.id === kids[i].id)).toMatchObject({ title: `renamed ${i}`, color: '#f00' })
    expect(file.nodes.some((n: any) => n.title === 'late')).toBe(true)
    await lib.close()
  })
})
