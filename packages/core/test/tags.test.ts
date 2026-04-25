import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'

describe('TagService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('adds tag to tags.json and SQLite', async () => {
      const tag = await lib.tags.create({ name: 'Machine Learning', color: '#89b4fa' })

      expect(tag.name).toBe('Machine Learning')
      expect(tag.color).toBe('#89b4fa')

      const tagsJson = JSON.parse(readFileSync(join(libPath, '.banjuan', 'tags.json'), 'utf-8'))
      expect(tagsJson).toHaveLength(1)
      expect(tagsJson[0].name).toBe('Machine Learning')
    })

    it('lists tags from SQLite', async () => {
      await lib.tags.create({ name: 'B Tag' })
      await lib.tags.create({ name: 'A Tag' })

      const tags = await lib.tags.list()
      expect(tags).toHaveLength(2)
      expect(tags[0].name).toBe('A Tag')
    })
  })

  describe('assign to document', () => {
    it('embeds tag names in document JSON file', async () => {
      await lib.tags.create({ name: 'AI' })
      createTestFile(libPath, 'test.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('test.pdf')

      await lib.tags.assign(doc.id, 'document', ['AI'])

      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).toContain('AI')

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('AI')
    })

    it('emits tag:assigned event', async () => {
      await lib.tags.create({ name: 'Test' })
      createTestFile(libPath, 'ev.txt', 'x')
      const doc = await lib.documents.import('ev.txt')

      let emitted: any = null
      lib.events.on('tag:assigned', (data) => { emitted = data })
      await lib.tags.assign(doc.id, 'document', ['Test'])
      expect(emitted?.tagName).toBe('Test')
    })
  })

  describe('assign to note', () => {
    it('embeds tag names in note frontmatter', async () => {
      await lib.tags.create({ name: 'Research' })
      const note = await lib.notes.create({ title: 'My Note', content: 'content' })

      await lib.tags.assign(note.id, 'note', ['Research'])

      const raw = readFileSync(join(libPath, 'notes', note.path), 'utf-8')
      expect(raw).toContain('Research')

      const tags = await lib.tags.forTarget(note.id, 'note')
      expect(tags).toHaveLength(1)
    })
  })

  describe('assign to mindmap', () => {
    it('embeds tag names in mindmap JSON file', async () => {
      await lib.tags.create({ name: 'Concepts' })
      const mm = await lib.mindmaps.create({ title: 'Map' })

      await lib.tags.assign(mm.id, 'mindmap', ['Concepts'])

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).toContain('Concepts')
    })
  })

  describe('unassign', () => {
    it('removes tag from document JSON and SQLite', async () => {
      await lib.tags.create({ name: 'Remove' })
      createTestFile(libPath, 'un.txt', 'x')
      const doc = await lib.documents.import('un.txt')
      await lib.tags.assign(doc.id, 'document', ['Remove'])

      await lib.tags.unassign(doc.id, 'document', 'Remove')

      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).not.toContain('Remove')

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(0)
    })

    it('removes tag from note frontmatter and SQLite', async () => {
      await lib.tags.create({ name: 'Gone' })
      const note = await lib.notes.create({ title: 'Unassign Note', content: 'c' })
      await lib.tags.assign(note.id, 'note', ['Gone'])

      await lib.tags.unassign(note.id, 'note', 'Gone')

      const raw = readFileSync(join(libPath, 'notes', note.path), 'utf-8')
      expect(raw).not.toContain('Gone')
      const tags = await lib.tags.forTarget(note.id, 'note')
      expect(tags).toHaveLength(0)
    })

    it('removes tag from mindmap JSON and SQLite', async () => {
      await lib.tags.create({ name: 'Drop' })
      const mm = await lib.mindmaps.create({ title: 'Unmap' })
      await lib.tags.assign(mm.id, 'mindmap', ['Drop'])

      await lib.tags.unassign(mm.id, 'mindmap', 'Drop')

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).not.toContain('Drop')
      const tags = await lib.tags.forTarget(mm.id, 'mindmap')
      expect(tags).toHaveLength(0)
    })

    it('emits tag:removed event', async () => {
      await lib.tags.create({ name: 'Ev' })
      createTestFile(libPath, 'ev2.txt', 'x')
      const doc = await lib.documents.import('ev2.txt')
      await lib.tags.assign(doc.id, 'document', ['Ev'])

      let emitted: any = null
      lib.events.on('tag:removed', (data) => { emitted = data })
      await lib.tags.unassign(doc.id, 'document', 'Ev')
      expect(emitted?.tagName).toBe('Ev')
    })
  })

  describe('forTarget', () => {
    it('returns tags for a document', async () => {
      await lib.tags.create({ name: 'A' })
      await lib.tags.create({ name: 'B' })
      createTestFile(libPath, 'ft.txt', 'x')
      const doc = await lib.documents.import('ft.txt')
      await lib.tags.assign(doc.id, 'document', ['A', 'B'])

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(2)
    })
  })
})
