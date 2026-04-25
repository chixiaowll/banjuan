import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { Library } from '../src/library.js'

describe('TagService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('creates a tag', async () => {
      const tag = await lib.tags.create({ name: 'machine-learning', color: 'blue' })
      expect(tag.id).toBeTruthy()
      expect(tag.name).toBe('machine-learning')
      expect(tag.color).toBe('blue')
    })

    it('throws on duplicate name', async () => {
      await lib.tags.create({ name: 'test' })
      await expect(lib.tags.create({ name: 'test' })).rejects.toThrow()
    })
  })

  describe('list', () => {
    it('returns all tags', async () => {
      await lib.tags.create({ name: 'a' })
      await lib.tags.create({ name: 'b' })
      const tags = await lib.tags.list()
      expect(tags).toHaveLength(2)
    })
  })

  describe('assign and query', () => {
    it('assigns tags to a document', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      await lib.tags.create({ name: 'AI' })
      await lib.tags.assign(doc.id, 'document', ['AI'])
      const docs = await lib.documents.list({ tag: 'AI' })
      expect(docs).toHaveLength(1)
      expect(docs[0].id).toBe(doc.id)
    })

    it('removes a tag assignment', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      await lib.tags.create({ name: 'AI' })
      await lib.tags.assign(doc.id, 'document', ['AI'])
      await lib.tags.unassign(doc.id, 'document', 'AI')
      const docs = await lib.documents.list({ tag: 'AI' })
      expect(docs).toHaveLength(0)
    })

    it('lists tags for a document', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc2.txt', 'content2')
      const doc = await lib.documents.import('doc2.txt')
      await lib.tags.create({ name: 'AI' })
      await lib.tags.create({ name: 'NLP' })
      await lib.tags.assign(doc.id, 'document', ['AI', 'NLP'])
      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(2)
      expect(tags.map((t) => t.name).sort()).toEqual(['AI', 'NLP'])
    })
  })
})
