import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'
import { Library } from '../src/library.js'
import { initSchema } from '../src/db/schema.js'
import { INDEX_VERSION } from '../src/indexing/service.js'

const para = (text: string) => JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text }] }])

describe('global search (CJK, annotations, mind maps)', () => {
  let tempDir: string
  let libPath: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  it('finds Chinese substrings inside note text, including 1–2 character queries', async () => {
    const note = await lib.notes.create({ title: '读书笔记', content: para('机器学习是一种让计算机从数据中学习的方法') })
    for (const q of ['器学习', '学习', '数据中', '法']) {
      expect((await lib.search.query(q)).map(r => r.id), q).toContain(note.id)
    }
    expect(await lib.search.query('深度强化')).toHaveLength(0)
  })

  it('requires every space-separated term (AND), in title or body', async () => {
    const a = await lib.notes.create({ title: '注意力机制', content: para('Transformer 的核心') })
    const b = await lib.notes.create({ title: '卷积网络', content: para('图像识别的核心') })
    const ids = (await lib.search.query('核心 注意力')).map(r => r.id)
    expect(ids).toContain(a.id)
    expect(ids).not.toContain(b.id)
  })

  it('ranks title matches above body matches and returns a snippet around the hit', async () => {
    const body = await lib.notes.create({ title: '杂记', content: para('前面有很多很多无关的文字，' + '填充'.repeat(60) + '这里提到了量子纠缠的实验结果，后面还有内容') })
    const title = await lib.notes.create({ title: '量子纠缠', content: para('标题里就有') })
    const results = await lib.search.query('量子纠缠')
    expect(results.map(r => r.id).slice(0, 2)).toEqual([title.id, body.id])
    const snip = results.find(r => r.id === body.id)!.snippet
    expect(snip).toContain('量子纠缠')
    expect(snip.length).toBeLessThan(160)
  })

  it('searches annotations (highlighted text and comments) and reports their document and page', async () => {
    createTestFile(libPath, 'paper.pdf', Buffer.from('pdf'))
    const doc = await lib.documents.import('paper.pdf')
    const ann = await lib.annotations.create({
      docId: doc.id, type: 'highlight', page: 7,
      position: { type: 'pdf', page: 7, rects: [], text: '' },
      selectedText: '自注意力让模型关注相关位置', content: '这段很关键',
    })
    const byText = (await lib.search.query('关注相关')).find(r => r.id === ann.id)
    expect(byText).toMatchObject({ type: 'annotation', docId: doc.id, page: 7, title: 'paper' })
    expect((await lib.search.query('很关键')).map(r => r.id)).toContain(ann.id)
  })

  it('finds a mind map by the text of its nodes', async () => {
    const mm = await lib.notes.create({ title: '课程导图', type: 'mindmap' })
    await lib.mindmaps.addNode(mm.id, { title: '贝叶斯推断' })
    const hit = (await lib.search.query('贝叶斯')).find(r => r.id === mm.id)
    expect(hit).toMatchObject({ type: 'note', title: '课程导图' })
    expect(hit!.snippet).toContain('贝叶斯推断')
  })

  it('finds documents by title and file name', async () => {
    createTestFile(libPath, 'papers/attention-is-all-you-need.pdf', Buffer.from('pdf'))
    const doc = await lib.documents.import('papers/attention-is-all-you-need.pdf')
    expect((await lib.search.query('all-you')).map(r => r.id)).toContain(doc.id)
  })

  it('treats LIKE wildcards and quotes in the query literally', async () => {
    const pct = await lib.notes.create({ title: '增长', content: para('同比增长 50% 左右') })
    await lib.notes.create({ title: '其他', content: para('增长 500 倍') })
    expect((await lib.search.query('50%')).map(r => r.id)).toEqual([pct.id])
    await expect(lib.search.query('"unbalanced')).resolves.toBeDefined()
    await expect(lib.search.query('a_b')).resolves.toEqual([])
  })
})

describe('search index migration', () => {
  it('replaces an old unicode61 search index with a trigram one', async () => {
    const tempDir = createTempDir()
    const deps = testDeps()
    const db = await deps.dbFactory.open(join(tempDir, 'old.sqlite'))
    db.execute(`CREATE VIRTUAL TABLE search_index USING fts5(title, content, type, tokenize='unicode61')`)
    initSchema(db)
    const sql = db.queryOne<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'search_index'")!.sql
    expect(sql).toMatch(/trigram/)
    // The bumped index version makes every opener run a full rebuild, which refills it.
    expect(INDEX_VERSION).toBeGreaterThanOrEqual(2)
    db.close()
    cleanupTempDir(tempDir)
  })
})
