import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'
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
    it('creates .banjuan directory structure', async () => {
      const libPath = join(tempDir, 'my-library')
      const lib = await Library.init(libPath, testDeps())

      expect(existsSync(join(libPath, '.banjuan', 'db.sqlite'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'config.json'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'data', 'documents'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'data', 'annotations'))).toBe(true)
      // Mind maps are now notes (type='mindmap') stored under .banjuan/notes —
      // the old dedicated data/mindmaps directory is no longer created.
      expect(existsSync(join(libPath, '.banjuan', 'data', 'mindmaps'))).toBe(false)
      expect(existsSync(join(libPath, '.banjuan', 'stubs'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'notes'))).toBe(true)

      await lib.close()
    })

    it('does not create documents/ directory at root level', async () => {
      const libPath = join(tempDir, 'my-library')
      const lib = await Library.init(libPath, testDeps())

      expect(existsSync(join(libPath, 'documents'))).toBe(false)

      await lib.close()
    })

    it('creates tags.json with empty array', async () => {
      const libPath = join(tempDir, 'my-library')
      const lib = await Library.init(libPath, testDeps())

      const tagsPath = join(libPath, '.banjuan', 'tags.json')
      expect(existsSync(tagsPath)).toBe(true)
      expect(readFileSync(tagsPath, 'utf-8')).toBe('[]')

      await lib.close()
    })

    it('throws if directory already has .banjuan', async () => {
      const libPath = join(tempDir, 'my-library')
      const lib = await Library.init(libPath, testDeps())
      await lib.close()

      await expect(Library.init(libPath, testDeps())).rejects.toThrow('already exists')
    })
  })

  describe('open', () => {
    it('opens an existing library', async () => {
      const libPath = join(tempDir, 'my-library')
      const lib1 = await Library.init(libPath, testDeps())
      await lib1.close()

      const lib2 = await Library.open(libPath, testDeps())
      expect(lib2).toBeDefined()
      await lib2.close()
    })

    it('throws if .banjuan does not exist', async () => {
      const libPath = join(tempDir, 'empty')
      await expect(Library.open(libPath, testDeps())).rejects.toThrow('not a library')
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
      createTestFile(libPath, 'data.xyz', 'nope')

      const lib = await Library.init(libPath, testDeps())
      const result = await lib.scanAndImport()

      expect(result.imported).toBe(6)
      expect(result.skipped).toBe(0)

      const docs = await lib.documents.list()
      expect(docs).toHaveLength(6)

      const paths = docs.map(d => d.path).sort()
      expect(paths).toContain('机器学习/paper.pdf')
      expect(paths).toContain('哲学/book.txt')
      expect(paths).toContain('deep/nested/dir/doc.epub')

      await lib.close()
    })

    it('skips .banjuan directory', async () => {
      const libPath = join(tempDir, 'lib2')
      const lib = await Library.init(libPath, testDeps())

      createTestFile(libPath, 'real.pdf', Buffer.from('pdf'))

      const result = await lib.scanAndImport()
      expect(result.imported).toBe(1)

      const docs = await lib.documents.list()
      expect(docs).toHaveLength(1)
      expect(docs[0].path).toBe('real.pdf')

      await lib.close()
    })

    it('imports files with same content at different paths', async () => {
      const libPath = join(tempDir, 'lib3')
      createTestFile(libPath, 'a.pdf', Buffer.from('same content'))
      createTestFile(libPath, 'b.pdf', Buffer.from('same content'))

      const lib = await Library.init(libPath, testDeps())
      const result = await lib.scanAndImport()

      expect(result.imported).toBe(2)
      expect(result.skipped).toBe(0)

      await lib.close()
    })
  })

  describe('properties', () => {
    it('exposes rootPath and service accessors', async () => {
      const libPath = join(tempDir, 'my-library')
      const lib = await Library.init(libPath, testDeps())

      expect(lib.rootPath).toBe(libPath)
      expect(lib.documents).toBeDefined()
      expect(lib.annotations).toBeDefined()
      expect(lib.notes).toBeDefined()
      expect(lib.tags).toBeDefined()
      expect(lib.search).toBeDefined()

      await lib.close()
    })
  })
})
