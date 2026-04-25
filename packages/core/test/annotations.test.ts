import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'
import type { AnnotationCreateInput, PdfPosition } from '../src/types.js'

describe('AnnotationService', () => {
  let tempDir: string
  let lib: Library
  let docId: string

  beforeEach(async () => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
    mkdirSync(join(lib.rootPath, 'documents'), { recursive: true })
    const file = join(tempDir, 'test.txt')
    writeFileSync(file, 'test content')
    const doc = await lib.documents.import(file)
    docId = doc.id
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  const makeInput = (overrides?: Partial<AnnotationCreateInput>): AnnotationCreateInput => ({
    docId,
    type: 'highlight',
    page: 1,
    position: { type: 'pdf', page: 1, rects: [{ x: 10, y: 20, w: 100, h: 14 }], text: 'highlighted text' } satisfies PdfPosition,
    selectedText: 'highlighted text',
    color: 'yellow',
    ...overrides,
  })

  describe('create', () => {
    it('creates an annotation', async () => {
      const ann = await lib.annotations.create(makeInput())
      expect(ann.id).toBeTruthy()
      expect(ann.docId).toBe(docId)
      expect(ann.type).toBe('highlight')
      expect(ann.position.type).toBe('pdf')
    })
  })

  describe('list', () => {
    it('lists annotations for a document', async () => {
      await lib.annotations.create(makeInput({ page: 1 }))
      await lib.annotations.create(makeInput({ page: 2 }))
      const anns = await lib.annotations.list({ docId })
      expect(anns).toHaveLength(2)
    })

    it('filters by page', async () => {
      await lib.annotations.create(makeInput({ page: 1 }))
      await lib.annotations.create(makeInput({ page: 2 }))
      const anns = await lib.annotations.list({ docId, page: 1 })
      expect(anns).toHaveLength(1)
      expect(anns[0].page).toBe(1)
    })
  })

  describe('update', () => {
    it('updates color', async () => {
      const ann = await lib.annotations.create(makeInput())
      const updated = await lib.annotations.update(ann.id, { color: 'red' })
      expect(updated.color).toBe('red')
    })

    it('updates content', async () => {
      const ann = await lib.annotations.create(makeInput())
      const updated = await lib.annotations.update(ann.id, { content: 'my note' })
      expect(updated.content).toBe('my note')
    })
  })

  describe('delete', () => {
    it('removes an annotation', async () => {
      const ann = await lib.annotations.create(makeInput())
      await lib.annotations.delete(ann.id)
      const anns = await lib.annotations.list({ docId })
      expect(anns).toHaveLength(0)
    })
  })
})
