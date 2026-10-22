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
