import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { Library } from '../src/library.js'

describe('NoteService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  describe('create', () => {
    it('writes .json file with meta and blocks', async () => {
      const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
      const note = await lib.notes.create({ title: 'Test Note', content: JSON.stringify(blocks) })
      expect(note.id).toBeTruthy()
      expect(note.title).toBe('Test Note')
      expect(note.path).toBe(`${note.id}.json`)
      expect(note.contentFormat).toBe('json')

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)

      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.id).toBe(note.id)
      expect(raw.meta.title).toBe('Test Note')
      expect(raw.meta.tags).toEqual([])
      expect(raw.meta.contentFormat).toBe('json')
      expect(raw.meta.createdAt).toBeTruthy()
      expect(raw.blocks).toEqual(blocks)
    })

    it('creates with folderId', async () => {
      const folder = await lib.folders.create({ name: 'My Folder' })
      const note = await lib.notes.create({ title: 'In Folder', folderId: folder.id })
      expect(note.folderId).toBe(folder.id)

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.folderId).toBe(folder.id)
    })

    it('creates with docId', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      const note = await lib.notes.create({ title: 'Doc Note', docId: doc.id })
      expect(note.docId).toBe(doc.id)
    })

    it('creates from template', async () => {
      const tpl = await lib.templates.create({
        name: 'Test Template',
        content: JSON.stringify([{ type: 'heading', content: [{ type: 'text', text: 'Template' }] }]),
      })
      const note = await lib.notes.create({ title: 'From Template', templateId: tpl.id })
      const loaded = await lib.notes.get(note.id)
      const blocks = JSON.parse(loaded!.content)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('heading')
    })

    it('handles annotation links', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'text', startOffset: 0, endOffset: 5, text: 'conte' },
        selectedText: 'conte',
      })
      const note = await lib.notes.create({
        title: 'With Ann', docId: doc.id, annotationIds: [ann.id],
        content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'refs' }] }]),
      })

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.annotationIds).toEqual([ann.id])

      const linkedAnns = await lib.notes.getAnnotations(note.id)
      expect(linkedAnns).toHaveLength(1)
      expect(linkedAnns[0].id).toBe(ann.id)
    })

    it('emits note:created event', async () => {
      let emitted: unknown = null
      lib.events.on('note:created', (data) => { emitted = data })
      const note = await lib.notes.create({ title: 'Event Test' })
      expect(emitted).not.toBeNull()
      expect((emitted as { note: { id: string } }).note.id).toBe(note.id)
    })
  })

  describe('get', () => {
    it('loads blocks from .json file', async () => {
      const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }]
      const created = await lib.notes.create({ title: 'Test', content: JSON.stringify(blocks) })
      const note = await lib.notes.get(created.id)
      expect(note).not.toBeNull()
      expect(JSON.parse(note!.content)).toEqual(blocks)
    })

    it('returns null for non-existent id', async () => {
      const note = await lib.notes.get('non-existent')
      expect(note).toBeNull()
    })
  })

  describe('list', () => {
    it('returns all notes', async () => {
      await lib.notes.create({ title: 'A' })
      await lib.notes.create({ title: 'B' })
      const notes = await lib.notes.list()
      expect(notes).toHaveLength(2)
    })

    it('filters by docId', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      await lib.notes.create({ title: 'Linked', docId: doc.id })
      await lib.notes.create({ title: 'Standalone' })
      const notes = await lib.notes.list({ docId: doc.id })
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('Linked')
    })

    it('filters by folderId', async () => {
      const folder = await lib.folders.create({ name: 'Filter Folder' })
      await lib.notes.create({ title: 'In Folder', folderId: folder.id })
      await lib.notes.create({ title: 'No Folder' })
      const notes = await lib.notes.list({ folderId: folder.id })
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('In Folder')
    })
  })

  describe('update', () => {
    it('updates title and content in .json file', async () => {
      const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }]
      const note = await lib.notes.create({ title: 'Old', content: JSON.stringify(blocks) })

      const newBlocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }]
      const updated = await lib.notes.update(note.id, { title: 'New', content: JSON.stringify(newBlocks) })
      expect(updated.title).toBe('New')
      expect(JSON.parse(updated.content)).toEqual(newBlocks)

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.title).toBe('New')
      expect(raw.blocks).toEqual(newBlocks)
      expect(raw.meta.updatedAt).toBeTruthy()
    })
  })

  describe('move', () => {
    it('moves note to a folder', async () => {
      const note = await lib.notes.create({ title: 'Movable' })
      const folder = await lib.folders.create({ name: 'Target' })
      const moved = await lib.notes.move(note.id, folder.id)
      expect(moved.folderId).toBe(folder.id)

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.folderId).toBe(folder.id)
    })

    it('moves note to root (null)', async () => {
      const folder = await lib.folders.create({ name: 'Origin' })
      const note = await lib.notes.create({ title: 'In Folder', folderId: folder.id })
      const moved = await lib.notes.move(note.id, null)
      expect(moved.folderId).toBeNull()

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.folderId).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes .json file and DB record', async () => {
      const note = await lib.notes.create({ title: 'Del' })
      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)
      await lib.notes.delete(note.id)
      expect(await lib.notes.get(note.id)).toBeNull()
      expect(existsSync(filePath)).toBe(false)
    })

    it('cleans up note_annotations on delete', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'text', startOffset: 0, endOffset: 5, text: 'conte' },
        selectedText: 'conte',
      })
      const note = await lib.notes.create({
        title: 'With Ann', docId: doc.id, annotationIds: [ann.id],
      })
      await lib.notes.delete(note.id)
      // After delete, getAnnotations on that note should return empty (note gone)
      const anns = await lib.notes.getAnnotations(note.id)
      expect(anns).toHaveLength(0)
    })
  })

  describe('getAnnotations', () => {
    it('returns linked annotations', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc2.txt', 'content2')
      const doc = await lib.documents.import('doc2.txt')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'text', startOffset: 0, endOffset: 5, text: 'conte' },
        selectedText: 'conte',
      })
      const note = await lib.notes.create({
        title: 'Note with ann', docId: doc.id, annotationIds: [ann.id],
      })
      const linkedAnns = await lib.notes.getAnnotations(note.id)
      expect(linkedAnns).toHaveLength(1)
      expect(linkedAnns[0].id).toBe(ann.id)
    })
  })
})
