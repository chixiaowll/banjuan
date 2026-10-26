import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
// The iPad's database engine: sql.js, built without FTS5.
import { CapacitorDatabaseFactory } from '../../platform-capacitor/src/database.js'
import { Library } from '../src/library.js'
import { createTempDir, createTestFile, testDeps } from './helpers.js'

describe('search without FTS5 (iPad / sql.js)', () => {
  it('finds note bodies and document text by substring', async () => {
    const root = join(createTempDir(), 'lib')
    const fs = new NodeFS()
    const lib = await Library.init(root, testDeps({ fs, dbFactory: new CapacitorDatabaseFactory(fs) }))
    const note = await lib.notes.create({ title: '读书笔记' })
    await lib.notes.update(note.id, { content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: '机器学习的基本概念', styles: {} }], children: [] }]) })
    createTestFile(root, 'paper.pdf', 'pdf')
    const doc = await lib.documents.import('paper.pdf')
    expect(lib.docText.available).toBe(true)
    lib.docText.store(doc.id, doc.hash, [{ page: 4, text: '本文讨论神经网络的训练方法' }])

    const notes = await lib.search.query('学习', { type: 'note' })
    expect(notes.map(r => r.id)).toContain(note.id)
    const docs = await lib.search.query('神经网络', { type: 'document' })
    expect(docs[0]).toMatchObject({ id: doc.id, page: 4 })
    await lib.close()
  })
})
