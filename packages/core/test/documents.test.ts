import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('DocumentService', () => {
  let tempDir: string
  let lib: Library
  let fixtureFile: string

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
    // DocumentService still writes to rootPath/documents/ (will be refactored in Task 4)
    mkdirSync(join(lib.rootPath, 'documents'), { recursive: true })
    fixtureFile = join(tempDir, 'test-doc.txt')
    writeFileSync(fixtureFile, 'Hello, this is test content for the document.')
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  describe('import', () => {
    it('copies file to documents/ and returns a Document', async () => {
      const doc = await lib.documents.import(fixtureFile)
      expect(doc.id).toBeTruthy()
      expect(doc.title).toBe('test-doc')
      expect(doc.type).toBe('txt')
      expect(doc.path).toBeTruthy()
      expect(existsSync(join(lib.rootPath, 'documents', doc.path))).toBe(true)
    })

    it('deduplicates by hash', async () => {
      await lib.documents.import(fixtureFile)
      await expect(lib.documents.import(fixtureFile)).rejects.toThrow('already imported')
    })

    it('allows custom title', async () => {
      const doc = await lib.documents.import(fixtureFile, { title: 'My Custom Title' })
      expect(doc.title).toBe('My Custom Title')
    })
  })

  describe('list', () => {
    it('returns all documents', async () => {
      await lib.documents.import(fixtureFile)
      const docs = await lib.documents.list()
      expect(docs).toHaveLength(1)
      expect(docs[0].title).toBe('test-doc')
    })

    it('returns empty array when no documents', async () => {
      const docs = await lib.documents.list()
      expect(docs).toEqual([])
    })

    it('sorts by created_at desc by default', async () => {
      await lib.documents.import(fixtureFile)
      await new Promise((r) => setTimeout(r, 5))
      const file2 = join(tempDir, 'second.txt')
      writeFileSync(file2, 'second file content that is different')
      const doc2 = await lib.documents.import(file2)
      const docs = await lib.documents.list()
      expect(docs[0].id).toBe(doc2.id)
    })
  })

  describe('get', () => {
    it('returns a document by id', async () => {
      const imported = await lib.documents.import(fixtureFile)
      const doc = await lib.documents.get(imported.id)
      expect(doc).not.toBeNull()
      expect(doc!.id).toBe(imported.id)
    })

    it('returns null for unknown id', async () => {
      const doc = await lib.documents.get('nonexistent')
      expect(doc).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes from DB and filesystem', async () => {
      const doc = await lib.documents.import(fixtureFile)
      const filePath = join(lib.rootPath, 'documents', doc.path)
      expect(existsSync(filePath)).toBe(true)
      await lib.documents.delete(doc.id)
      expect(await lib.documents.get(doc.id)).toBeNull()
      expect(existsSync(filePath)).toBe(false)
    })
  })
})
