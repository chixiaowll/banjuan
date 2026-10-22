import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'

describe('DocumentService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('import', () => {
    it('creates metadata JSON file without copying original', async () => {
      createTestFile(libPath, 'papers/test.pdf', Buffer.from('fake pdf'))
      const doc = await lib.documents.import(join(libPath, 'papers/test.pdf'))

      expect(doc.path).toBe('papers/test.pdf')
      expect(doc.title).toBe('test')
      expect(doc.type).toBe('pdf')

      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.id).toBe(doc.id)
      expect(fileData.path).toBe('papers/test.pdf')
      expect(fileData.tags).toEqual([])

      expect(existsSync(join(libPath, 'papers/test.pdf'))).toBe(true)
    })

    it('accepts relative path to library root', async () => {
      createTestFile(libPath, 'books/intro.epub', Buffer.from('fake epub'))
      const doc = await lib.documents.import('books/intro.epub')
      expect(doc.path).toBe('books/intro.epub')
    })

    it('rejects file outside library root', async () => {
      createTestFile(tempDir, 'outside.pdf', Buffer.from('outside'))
      await expect(lib.documents.import(join(tempDir, 'outside.pdf'))).rejects.toThrow('must be inside')
    })

    it('allows same content at different paths', async () => {
      createTestFile(libPath, 'a.txt', 'same content')
      createTestFile(libPath, 'b.txt', 'same content')
      const docA = await lib.documents.import('a.txt')
      const docB = await lib.documents.import('b.txt')
      expect(docA.path).toBe('a.txt')
      expect(docB.path).toBe('b.txt')
      expect(docA.id).not.toBe(docB.id)
    })

    it('rejects duplicate path', async () => {
      createTestFile(libPath, 'a.txt', 'content')
      await lib.documents.import('a.txt')
      await expect(lib.documents.import('a.txt')).rejects.toThrow('already imported')
    })

    it('stores tags in JSON file', async () => {
      createTestFile(libPath, 'tagged.txt', 'content')
      const doc = await lib.documents.import('tagged.txt', { tags: ['research', 'ai'] })

      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).toEqual(['research', 'ai'])
    })

    it('emits document:imported event', async () => {
      createTestFile(libPath, 'event.txt', 'content')
      let emitted: any = null
      lib.events.on('document:imported', (data) => { emitted = data })
      await lib.documents.import('event.txt')
      expect(emitted).not.toBeNull()
      expect(emitted.document.path).toBe('event.txt')
    })
  })

  describe('list', () => {
    it('returns all documents sorted by created_at desc', async () => {
      createTestFile(libPath, 'first.txt', 'a')
      createTestFile(libPath, 'second.txt', 'b')
      await lib.documents.import('first.txt')
      await lib.documents.import('second.txt')

      const docs = await lib.documents.list()
      expect(docs).toHaveLength(2)
    })

    it('filters by type', async () => {
      createTestFile(libPath, 'doc.pdf', Buffer.from('pdf'))
      createTestFile(libPath, 'note.txt', 'text')
      await lib.documents.import('doc.pdf')
      await lib.documents.import('note.txt')

      const pdfs = await lib.documents.list({ type: 'pdf' })
      expect(pdfs).toHaveLength(1)
      expect(pdfs[0].type).toBe('pdf')
    })
  })

  describe('get', () => {
    it('returns document by id', async () => {
      createTestFile(libPath, 'get-test.txt', 'content')
      const doc = await lib.documents.import('get-test.txt')
      const found = await lib.documents.get(doc.id)
      expect(found?.id).toBe(doc.id)
    })

    it('returns null for non-existent id', async () => {
      const found = await lib.documents.get('nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('renameDir', () => {
    it('renames the folder on disk and updates every document path inside it', async () => {
      createTestFile(libPath, 'papers/a.pdf', Buffer.from('A'))
      createTestFile(libPath, 'papers/sub/b.pdf', Buffer.from('B'))
      createTestFile(libPath, 'papers-old/c.pdf', Buffer.from('C'))     // look-alike sibling stays put
      const a = await lib.documents.import('papers/a.pdf')
      const b = await lib.documents.import('papers/sub/b.pdf')
      const c = await lib.documents.import('papers-old/c.pdf')

      await lib.documents.renameDir('papers', 'articles')

      expect((await lib.documents.get(a.id))!.path).toBe('articles/a.pdf')
      expect((await lib.documents.get(b.id))!.path).toBe('articles/sub/b.pdf')
      expect((await lib.documents.get(c.id))!.path).toBe('papers-old/c.pdf')
      expect(readFileSync(join(libPath, 'articles/sub/b.pdf'), 'utf-8')).toBe('B')
      expect(existsSync(join(libPath, 'papers'))).toBe(false)
      // the JSON metadata (source of truth for rebuilds) follows too
      const json = JSON.parse(readFileSync(join(libPath, '.banjuan/data/documents', a.id.slice(0, 2), a.id + '.json'), 'utf-8'))
      expect(json.path).toBe('articles/a.pdf')
    })

    it('refuses to merge into a folder that already exists', async () => {
      createTestFile(libPath, 'x/a.pdf', Buffer.from('A'))
      createTestFile(libPath, 'y/b.pdf', Buffer.from('B'))
      await lib.documents.import('x/a.pdf')
      await expect(lib.documents.renameDir('x', 'y')).rejects.toThrow('DIR_EXISTS')
      expect(existsSync(join(libPath, 'x/a.pdf'))).toBe(true)
    })
  })

  describe('delete', () => {
    it('deletes original file, metadata JSON, and DB record', async () => {
      createTestFile(libPath, 'deleteme.txt', 'content')
      const doc = await lib.documents.import('deleteme.txt')

      await lib.documents.delete(doc.id)

      expect(existsSync(join(libPath, 'deleteme.txt'))).toBe(false)

      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      expect(existsSync(jsonPath)).toBe(false)

      expect(await lib.documents.get(doc.id)).toBeNull()
    })

    it('emits document:deleted event', async () => {
      createTestFile(libPath, 'del-event.txt', 'x')
      const doc = await lib.documents.import('del-event.txt')
      let emitted: any = null
      lib.events.on('document:deleted', (data) => { emitted = data })
      await lib.documents.delete(doc.id)
      expect(emitted).toEqual({ id: doc.id })
    })
  })
})
