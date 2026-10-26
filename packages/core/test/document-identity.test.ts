import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'

// A document's id starts out derived from its path. Once it moves away or goes
// to the bin, a new file at that path must not get the same id: it overwrote
// the other document's metadata and showed its annotations.
describe('document ids and moves', () => {
  let tempDir: string
  let libPath: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  const meta = (id: string) => JSON.parse(readFileSync(join(libPath, '.banjuan', 'data', 'documents', id.slice(0, 2), `${id}.json`), 'utf-8'))

  it('a file imported at a path another document moved away from gets its own id', async () => {
    createTestFile(libPath, 'a.pdf', Buffer.from('ONE'))
    const first = await lib.documents.import('a.pdf')
    await lib.documents.update(first.id, { title: '第一本' })
    await lib.documents.move(first.id, 'shelf')

    createTestFile(libPath, 'a.pdf', Buffer.from('TWO'))
    const second = await lib.documents.import('a.pdf')

    expect(second.id).not.toBe(first.id)
    expect(meta(first.id)).toMatchObject({ title: '第一本', path: 'shelf/a.pdf' })
    expect(meta(second.id)).toMatchObject({ path: 'a.pdf' })
    expect((await lib.documents.get(first.id))!.path).toBe('shelf/a.pdf')
  })

  it('a file imported at the path of a binned document gets its own id; restoring the binned one replaces nothing', async () => {
    createTestFile(libPath, 'a.pdf', Buffer.from('ONE'))
    const first = await lib.documents.import('a.pdf')
    await lib.annotations.create({ docId: first.id, type: 'highlight', page: 1, position: { type: 'pdf', page: 1, rects: [], text: '' }, selectedText: 'old' })
    await lib.documents.delete(first.id)

    createTestFile(libPath, 'a.pdf', Buffer.from('TWO'))
    const second = await lib.documents.import('a.pdf')
    expect(second.id).not.toBe(first.id)
    expect(await lib.annotations.list({ docId: second.id })).toHaveLength(0)

    const [entry] = await lib.trash.list()
    const restored = await lib.trash.restore(entry.id)
    expect(restored.id).toBe(first.id)
    expect((await lib.documents.get(second.id))!.path).toBe('a.pdf')
    expect((await lib.documents.get(first.id))!.path).toBe('a (2).pdf')
    expect(readFileSync(join(libPath, 'a.pdf'), 'utf-8')).toBe('TWO')
    expect(readFileSync(join(libPath, 'a (2).pdf'), 'utf-8')).toBe('ONE')
  })

  it('restoring a binned document whose id was taken meanwhile gives it a new id', async () => {
    createTestFile(libPath, 'a.pdf', Buffer.from('ONE'))
    const first = await lib.documents.import('a.pdf')
    await lib.documents.delete(first.id)
    // What older versions did: the same path id handed to the next file there.
    createTestFile(libPath, 'b.pdf', Buffer.from('OTHER'))
    const other = await lib.documents.import('b.pdf')
    lib.db.run('UPDATE documents SET id = ? WHERE id = ?', [first.id, other.id])

    const [entry] = await lib.trash.list()
    const restored = await lib.trash.restore(entry.id)
    expect(restored.id).not.toBe(first.id)
    expect((await lib.documents.get(first.id))!.path).toBe('b.pdf')
    expect((await lib.documents.get(restored.id))!.path).toBe('a.pdf')
  })

  it('moving into a folder that has a file of the same name keeps both', async () => {
    createTestFile(libPath, 'a.pdf', Buffer.from('ROOT'))
    createTestFile(libPath, 'shelf/a.pdf', Buffer.from('SHELF'))
    const root = await lib.documents.import('a.pdf')
    const shelf = await lib.documents.import('shelf/a.pdf')

    const moved = await lib.documents.move(root.id, 'shelf')
    expect(moved!.path).toBe('shelf/a (2).pdf')
    expect(readFileSync(join(libPath, 'shelf/a.pdf'), 'utf-8')).toBe('SHELF')
    expect(readFileSync(join(libPath, 'shelf/a (2).pdf'), 'utf-8')).toBe('ROOT')
    expect((await lib.documents.get(shelf.id))!.path).toBe('shelf/a.pdf')
    expect(meta(root.id).path).toBe('shelf/a (2).pdf')
  })

  it('moving a document into the folder it is already in changes nothing', async () => {
    createTestFile(libPath, 'shelf/a.pdf', Buffer.from('X'))
    const doc = await lib.documents.import('shelf/a.pdf')
    const moved = await lib.documents.move(doc.id, 'shelf')
    expect(moved!.path).toBe('shelf/a.pdf')
    expect(existsSync(join(libPath, 'shelf/a.pdf'))).toBe(true)
  })

  it('concurrent changes to one document, its tags and annotations all land', async () => {
    createTestFile(libPath, 'a.pdf', Buffer.from('X'))
    const doc = await lib.documents.import('a.pdf')
    for (const name of ['t1', 't2', 't3', 't4']) await lib.tags.create({ name })
    const ann = await lib.annotations.create({ docId: doc.id, type: 'highlight', page: 1, position: { type: 'pdf', page: 1, rects: [], text: '' }, selectedText: 'x' })

    await Promise.all([
      lib.documents.update(doc.id, { title: '新标题', metadata: { note: 1 } }),
      lib.tags.assign(doc.id, 'document', ['t1']),
      lib.tags.assign(doc.id, 'document', ['t2']),
      lib.documents.move(doc.id, 'shelf'),
      lib.tags.assign(doc.id, 'document', ['t3']),
      lib.documents.update(doc.id, { metadata: { other: 2 } }),
      lib.tags.assign(doc.id, 'document', ['t4']),
      lib.annotations.update(ann.id, { color: '#f00' }),
      lib.annotations.update(ann.id, { content: '想法' }),
    ])

    const m = meta(doc.id)
    expect(m.title).toBe('新标题')
    expect(m.path).toBe('shelf/a.pdf')
    expect([...m.tags].sort()).toEqual(['t1', 't2', 't3', 't4'])
    expect(m.metadata).toMatchObject({ note: 1, other: 2 })
    const a = await lib.annotations.get(ann.id)
    expect(a).toMatchObject({ color: '#f00', content: '想法' })
  })

  it('renaming or deleting a tag rewrites only what carries it, and catalog changes made together all land', async () => {
    createTestFile(libPath, 'a.pdf', Buffer.from('X'))
    const doc = await lib.documents.import('a.pdf')
    const note = await lib.notes.create({ title: 'n' })
    const tag = await lib.tags.create({ name: '旧' })
    await lib.tags.assign(doc.id, 'document', ['旧'])
    await lib.tags.assign(note.id, 'note', ['旧'])

    await Promise.all([
      lib.tags.rename(tag.id, '新'),
      lib.tags.create({ name: 'x' }),
      lib.tags.create({ name: 'y' }),
    ])
    expect(meta(doc.id).tags).toEqual(['新'])
    const catalog = JSON.parse(readFileSync(join(libPath, '.banjuan', 'tags.json'), 'utf-8')).map((t: any) => t.name).sort()
    expect(catalog).toEqual(['x', 'y', '新'])

    await lib.tags.delete(tag.id)
    expect(meta(doc.id).tags).toEqual([])
    expect((await lib.notes.get(note.id))).toBeTruthy()
  })
})
