import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { isExcluded } from '../src/sync/exclusions.js'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'

const para = (text: string) => JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text }] }])
const noteLink = (id: string, title: string) => JSON.stringify([{ type: 'paragraph', content: [
  { type: 'noteLink', props: { noteId: id, title } },
] }])

describe('recycle bin', () => {
  let tempDir: string
  let libPath: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  it('deleting a document moves its file to the bin; restoring brings back file, metadata, tags and links to it', async () => {
    createTestFile(libPath, 'papers/a.pdf', Buffer.from('PDF-A'))
    const doc = await lib.documents.import('papers/a.pdf')
    await lib.tags.create({ name: '重要' })
    await lib.tags.assign(doc.id, 'document', ['重要'])
    const ann = await lib.annotations.create({ docId: doc.id, type: 'highlight', page: 2, position: { type: 'pdf', page: 2, rects: [], text: '' }, selectedText: 'x' })

    await lib.documents.delete(doc.id)
    expect(existsSync(join(libPath, 'papers/a.pdf'))).toBe(false)
    expect(await lib.documents.get(doc.id)).toBeNull()
    const entries = await lib.trash.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'document', itemId: doc.id, title: 'a', originalPath: 'papers/a.pdf' })
    expect((await lib.annotations.listRecent(10)).map(a => a.id)).not.toContain(ann.id)   // hidden while binned

    const restored = await lib.trash.restore(entries[0].id)
    expect(restored).toMatchObject({ kind: 'document', id: doc.id })
    expect(readFileSync(join(libPath, 'papers/a.pdf'), 'utf-8')).toBe('PDF-A')
    expect((await lib.documents.get(doc.id))!.path).toBe('papers/a.pdf')
    expect((await lib.tags.forTarget(doc.id, 'document')).map(t => t.name)).toEqual(['重要'])
    expect((await lib.annotations.listRecent(10)).map(a => a.id)).toContain(ann.id)
    expect(await lib.trash.list()).toHaveLength(0)
  })

  it('restores a note with its tags and the backlinks other notes had to it', async () => {
    const target = await lib.notes.create({ title: '目标笔记', content: para('正文') })
    await lib.tags.create({ name: '读书' })
    await lib.tags.assign(target.id, 'note', ['读书'])
    const source = await lib.notes.create({ title: '引用方', content: noteLink(target.id, '目标笔记') })
    expect((await lib.noteLinks.getBacklinks(target.id)).map(l => l.sourceId)).toEqual([source.id])

    await lib.notes.delete(target.id)
    expect(await lib.notes.get(target.id)).toBeNull()
    const [entry] = await lib.trash.list()
    expect(entry).toMatchObject({ kind: 'note', itemId: target.id, title: '目标笔记' })

    await lib.trash.restore(entry.id)
    const back = await lib.notes.get(target.id)
    expect(back!.title).toBe('目标笔记')
    expect(JSON.parse(back!.content)[0].content[0].text).toBe('正文')
    expect((await lib.tags.forTarget(target.id, 'note')).map(t => t.name)).toEqual(['读书'])
    expect((await lib.noteLinks.getBacklinks(target.id)).map(l => l.sourceId)).toEqual([source.id])
    expect((await lib.search.query('正文')).map(r => r.id)).toContain(target.id)
  })

  it('restores next to a file that took the original path, without overwriting it', async () => {
    createTestFile(libPath, 'b.pdf', Buffer.from('OLD'))
    const doc = await lib.documents.import('b.pdf')
    await lib.documents.delete(doc.id)
    createTestFile(libPath, 'b.pdf', Buffer.from('NEW'))
    const [entry] = await lib.trash.list()
    await lib.trash.restore(entry.id)
    expect(readFileSync(join(libPath, 'b.pdf'), 'utf-8')).toBe('NEW')
    const path = (await lib.documents.get(doc.id))!.path
    expect(path).not.toBe('b.pdf')
    expect(readFileSync(join(libPath, path), 'utf-8')).toBe('OLD')
  })

  it('deleting a folder bins each document and keeps untracked files too', async () => {
    createTestFile(libPath, 'dir/x.pdf', Buffer.from('X'))
    createTestFile(libPath, 'dir/notes.bin', Buffer.from('untracked'))
    const x = await lib.documents.import('dir/x.pdf')
    await lib.documents.deleteDir('dir')
    expect(existsSync(join(libPath, 'dir'))).toBe(false)
    const entries = await lib.trash.list()
    expect(entries.map(e => e.kind).sort()).toEqual(['document', 'folder'])
    for (const e of entries) await lib.trash.restore(e.id)
    expect(readFileSync(join(libPath, 'dir/notes.bin'), 'utf-8')).toBe('untracked')
    expect((await lib.documents.get(x.id))!.path).toBe('dir/x.pdf')
  })

  it('purge, empty and 30-day expiry delete permanently', async () => {
    createTestFile(libPath, 'p.pdf', Buffer.from('P'))
    const p = await lib.documents.import('p.pdf')
    const ann = await lib.annotations.create({ docId: p.id, type: 'highlight', page: 1, position: { type: 'pdf', page: 1, rects: [], text: '' } })
    await lib.documents.delete(p.id)
    const [entry] = await lib.trash.list()
    await lib.trash.purge(entry.id)
    expect(await lib.trash.list()).toHaveLength(0)
    expect(await lib.annotations.get(ann.id)).toBeNull()   // a purged document takes its annotations with it

    const n1 = await lib.notes.create({ title: 'n1' })
    const n2 = await lib.notes.create({ title: 'n2' })
    await lib.notes.delete(n1.id)
    await lib.notes.delete(n2.id)
    // age one entry past the retention period
    const trashDir = join(libPath, '.banjuan', '.trash')
    const old = readdirSync(trashDir).find(d => d.includes(n1.id))!
    const ej = join(trashDir, old, 'entry.json')
    writeFileSync(ej, JSON.stringify({ ...JSON.parse(readFileSync(ej, 'utf-8')), deletedAt: new Date(Date.now() - 31 * 864e5).toISOString() }))
    expect(await lib.trash.purgeExpired()).toBe(1)
    expect((await lib.trash.list()).map(e => e.itemId)).toEqual([n2.id])
    await lib.trash.empty()
    expect(await lib.trash.list()).toHaveLength(0)
  })

  it('the bin is never synced', () => {
    expect(isExcluded('.trash', true)).toBe(true)
  })
})
