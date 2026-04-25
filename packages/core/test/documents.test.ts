import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'

describe('DocumentService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
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

    it('deduplicates by hash', async () => {
      createTestFile(libPath, 'a.txt', 'same content')
      createTestFile(libPath, 'b.txt', 'same content')
      await lib.documents.import('a.txt')
      await expect(lib.documents.import('b.txt')).rejects.toThrow('already imported')
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

  describe('delete', () => {
    it('deletes metadata JSON but not the original file', async () => {
      createTestFile(libPath, 'deleteme.txt', 'content')
      const doc = await lib.documents.import('deleteme.txt')

      await lib.documents.delete(doc.id)

      expect(existsSync(join(libPath, 'deleteme.txt'))).toBe(true)

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
