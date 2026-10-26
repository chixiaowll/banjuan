import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, createTestFile, testDeps } from './helpers.js'

// rebuildFull clears every derived table first, then re-inserts row by row. A
// failure part-way used to leave a half-empty index that still looked valid.
describe('rebuildFull is all-or-nothing', () => {
  it('keeps the previous index when the rebuild fails part-way', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    const doc = await lib.documents.import(createTestFile(root, 'paper.md', '# Paper'))
    const note = await lib.notes.create({ title: 'Keep me' } as any)

    const idx = lib.createIndexService()
    ;(idx as any).annStore.listAll = async () => { throw new Error('disk read failed') }   // fails after docs are re-indexed
    await expect(idx.rebuildFull()).rejects.toThrow('disk read failed')

    expect(await lib.documents.get(doc.id)).not.toBeNull()
    expect(await lib.notes.get(note.id)).not.toBeNull()
    expect((await lib.documents.list()).length).toBe(1)
  })

  it('still rebuilds normally', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    const doc = await lib.documents.import(createTestFile(root, 'a.md', '# A'))
    ;(lib as any).db.run('DELETE FROM documents')
    await lib.createIndexService().rebuildFull()
    expect(await lib.documents.get(doc.id)).not.toBeNull()
  })
})

// A rebuild reads every file before touching the index. Edits made while it
// reads must survive the swap: they used to find their note's row cleared and
// were dropped, or land in the DB only and vanish.
describe('rebuildFull while the library is being edited', () => {
  it('keeps edits, new notes and new mind-map nodes made during the rebuild', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    const notes = []
    for (let i = 0; i < 120; i++) notes.push(await lib.notes.create({ title: `n${i}` } as any))
    const mm = await lib.notes.create({ title: 'Map', type: 'mindmap' } as any)
    const rootNode = (await lib.mindmaps.getNodes(mm.id)).find(n => !n.parentId)!
    await lib.tags.create({ name: 'old' })
    await lib.tags.assign(notes[1].id, 'note', ['old'])

    let done = false
    const rebuilding = lib.createIndexService().rebuildFull().then(() => { done = true })
    await lib.notes.update(notes[0].id, { title: '改过的标题' })
    const added = await lib.mindmaps.addNode(mm.id, { title: '重建中加的', parentId: rootNode.id })
    const created = await lib.notes.create({ title: '重建中新建' } as any)
    await lib.notes.delete(notes[2].id)
    await lib.tags.unassign(notes[1].id, 'note', 'old')
    expect(done).toBe(false)   // the edits really happened while it ran
    await rebuilding

    expect((await lib.notes.get(notes[0].id))!.title).toBe('改过的标题')
    expect(await lib.notes.get(created.id)).not.toBeNull()
    expect(await lib.notes.get(notes[2].id)).toBeNull()
    expect((await lib.mindmaps.getNodes(mm.id)).map(n => n.id)).toContain(added.id)
    expect(await lib.tags.forTarget(notes[1].id, 'note')).toEqual([])
    const hits = await lib.search.query('改过的标题')
    expect(hits.some((h: any) => h.id === notes[0].id)).toBe(true)

    // and a later rebuild agrees with the files
    await lib.createIndexService().rebuildFull()
    expect((await lib.notes.get(notes[0].id))!.title).toBe('改过的标题')
    expect((await lib.mindmaps.getNodes(mm.id)).map(n => n.id)).toContain(added.id)
    await lib.close()
  })

  it('indexes one of two note files that share an id, preferring the path it had', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    const note = await lib.notes.create({ title: 'Original' } as any)
    const path = (await lib.notes.get(note.id))!.path
    const fs = await import('node:fs')
    const src = join(root, '.banjuan', 'notes', path)
    for (const name of ['aaa-copy.json', 'zzz-copy.json']) fs.copyFileSync(src, join(root, '.banjuan', 'notes', name))
    await lib.createIndexService().rebuildFull()
    expect((await lib.notes.get(note.id))!.path).toBe(path)
    await lib.close()
  })
})
