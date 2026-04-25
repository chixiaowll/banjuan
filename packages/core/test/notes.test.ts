import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('NoteService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
    mkdirSync(join(lib.rootPath, 'documents'), { recursive: true })
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  describe('create', () => {
    it('creates a note with markdown file', async () => {
      const note = await lib.notes.create({ title: 'My Note', content: '# Hello\n\nThis is a note.' })
      expect(note.id).toBeTruthy()
      expect(note.title).toBe('My Note')
      expect(note.path).toContain('.md')
      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, 'utf-8')).toBe('# Hello\n\nThis is a note.')
    })

    it('creates a note linked to a document', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)
      const note = await lib.notes.create({ title: 'Doc Note', docId: doc.id, content: 'Notes about the doc' })
      expect(note.docId).toBe(doc.id)
    })

    it('links annotations to the note', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)
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

  describe('list', () => {
    it('returns all notes', async () => {
      await lib.notes.create({ title: 'A', content: 'a' })
      await lib.notes.create({ title: 'B', content: 'b' })
      const notes = await lib.notes.list()
      expect(notes).toHaveLength(2)
    })

    it('filters by docId', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)
      await lib.notes.create({ title: 'Linked', docId: doc.id, content: '' })
      await lib.notes.create({ title: 'Standalone', content: '' })
      const notes = await lib.notes.list({ docId: doc.id })
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('Linked')
    })
  })

  describe('get', () => {
    it('returns note with content loaded from file', async () => {
      const created = await lib.notes.create({ title: 'Test', content: '# Test content' })
      const note = await lib.notes.get(created.id)
      expect(note).not.toBeNull()
      expect(note!.content).toBe('# Test content')
    })
  })

  describe('update', () => {
    it('updates content on disk and title in DB', async () => {
      const note = await lib.notes.create({ title: 'Old', content: 'old content' })
      const updated = await lib.notes.update(note.id, { title: 'New', content: 'new content' })
      expect(updated.title).toBe('New')
      expect(updated.content).toBe('new content')
      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(readFileSync(filePath, 'utf-8')).toBe('new content')
    })
  })

  describe('delete', () => {
    it('removes from DB and filesystem', async () => {
      const note = await lib.notes.create({ title: 'Del', content: 'bye' })
      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)
      await lib.notes.delete(note.id)
      expect(await lib.notes.get(note.id)).toBeNull()
      expect(existsSync(filePath)).toBe(false)
    })
  })
})
