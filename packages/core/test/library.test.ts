import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
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
