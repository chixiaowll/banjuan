import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('MindmapService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  it('creates a mindmap', async () => {
    const mm = await lib.mindmaps.create({ title: 'My Map' })
    expect(mm.id).toBeTruthy()
    expect(mm.title).toBe('My Map')
    expect(mm.layout).toBe('tree')
    expect(mm.docId).toBeNull()
  })

  it('lists mindmaps', async () => {
    await lib.mindmaps.create({ title: 'Map A' })
    await lib.mindmaps.create({ title: 'Map B' })
    const list = await lib.mindmaps.list()
    expect(list).toHaveLength(2)
  })

  it('adds and retrieves nodes', async () => {
    const mm = await lib.mindmaps.create({ title: 'Node Test' })
    const root = await lib.mindmaps.addNode(mm.id, { title: 'Root' })
    const child = await lib.mindmaps.addNode(mm.id, { title: 'Child', parentId: root.id })

    expect(root.parentId).toBeNull()
    expect(child.parentId).toBe(root.id)

    const nodes = await lib.mindmaps.getNodes(mm.id)
    expect(nodes).toHaveLength(2)
  })

  it('updates a node', async () => {
    const mm = await lib.mindmaps.create({ title: 'Update Test' })
    const node = await lib.mindmaps.addNode(mm.id, { title: 'Original' })
    const updated = await lib.mindmaps.updateNode(node.id, { title: 'Renamed', color: 'red' })

    expect(updated.title).toBe('Renamed')
    expect(updated.color).toBe('red')
  })

  it('removes a node and its children (cascade)', async () => {
    const mm = await lib.mindmaps.create({ title: 'Cascade Test' })
    const root = await lib.mindmaps.addNode(mm.id, { title: 'Root' })
    await lib.mindmaps.addNode(mm.id, { title: 'Child', parentId: root.id })

    await lib.mindmaps.removeNode(root.id)
    const nodes = await lib.mindmaps.getNodes(mm.id)
    expect(nodes).toHaveLength(0)
  })

  it('adds and retrieves edges', async () => {
    const mm = await lib.mindmaps.create({ title: 'Edge Test' })
    const n1 = await lib.mindmaps.addNode(mm.id, { title: 'A' })
    const n2 = await lib.mindmaps.addNode(mm.id, { title: 'B' })
    const edge = await lib.mindmaps.addEdge(mm.id, {
      sourceId: n1.id,
      targetId: n2.id,
      label: 'relates',
    })

    expect(edge.label).toBe('relates')

    const edges = await lib.mindmaps.getEdges(mm.id)
    expect(edges).toHaveLength(1)
    expect(edges[0].sourceId).toBe(n1.id)
    expect(edges[0].targetId).toBe(n2.id)
  })

  it('deletes a mindmap and cascades', async () => {
    const mm = await lib.mindmaps.create({ title: 'Delete Test' })
    const node = await lib.mindmaps.addNode(mm.id, { title: 'Orphan' })

    await lib.mindmaps.delete(mm.id)

    const got = await lib.mindmaps.get(mm.id)
    expect(got).toBeUndefined()

    const nodes = await lib.mindmaps.getNodes(mm.id)
    expect(nodes).toHaveLength(0)
  })

  it('updates a mindmap', async () => {
    const mm = await lib.mindmaps.create({ title: 'Old Title' })
    const updated = await lib.mindmaps.update(mm.id, { title: 'New Title', layout: 'radial' })

    expect(updated.title).toBe('New Title')
    expect(updated.layout).toBe('radial')
  })
})
