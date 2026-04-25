import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('TagService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
    mkdirSync(join(lib.rootPath, 'documents'), { recursive: true })
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
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)
      await lib.tags.create({ name: 'AI' })
      await lib.tags.assign(doc.id, 'document', ['AI'])
      const docs = await lib.documents.list({ tag: 'AI' })
      expect(docs).toHaveLength(1)
      expect(docs[0].id).toBe(doc.id)
    })

    it('removes a tag assignment', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)
      await lib.tags.create({ name: 'AI' })
      await lib.tags.assign(doc.id, 'document', ['AI'])
      await lib.tags.unassign(doc.id, 'document', 'AI')
      const docs = await lib.documents.list({ tag: 'AI' })
      expect(docs).toHaveLength(0)
    })

    it('lists tags for a document', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)
      await lib.tags.create({ name: 'AI' })
      await lib.tags.create({ name: 'NLP' })
      await lib.tags.assign(doc.id, 'document', ['AI', 'NLP'])
      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(2)
      expect(tags.map((t) => t.name).sort()).toEqual(['AI', 'NLP'])
    })
  })
})
