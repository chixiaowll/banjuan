import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import type { Note } from '../src/types.js'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'

// Mind maps are notes with type='mindmap': NoteService creates/updates/deletes
// them (stored as .banjuan/notes/<path>.json = { meta, nodes, edges }), and
// MindmapService edits their nodes/edges in both the JSON file and SQLite.
describe('Mind maps (mindmap notes, file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  const createMap = (title: string) => lib.notes.create({ title, type: 'mindmap' })
  const mapPath = (note: Note) => join(libPath, '.banjuan', 'notes', note.path)
  const readMapFile = (note: Note) => JSON.parse(readFileSync(mapPath(note), 'utf-8'))
  /** The central topic every new mind map starts with. */
  const centralNode = async (note: Note) => (await lib.mindmaps.getNodes(note.id)).find(n => n.parentId === null)!

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('creates JSON file with a central root node and no edges', async () => {
      const mm = await createMap('Test Map')

      expect(mm.type).toBe('mindmap')
      expect(mm.path).toBe(`${mm.id}.json`)
      expect(existsSync(mapPath(mm))).toBe(true)

      const fileData = readMapFile(mm)
      expect(fileData.meta.id).toBe(mm.id)
      expect(fileData.meta.title).toBe('Test Map')
      expect(fileData.meta.type).toBe('mindmap')
      expect(fileData.meta.tags).toEqual([])
      expect(fileData.meta.typeMeta.layout).toBe('mindmap')
      expect(fileData.nodes).toHaveLength(1)
      expect(fileData.nodes[0].title).toBe('Test Map')
      expect(fileData.nodes[0].parentId).toBeNull()
      expect(fileData.edges).toEqual([])

      const nodes = await lib.mindmaps.getNodes(mm.id)
      expect(nodes.map(n => n.id)).toEqual([fileData.nodes[0].id])
    })
  })

  describe('addNode', () => {
    it('adds node to JSON file and SQLite', async () => {
      const mm = await createMap('Map')
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Root Node' })

      expect(node.title).toBe('Root Node')
      expect(node.mindmapId).toBe(mm.id)

      const fileData = readMapFile(mm)
      expect(fileData.nodes).toHaveLength(2) // central topic + new node
      expect(fileData.nodes.find((n: any) => n.id === node.id)?.title).toBe('Root Node')

      const nodes = await lib.mindmaps.getNodes(mm.id)
      expect(nodes.find(n => n.id === node.id)?.title).toBe('Root Node')
    })
  })

  describe('updateNode', () => {
    it('updates node in JSON file and SQLite', async () => {
      const mm = await createMap('Map')
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Old' })

      const updated = await lib.mindmaps.updateNode(node.id, { title: 'New' })
      expect(updated.title).toBe('New')

      const fileData = readMapFile(mm)
      expect(fileData.nodes.find((n: any) => n.id === node.id)?.title).toBe('New')
    })
  })

  describe('removeNode', () => {
    it('removes node from JSON file and SQLite', async () => {
      const mm = await createMap('Map')
      const central = await centralNode(mm)
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Remove Me' })

      await lib.mindmaps.removeNode(node.id)

      const fileData = readMapFile(mm)
      expect(fileData.nodes.map((n: any) => n.id)).toEqual([central.id])
      const nodes = await lib.mindmaps.getNodes(mm.id)
      expect(nodes.map(n => n.id)).toEqual([central.id])
    })

    it('recursively removes children and related edges from both JSON and SQLite', async () => {
      const mm = await createMap('Cascade')
      const central = await centralNode(mm)
      const root = await lib.mindmaps.addNode(mm.id, { title: 'Root', parentId: central.id })
      const child = await lib.mindmaps.addNode(mm.id, { title: 'Child', parentId: root.id })
      const grandchild = await lib.mindmaps.addNode(mm.id, { title: 'Grandchild', parentId: child.id })
      await lib.mindmaps.addEdge(mm.id, { sourceId: root.id, targetId: child.id, label: 'e1' })
      await lib.mindmaps.addEdge(mm.id, { sourceId: child.id, targetId: grandchild.id, label: 'e2' })

      await lib.mindmaps.removeNode(root.id)

      // Only the (untouched) central topic remains.
      const fileData = readMapFile(mm)
      expect(fileData.nodes.map((n: any) => n.id)).toEqual([central.id])
      expect(fileData.edges).toHaveLength(0)

      const nodes = await lib.mindmaps.getNodes(mm.id)
      expect(nodes.map(n => n.id)).toEqual([central.id])
      const edges = await lib.mindmaps.getEdges(mm.id)
      expect(edges).toHaveLength(0)
    })
  })

  describe('addEdge', () => {
    it('adds edge to JSON file and SQLite', async () => {
      const mm = await createMap('Map')
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'B' })

      const edge = await lib.mindmaps.addEdge(mm.id, {
        sourceId: n1.id, targetId: n2.id, label: 'relates',
      })

      const fileData = readMapFile(mm)
      expect(fileData.edges).toHaveLength(1)
      expect(fileData.edges[0].label).toBe('relates')

      const edges = await lib.mindmaps.getEdges(mm.id)
      expect(edges.map(e => e.id)).toEqual([edge.id])
    })
  })

  describe('removeEdge', () => {
    it('removes edge from JSON file and SQLite', async () => {
      const mm = await createMap('Map')
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'B' })
      const edge = await lib.mindmaps.addEdge(mm.id, { sourceId: n1.id, targetId: n2.id })

      await lib.mindmaps.removeEdge(edge.id)

      const fileData = readMapFile(mm)
      expect(fileData.edges).toHaveLength(0)
      expect(await lib.mindmaps.getEdges(mm.id)).toHaveLength(0)
    })
  })

  describe('delete', () => {
    it('deletes JSON file and SQLite records', async () => {
      const mm = await createMap('Delete Me')
      await lib.mindmaps.addNode(mm.id, { title: 'Node' })

      expect(existsSync(mapPath(mm))).toBe(true)

      await lib.notes.delete(mm.id)
      expect(existsSync(mapPath(mm))).toBe(false)
      expect(await lib.notes.get(mm.id)).toBeNull()
      expect(await lib.mindmaps.getNodes(mm.id)).toHaveLength(0)
    })
  })

  describe('update', () => {
    it('updates both JSON file and SQLite', async () => {
      const mm = await createMap('Old Title')
      const updated = await lib.notes.update(mm.id, {
        title: 'New Title',
        typeMeta: { ...mm.typeMeta, layout: 'radial' },
      })

      expect(updated.title).toBe('New Title')
      expect(updated.typeMeta?.layout).toBe('radial')

      const fileData = readMapFile(mm)
      expect(fileData.meta.title).toBe('New Title')
      expect(fileData.meta.typeMeta.layout).toBe('radial')
    })
  })

  describe('list and get', () => {
    it('lists mindmaps from SQLite', async () => {
      await createMap('Map A')
      await createMap('Map B')
      await lib.notes.create({ title: 'Plain note' })
      const all = await lib.notes.list({ type: 'mindmap' })
      expect(all).toHaveLength(2)
    })

    it('gets mindmap by id', async () => {
      const mm = await createMap('Find Me')
      const found = await lib.notes.get(mm.id)
      expect(found?.title).toBe('Find Me')
    })
  })
})
