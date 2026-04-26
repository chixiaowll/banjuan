import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('FolderService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  describe('create', () => {
    it('creates a root folder', async () => {
      const folder = await lib.folders.create({ name: 'Research' })
      expect(folder.id).toBeTruthy()
      expect(folder.name).toBe('Research')
      expect(folder.parentId).toBeNull()
      expect(folder.sortOrder).toBe(0)
      expect(folder.createdAt).toBeTruthy()
      expect(folder.updatedAt).toBeTruthy()
    })

    it('creates a nested folder', async () => {
      const parent = await lib.folders.create({ name: 'Research' })
      const child = await lib.folders.create({ name: 'Papers', parentId: parent.id })
      expect(child.parentId).toBe(parent.id)
      expect(child.name).toBe('Papers')
    })
  })

  describe('get', () => {
    it('returns folder by id', async () => {
      const created = await lib.folders.create({ name: 'Test' })
      const found = await lib.folders.get(created.id)
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Test')
    })

    it('returns null for unknown id', async () => {
      const found = await lib.folders.get('nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('getTree', () => {
    it('returns nested tree structure', async () => {
      const root1 = await lib.folders.create({ name: 'A' })
      const root2 = await lib.folders.create({ name: 'B' })
      const child1 = await lib.folders.create({ name: 'A1', parentId: root1.id })
      const child2 = await lib.folders.create({ name: 'A2', parentId: root1.id })
      const grandchild = await lib.folders.create({ name: 'A1a', parentId: child1.id })

      const tree = await lib.folders.getTree()
      expect(tree).toHaveLength(2)

      const a = tree.find(f => f.name === 'A')!
      expect(a.children).toHaveLength(2)

      const a1 = a.children!.find(f => f.name === 'A1')!
      expect(a1.children).toHaveLength(1)
      expect(a1.children![0].name).toBe('A1a')

      const b = tree.find(f => f.name === 'B')!
      expect(b.children).toHaveLength(0)
    })

    it('returns empty array when no folders exist', async () => {
      const tree = await lib.folders.getTree()
      expect(tree).toEqual([])
    })
  })

  describe('update', () => {
    it('updates folder name', async () => {
      const folder = await lib.folders.create({ name: 'Old Name' })
      // Small delay to ensure updatedAt differs
      await new Promise(r => setTimeout(r, 10))
      const updated = await lib.folders.update(folder.id, { name: 'New Name' })
      expect(updated.name).toBe('New Name')
      expect(updated.updatedAt).not.toBe(folder.createdAt)
    })

    it('moves folder to new parent', async () => {
      const parent1 = await lib.folders.create({ name: 'Parent 1' })
      const parent2 = await lib.folders.create({ name: 'Parent 2' })
      const child = await lib.folders.create({ name: 'Child', parentId: parent1.id })

      const moved = await lib.folders.update(child.id, { parentId: parent2.id })
      expect(moved.parentId).toBe(parent2.id)

      const tree = await lib.folders.getTree()
      const p1 = tree.find(f => f.name === 'Parent 1')!
      const p2 = tree.find(f => f.name === 'Parent 2')!
      expect(p1.children).toHaveLength(0)
      expect(p2.children).toHaveLength(1)
    })

    it('updates sort order', async () => {
      const folder = await lib.folders.create({ name: 'Folder' })
      const updated = await lib.folders.update(folder.id, { sortOrder: 5 })
      expect(updated.sortOrder).toBe(5)
    })
  })

  describe('delete', () => {
    it('deletes a folder and unlinks notes', async () => {
      const folder = await lib.folders.create({ name: 'To Delete' })
      const note = await lib.notes.create({ title: 'Note in folder', folderId: folder.id })

      await lib.folders.delete(folder.id)

      const deleted = await lib.folders.get(folder.id)
      expect(deleted).toBeNull()

      // Note should still exist but with folder_id = null
      const updatedNote = await lib.notes.get(note.id)
      expect(updatedNote).not.toBeNull()
      expect(updatedNote!.folderId).toBeNull()
    })

    it('unlinks child folders when parent is deleted', async () => {
      const parent = await lib.folders.create({ name: 'Parent' })
      const child = await lib.folders.create({ name: 'Child', parentId: parent.id })

      await lib.folders.delete(parent.id)

      const orphan = await lib.folders.get(child.id)
      expect(orphan).not.toBeNull()
      expect(orphan!.parentId).toBeNull()
    })
  })

  describe('events', () => {
    it('emits folder:created event', async () => {
      const events: unknown[] = []
      lib.events.on('folder:created', (e) => events.push(e))

      const folder = await lib.folders.create({ name: 'Test' })
      expect(events).toHaveLength(1)
      expect((events[0] as { folder: { id: string } }).folder.id).toBe(folder.id)
    })

    it('emits folder:updated event', async () => {
      const events: unknown[] = []
      lib.events.on('folder:updated', (e) => events.push(e))

      const folder = await lib.folders.create({ name: 'Test' })
      await lib.folders.update(folder.id, { name: 'Updated' })
      expect(events).toHaveLength(1)
    })

    it('emits folder:deleted event', async () => {
      const events: unknown[] = []
      lib.events.on('folder:deleted', (e) => events.push(e))

      const folder = await lib.folders.create({ name: 'Test' })
      await lib.folders.delete(folder.id)
      expect(events).toHaveLength(1)
      expect((events[0] as { id: string }).id).toBe(folder.id)
    })
  })
})
