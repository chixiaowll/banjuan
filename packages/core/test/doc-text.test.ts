import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'
import { Library } from '../src/library.js'

describe('document text index and search', () => {
  let tempDir: string
  let libPath: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  const importDoc = async (name: string, content = 'x') => {
    createTestFile(libPath, name, content)
    return lib.documents.import(name)
  }

  it('re-extracts HTML stored by the older extractor, but not PDFs', async () => {
    const html = await importDoc('page.html', '<p><b>深度</b>学习</p>')
    const pdf = await importDoc('a.pdf', 'pdf one')
    lib.docText.store(html.id, html.hash, [{ page: 1, text: 'x' }])
    lib.docText.store(pdf.id, pdf.hash, [{ page: 1, text: 'x' }])
    expect(lib.docText.pending()).toEqual([])
    // What an older version left behind: the plain hash.
    ;(lib as any).db.run('UPDATE doc_text_state SET hash = ? WHERE doc_id = ?', [html.hash, html.id])
    ;(lib as any).db.run('UPDATE doc_text_state SET hash = ? WHERE doc_id = ?', [pdf.hash, pdf.id])
    expect(lib.docText.pending().map(j => j.id)).toEqual([html.id])
    expect(lib.docText.stats()).toMatchObject({ pending: 1 })
  })

  it('lists documents that need text, then not once stored; a changed file is pending again', async () => {
    const pdf = await importDoc('a.pdf', 'pdf one')
    await importDoc('b.png', 'img')   // not a text type
    expect(lib.docText.pending().map(j => j.id)).toEqual([pdf.id])
    lib.docText.store(pdf.id, pdf.hash, [{ page: 1, text: 'hello' }])
    expect(lib.docText.pending()).toEqual([])
    expect(lib.docText.stats()).toMatchObject({ total: 1, indexed: 1, pending: 0, failed: 0 })
    lib.docText.store(pdf.id, 'old-hash', [{ page: 1, text: 'hello' }])
    expect(lib.docText.pending().map(j => j.id)).toEqual([pdf.id])
  })

  it('retries missing files but not failed ones (until the file changes)', async () => {
    const a = await importDoc('a.pdf', 'a')
    const b = await importDoc('b.pdf', 'b')
    lib.docText.markFailed(a.id, a.hash, 'missing', 'ENOENT')
    lib.docText.markFailed(b.id, b.hash, 'failed', 'bad xref')
    expect(lib.docText.pending().map(j => j.id)).toEqual([a.id])
    expect(lib.docText.stats()).toMatchObject({ total: 2, pending: 1, failed: 1, indexed: 0 })
    // Indexers take the missing ones separately (and check the file first).
    expect(lib.docText.pending(50, { includeMissing: false })).toEqual([])
    expect(lib.docText.missing().map(j => j.id)).toEqual([a.id])
    // A missing document whose file then changes is new work again.
    lib.docText.markFailed(a.id, 'older-hash', 'missing', 'ENOENT')
    expect(lib.docText.pending(50, { includeMissing: false }).map(j => j.id)).toEqual([a.id])
    expect(lib.docText.missing()).toEqual([])
  })

  it('a document whose file changed since it was read is extracted again', async () => {
    const a = await importDoc('a.pdf', 'one')
    const b = await importDoc('b.pdf', 'two')
    lib.docText.store(a.id, a.hash, [{ page: 1, text: 'old text' }], '3:1000')
    lib.docText.store(b.id, b.hash, [{ page: 1, text: 'kept' }], '3:2000')
    expect(lib.docText.pending()).toEqual([])
    const changed = await lib.docText.recheckChanged(async path => (path === 'a.pdf' ? '5:3000' : '3:2000'))
    expect(changed).toBe(1)
    expect(lib.docText.pending().map(j => j.id)).toEqual([a.id])
    // a file not here (still in the cloud) isn't taken as changed
    expect(await lib.docText.recheckChanged(async () => null)).toBe(0)
  })

  it('finds a document by its text — Chinese substrings, 1–2 character terms, AND across terms — with page and snippet', async () => {
    const pdf = await importDoc('paper.pdf')
    const epub = await importDoc('book.epub')
    lib.docText.store(pdf.id, pdf.hash, [
      { page: 1, text: '摘要：本文研究深度学习在医学影像中的应用。' },
      { page: 7, text: '实验部分：我们在三个数据集上评估了注意力机制的效果，结果显著优于基线。' },
    ])
    lib.docText.store(epub.id, epub.hash, [{ page: 3, text: 'Chapter three talks about Attention and memory.' }])

    const r = await lib.search.query('注意力机制')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ type: 'document', id: pdf.id, page: 7, docType: 'pdf' })
    expect(r[0].snippet).toContain('注意力机制')

    expect((await lib.search.query('学习')).map(x => x.id)).toEqual([pdf.id])        // 2 characters: scanned
    expect((await lib.search.query('数据集 基线')).map(x => x.page)).toEqual([7])     // both on page 7
    expect(await lib.search.query('摘要 基线')).toHaveLength(0)                       // never on one page
    expect((await lib.search.query('attention')).map(x => [x.id, x.page])).toEqual([[epub.id, 3]])   // case-insensitive
  })

  it('ranks a title match above a text match and does not list a document twice', async () => {
    const titled = await importDoc('量子纠缠导论.pdf')
    const other = await importDoc('杂谈.pdf')
    lib.docText.store(titled.id, titled.hash, [{ page: 2, text: '量子纠缠是一种现象' }])
    lib.docText.store(other.id, other.hash, [{ page: 5, text: '顺便提到量子纠缠' }])
    const r = await lib.search.query('量子纠缠')
    expect(r.map(x => x.id)).toEqual([titled.id, other.id])
    expect(r[1].page).toBe(5)
  })

  it('treats search syntax literally and skips empty pages', async () => {
    const d = await importDoc('n.txt')
    lib.docText.store(d.id, d.hash, [{ page: 1, text: '' }, { page: 2, text: 'cost is 100% "quoted" a*b' }])
    expect((await lib.search.query('100%')).map(x => x.id)).toEqual([d.id])
    expect((await lib.search.query('"quoted"')).map(x => x.id)).toEqual([d.id])
    expect((await lib.search.query('a*b')).map(x => x.id)).toEqual([d.id])
    expect((await lib.search.query('100%'))[0].page).toBeNull()   // plain text: no page
  })

  it('drops text of removed documents', async () => {
    const d = await importDoc('gone.pdf')
    lib.docText.store(d.id, d.hash, [{ page: 1, text: 'vanishing text' }])
    await lib.documents.delete(d.id)
    expect(await lib.search.query('vanishing')).toHaveLength(0)   // joined with documents
    expect(lib.docText.prune()).toBe(1)
  })
})

describe('query folding for document text', () => {
  let tempDir: string
  let lib: Library
  beforeEach(async () => { tempDir = createTempDir(); lib = await Library.init(join(tempDir, 'lib'), testDeps()) })
  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  it('matches full-width query letters against the folded text', async () => {
    createTestFile(join(tempDir, 'lib'), 'p.pdf', 'p')
    const d = await lib.documents.import('p.pdf')
    lib.docText.store(d.id, d.hash, [{ page: 4, text: 'GPT4 模型，效果很好。' }])
    expect((await lib.search.query('ＧＰＴ４')).map(r => r.page)).toEqual([4])
    expect((await lib.search.query('模型，效果')).map(r => r.page)).toEqual([4])   // Chinese punctuation kept on both sides
  })
})

describe('document text search across many documents', () => {
  it('a long book matching on every page does not crowd out other documents', async () => {
    const tempDir = createTempDir()
    const libPath = join(tempDir, 'lib')
    const lib = await Library.init(libPath, testDeps())
    createTestFile(libPath, 'book.pdf', 'book')
    createTestFile(libPath, 'paper.pdf', 'paper')
    const book = await lib.documents.import('book.pdf')
    const paper = await lib.documents.import('paper.pdf')
    lib.docText.store(book.id, book.hash, Array.from({ length: 300 }, (_, i) => ({ page: i + 1, text: `第${i + 1}页 关于神经网络的讨论` })))
    lib.docText.store(paper.id, paper.hash, [{ page: 3, text: '这篇论文也提到神经网络' }])
    const docs = (await lib.search.query('神经网络', { limit: 5 })).filter(r => r.type === 'document')
    expect(docs.map(d => d.id).sort()).toEqual([book.id, paper.id].sort())
    expect(docs.find(d => d.id === paper.id)?.page).toBe(3)
    await lib.close()
    cleanupTempDir(tempDir)
  })
})
