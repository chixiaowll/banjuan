import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir } from './helpers.js'

describe('MindmapService (file-first)', () => {
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
    it('creates JSON file with empty nodes and edges', async () => {
      const mm = await lib.mindmaps.create({ title: 'Test Map' })

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.id).toBe(mm.id)
      expect(fileData.title).toBe('Test Map')
      expect(fileData.nodes).toEqual([])
      expect(fileData.edges).toEqual([])
      expect(fileData.tags).toEqual([])
      expect(fileData.layout).toBe('tree')
    })
  })

  describe('addNode', () => {
    it('adds node to JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Root Node' })

      expect(node.title).toBe('Root Node')
      expect(node.mindmapId).toBe(mm.id)

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.nodes).toHaveLength(1)
      expect(fileData.nodes[0].title).toBe('Root Node')
    })
  })

  describe('updateNode', () => {
    it('updates node in JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Old' })

      const updated = await lib.mindmaps.updateNode(node.id, { title: 'New' })
      expect(updated.title).toBe('New')

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.nodes[0].title).toBe('New')
    })
  })

  describe('removeNode', () => {
    it('removes node from JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Remove Me' })

      await lib.mindmaps.removeNode(node.id)

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.nodes).toHaveLength(0)
    })
  })

  describe('addEdge', () => {
    it('adds edge to JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'B' })

      const edge = await lib.mindmaps.addEdge(mm.id, {
        sourceId: n1.id, targetId: n2.id, label: 'relates',
      })

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.edges).toHaveLength(1)
      expect(fileData.edges[0].label).toBe('relates')
    })
  })

  describe('removeEdge', () => {
    it('removes edge from JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'B' })
      const edge = await lib.mindmaps.addEdge(mm.id, { sourceId: n1.id, targetId: n2.id })

      await lib.mindmaps.removeEdge(edge.id)

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.edges).toHaveLength(0)
    })
  })

  describe('delete', () => {
    it('deletes JSON file and SQLite records', async () => {
      const mm = await lib.mindmaps.create({ title: 'Delete Me' })
      await lib.mindmaps.addNode(mm.id, { title: 'Node' })

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      await lib.mindmaps.delete(mm.id)
      expect(existsSync(jsonPath)).toBe(false)
      expect(await lib.mindmaps.get(mm.id)).toBeUndefined()
    })
  })

  describe('list and get', () => {
    it('lists mindmaps from SQLite', async () => {
      await lib.mindmaps.create({ title: 'Map A' })
      await lib.mindmaps.create({ title: 'Map B' })
      const all = await lib.mindmaps.list()
      expect(all).toHaveLength(2)
    })

    it('gets mindmap by id', async () => {
      const mm = await lib.mindmaps.create({ title: 'Find Me' })
      const found = await lib.mindmaps.get(mm.id)
      expect(found?.title).toBe('Find Me')
    })
  })
})
