import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { Library } from '../src/library.js'
import type { AnnotationCreateInput, AnnotationFileData, PdfPosition } from '../src/types.js'

describe('AnnotationService', () => {
  let tempDir: string
  let libPath: string
  let lib: Library
  let docId: string

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
    createTestFile(libPath, 'test.pdf', Buffer.from('fake pdf'))
    const doc = await lib.documents.import('test.pdf')
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
    it('writes JSON file and indexes in SQLite', async () => {
      const ann = await lib.annotations.create(makeInput())
      expect(ann.id).toBeTruthy()
      expect(ann.docId).toBe(docId)
      expect(ann.type).toBe('highlight')
      expect(ann.position.type).toBe('pdf')

      // Verify JSON file on disk
      const prefix = ann.id.slice(0, 2)
      const filePath = join(libPath, '.banjuan', 'data', 'annotations', prefix, `${ann.id}.json`)
      expect(existsSync(filePath)).toBe(true)
      const fileData: AnnotationFileData = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(fileData.id).toBe(ann.id)
      expect(fileData.docId).toBe(docId)
      expect(fileData.color).toBe('yellow')

      // Verify SQLite
      const fetched = await lib.annotations.get(ann.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(ann.id)
    })

    it('emits annotation:created event', async () => {
      const events: unknown[] = []
      lib.events.on('annotation:created', (data) => events.push(data))
      const ann = await lib.annotations.create(makeInput())
      expect(events).toHaveLength(1)
      expect((events[0] as { annotation: { id: string } }).annotation.id).toBe(ann.id)
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
    it('modifies both JSON file and SQLite', async () => {
      const ann = await lib.annotations.create(makeInput())
      const updated = await lib.annotations.update(ann.id, { color: 'red', content: 'my note' })
      expect(updated.color).toBe('red')
      expect(updated.content).toBe('my note')

      // Verify JSON file updated
      const prefix = ann.id.slice(0, 2)
      const filePath = join(libPath, '.banjuan', 'data', 'annotations', prefix, `${ann.id}.json`)
      const fileData: AnnotationFileData = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(fileData.color).toBe('red')
      expect(fileData.content).toBe('my note')

      // Verify SQLite updated
      const fetched = await lib.annotations.get(ann.id)
      expect(fetched!.color).toBe('red')
      expect(fetched!.content).toBe('my note')
    })
  })

  describe('delete', () => {
    it('removes JSON file and SQLite row', async () => {
      const ann = await lib.annotations.create(makeInput())
      const prefix = ann.id.slice(0, 2)
      const filePath = join(libPath, '.banjuan', 'data', 'annotations', prefix, `${ann.id}.json`)
      expect(existsSync(filePath)).toBe(true)

      await lib.annotations.delete(ann.id)

      // JSON file removed
      expect(existsSync(filePath)).toBe(false)

      // SQLite row removed
      const anns = await lib.annotations.list({ docId })
      expect(anns).toHaveLength(0)
    })
  })
})
