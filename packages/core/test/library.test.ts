import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { Library } from '../src/library.js'

describe('Library', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  describe('init', () => {
    it('creates .banjuan directory structure', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)

      expect(existsSync(join(libPath, '.banjuan', 'db.sqlite'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'config.json'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'data', 'documents'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'data', 'annotations'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'data', 'mindmaps'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'stubs'))).toBe(true)
      expect(existsSync(join(libPath, 'notes'))).toBe(true)

      lib.close()
    })

    it('does not create documents/ directory at root level', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)

      expect(existsSync(join(libPath, 'documents'))).toBe(false)

      lib.close()
    })

    it('creates tags.json with empty array', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)

      const tagsPath = join(libPath, '.banjuan', 'tags.json')
      expect(existsSync(tagsPath)).toBe(true)
      expect(readFileSync(tagsPath, 'utf-8')).toBe('[]')

      lib.close()
    })

    it('throws if directory already has .banjuan', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)
      lib.close()

      expect(() => Library.init(libPath)).toThrow('already exists')
    })
  })

  describe('open', () => {
    it('opens an existing library', () => {
      const libPath = join(tempDir, 'my-library')
      const lib1 = Library.init(libPath)
      lib1.close()

      const lib2 = Library.open(libPath)
      expect(lib2).toBeDefined()
      lib2.close()
    })

    it('throws if .banjuan does not exist', () => {
      const libPath = join(tempDir, 'empty')
      expect(() => Library.open(libPath)).toThrow('not a library')
    })
  })

  describe('scanAndImport', () => {
    it('imports all supported files preserving directory structure', async () => {
      const libPath = join(tempDir, 'my-library')
      // Pre-create files before init
      createTestFile(libPath, '机器学习/paper.pdf', Buffer.from('pdf content'))
      createTestFile(libPath, '哲学/book.txt', 'some text')
      createTestFile(libPath, 'deep/nested/dir/doc.epub', Buffer.from('epub'))
      createTestFile(libPath, 'readme.md', '# Readme')
      createTestFile(libPath, 'photo.jpg', Buffer.from('img'))
      createTestFile(libPath, 'unsupported.xyz', 'nope')

      const lib = Library.init(libPath)
      const result = await lib.scanAndImport()

      expect(result.imported).toBe(5)
      expect(result.skipped).toBe(0)

      const docs = await lib.documents.list()
      expect(docs).toHaveLength(5)

      const paths = docs.map(d => d.path).sort()
      expect(paths).toContain('机器学习/paper.pdf')
      expect(paths).toContain('哲学/book.txt')
      expect(paths).toContain('deep/nested/dir/doc.epub')

      await lib.close()
    })

    it('skips .banjuan and notes directories', async () => {
      const libPath = join(tempDir, 'lib2')
      const lib = Library.init(libPath)

      // Create files in .banjuan and notes after init
      createTestFile(libPath, 'real.pdf', Buffer.from('pdf'))
      // notes/ already exists from init
      createTestFile(libPath, 'notes/mynote.md', '---\nid: x\n---\ncontent')

      const result = await lib.scanAndImport()
      expect(result.imported).toBe(1)

      const docs = await lib.documents.list()
      expect(docs).toHaveLength(1)
      expect(docs[0].path).toBe('real.pdf')

      await lib.close()
    })

    it('skips duplicate files', async () => {
      const libPath = join(tempDir, 'lib3')
      createTestFile(libPath, 'a.pdf', Buffer.from('same content'))
      createTestFile(libPath, 'b.pdf', Buffer.from('same content'))

      const lib = Library.init(libPath)
      const result = await lib.scanAndImport()

      expect(result.imported).toBe(1)
      expect(result.skipped).toBe(1)

      await lib.close()
    })
  })

  describe('properties', () => {
    it('exposes rootPath and service accessors', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)

      expect(lib.rootPath).toBe(libPath)
      expect(lib.documents).toBeDefined()
      expect(lib.annotations).toBeDefined()
      expect(lib.notes).toBeDefined()
      expect(lib.tags).toBeDefined()
      expect(lib.search).toBeDefined()

      lib.close()
    })
  })
})
