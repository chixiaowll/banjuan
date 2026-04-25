import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { Library } from '../src/library.js'
import { parseFrontmatter } from '../src/storage/frontmatter.js'

describe('NoteService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  describe('create', () => {
    it('writes .md with frontmatter and user-friendly filename', async () => {
      const note = await lib.notes.create({ title: 'Attention 论文笔记', content: '# Hello\n\nThis is a note.' })
      expect(note.id).toBeTruthy()
      expect(note.title).toBe('Attention 论文笔记')
      expect(note.path).toBe('Attention 论文笔记.md')

      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)

      const raw = readFileSync(filePath, 'utf-8')
      const { data, content } = parseFrontmatter(raw)
      expect(content).toBe('# Hello\n\nThis is a note.')
      expect(data.id).toBe(note.id)
      expect(data.title).toBe('Attention 论文笔记')
      expect(data.tags).toEqual([])
      expect(data.createdAt).toBeTruthy()
      expect(data.updatedAt).toBeTruthy()
    })

    it('stores frontmatter with docId and annotationIds', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'text', startOffset: 0, endOffset: 5, text: 'conte' },
        selectedText: 'conte',
      })
      const note = await lib.notes.create({
        title: 'Doc Note', docId: doc.id, annotationIds: [ann.id], content: 'refs annotation',
      })

      const filePath = join(lib.rootPath, 'notes', note.path)
      const raw = readFileSync(filePath, 'utf-8')
      const { data } = parseFrontmatter(raw)
      expect(data.docId).toBe(doc.id)
      expect(data.annotationIds).toEqual([ann.id])
    })

    it('handles filename conflicts by appending number', async () => {
      const note1 = await lib.notes.create({ title: 'Same Title', content: 'first' })
      const note2 = await lib.notes.create({ title: 'Same Title', content: 'second' })

      expect(note1.path).toBe('Same Title.md')
      expect(note2.path).toBe('Same Title 2.md')

      expect(existsSync(join(lib.rootPath, 'notes', note1.path))).toBe(true)
      expect(existsSync(join(lib.rootPath, 'notes', note2.path))).toBe(true)
    })

    it('emits note:created event', async () => {
      let emitted: unknown = null
      lib.events.on('note:created', (data) => { emitted = data })
      const note = await lib.notes.create({ title: 'Event Test', content: 'hello' })
      expect(emitted).not.toBeNull()
      expect((emitted as { note: { id: string } }).note.id).toBe(note.id)
    })
  })

  describe('get', () => {
    it('loads content from .md file by parsing frontmatter', async () => {
      const created = await lib.notes.create({ title: 'Test', content: '# Test content' })
      const note = await lib.notes.get(created.id)
      expect(note).not.toBeNull()
      expect(note!.content).toBe('# Test content')
    })
  })

  describe('list', () => {
    it('returns all notes', async () => {
      await lib.notes.create({ title: 'A', content: 'a' })
      await lib.notes.create({ title: 'B', content: 'b' })
      const notes = await lib.notes.list()
      expect(notes).toHaveLength(2)
    })

    it('filters by docId', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      await lib.notes.create({ title: 'Linked', docId: doc.id, content: '' })
      await lib.notes.create({ title: 'Standalone', content: '' })
      const notes = await lib.notes.list({ docId: doc.id })
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('Linked')
    })
  })

  describe('update', () => {
    it('updates frontmatter title and content in .md file', async () => {
      const note = await lib.notes.create({ title: 'Old', content: 'old content' })
      const updated = await lib.notes.update(note.id, { title: 'New', content: 'new content' })
      expect(updated.title).toBe('New')
      expect(updated.content).toBe('new content')

      const filePath = join(lib.rootPath, 'notes', note.path)
      const raw = readFileSync(filePath, 'utf-8')
      const { data, content } = parseFrontmatter(raw)
      expect(data.title).toBe('New')
      expect(content).toBe('new content')
      expect(data.updatedAt).toBeTruthy()
    })
  })

  describe('delete', () => {
    it('removes .md file and SQLite record', async () => {
      const note = await lib.notes.create({ title: 'Del', content: 'bye' })
      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)
      await lib.notes.delete(note.id)
      expect(await lib.notes.get(note.id)).toBeNull()
      expect(existsSync(filePath)).toBe(false)
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
      const note = await lib.notes.create({ title: 'Note with ann', docId: doc.id, annotationIds: [ann.id], content: 'refs annotation' })
      const linkedAnns = await lib.notes.getAnnotations(note.id)
      expect(linkedAnns).toHaveLength(1)
      expect(linkedAnns[0].id).toBe(ann.id)
    })
  })
})
