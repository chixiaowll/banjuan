import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import { Library } from '../src/library.js'

function deps() {
  return { fs: new NodeFS(), dbFactory: new NodeDatabaseFactory(), crypto: new NodeCrypto(), globalPluginsDir: join(tmpdir(), 'gp') }
}

async function freshLibrary() {
  const base = mkdtempSync(join(tmpdir(), 'del-'))
  const lib = await Library.init(join(base, 'lib'), deps() as any, 'T')
  return { lib, base }
}

// Deletes used to remove files first and DB rows last; a foreign key on a
// related row then failed the final DELETE, leaving a row whose file was gone.
describe('delete keeps disk and database consistent', () => {
  it('deletes a document that a note links to', async () => {
    const { lib } = await freshLibrary()
    const src = join(lib.rootPath, 'paper.md')
    writeFileSync(src, '# Paper')
    const doc = await lib.documents.import(src)
    const note = await lib.notes.create({ title: 'Reading notes' } as any)
    await lib.docLinks.sync(note.id, [{ targetId: doc.id, context: 'see paper' }] as any)

    await expect(lib.documents.delete(doc.id)).resolves.toBeUndefined()
    expect(await lib.documents.get(doc.id)).toBeNull()
    expect(existsSync(join(lib.rootPath, doc.path))).toBe(false)
    expect(await lib.notes.get(note.id)).not.toBeNull()   // the linking note survives
  })

  it('deletes a mind map that has a summary and a boundary', async () => {
    const { lib } = await freshLibrary()
    const mm = await lib.notes.create({ title: 'Map', type: 'mindmap' } as any)
    const a = await lib.mindmaps.addNode(mm.id, { title: 'A' })
    const b = await lib.mindmaps.addNode(mm.id, { title: 'B' })
    await lib.mindmaps.addSummary(mm.id, { nodeIds: [a.id, b.id], summaryTitle: 'S' })
    await lib.mindmaps.addBoundary(mm.id, { nodeIds: [a.id, b.id] })

    await expect(lib.notes.delete(mm.id)).resolves.toBeUndefined()
    expect(await lib.notes.get(mm.id)).toBeNull()
  })
})

describe('saving into a deleted note', () => {
  it('rejects with a clear error instead of a TypeError', async () => {
    const lib = await Library.init(mkdtempSync(join(tmpdir(), 'del-')) + '/lib', deps() as any, 'T')
    const note = await lib.notes.create({ title: 'gone' } as any)
    await lib.notes.delete(note.id)
    await expect(lib.notes.update(note.id, { content: '[]' })).rejects.toThrow('Note not found')
  })
})
