import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { NodeFS } from '@banjuan/platform-node'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'
import { IndexService } from '../src/indexing/service.js'
import { FileWatcher } from '../src/indexing/watcher.js'

describe('IndexService', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('rebuildFull', () => {
    it('rebuilds SQLite from document JSON files', async () => {
      createTestFile(libPath, 'test.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('test.pdf')

      expect(await lib.documents.get(doc.id)).not.toBeNull()

      const db = (lib as any).db
      db.run('DELETE FROM documents')
      expect(await lib.documents.get(doc.id)).toBeNull()

      const indexer = new IndexService(db, libPath, new NodeFS())
      await indexer.rebuildFull()

      const restored = await lib.documents.get(doc.id)
      expect(restored).not.toBeNull()
      expect(restored!.title).toBe(doc.title)
      expect(restored!.path).toBe('test.pdf')
    })

    it('rebuilds annotations from JSON files', async () => {
      createTestFile(libPath, 'ann.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('ann.pdf')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'pdf', page: 1, rects: [], text: '' },
        content: 'test annotation',
      })

      const db = (lib as any).db
      db.run('DELETE FROM annotations')

      const indexer = new IndexService(db, libPath, new NodeFS())
      await indexer.rebuildFull()

      const restored = await lib.annotations.get(ann.id)
      expect(restored).not.toBeNull()
      expect(restored!.content).toBe('test annotation')
    })

    it('rebuilds notes from .json files', async () => {
      const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]
      const note = await lib.notes.create({ title: 'Rebuild Note', content: JSON.stringify(blocks) })

      const db = (lib as any).db
      db.run('DELETE FROM notes')

      const indexer = new IndexService(db, libPath, new NodeFS())
      await indexer.rebuildFull()

      const restored = await lib.notes.get(note.id)
      expect(restored).not.toBeNull()
      expect(restored!.title).toBe('Rebuild Note')
      expect(JSON.parse(restored!.content)).toEqual(blocks)
    })

    // Mindmaps are now notes of type 'mindmap' (.banjuan/notes/<id>.json holding
    // { meta, nodes, edges }); the old standalone `mindmaps` table is gone, so the
    // mindmap row lives in `notes`.
    it('rebuilds mindmaps with nodes and edges', async () => {
      const mm = await lib.notes.create({ title: 'Rebuild Map', type: 'mindmap' })
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'Node A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'Node B' })
      await lib.mindmaps.addEdge(mm.id, { sourceId: n1.id, targetId: n2.id })

      const db = (lib as any).db
      db.run('DELETE FROM mindmap_edges')
      db.run('DELETE FROM mindmap_nodes')
      db.run('DELETE FROM notes')

      const indexer = new IndexService(db, libPath, new NodeFS())
      await indexer.rebuildFull()

      const restored = await lib.notes.get(mm.id)
      expect(restored).not.toBeNull()
      expect(restored!.type).toBe('mindmap')
      // notes.create seeds a root node, so the map holds root + Node A + Node B
      const nodes = await lib.mindmaps.getNodes(mm.id)
      expect(nodes).toHaveLength(3)
      expect(nodes.map(n => n.id)).toEqual(expect.arrayContaining([n1.id, n2.id]))
      const edges = await lib.mindmaps.getEdges(mm.id)
      expect(edges).toHaveLength(1)
    })

    it('rebuilds tags from tags.json', async () => {
      await lib.tags.create({ name: 'TestTag', color: '#ff0000' })

      const db = (lib as any).db
      db.run('DELETE FROM tags')

      const indexer = new IndexService(db, libPath, new NodeFS())
      await indexer.rebuildFull()

      const tags = await lib.tags.list()
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('TestTag')
    })

    it('rebuilds tag assignments from entity files', async () => {
      await lib.tags.create({ name: 'Indexed' })
      createTestFile(libPath, 'tagged.txt', 'x')
      const doc = await lib.documents.import('tagged.txt')
      await lib.tags.assign(doc.id, 'document', ['Indexed'])

      const db = (lib as any).db
      db.run('DELETE FROM doc_tags')

      const indexer = new IndexService(db, libPath, new NodeFS())
      await indexer.rebuildFull()

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(1)
    })

    it('writes timestamp to db.meta.json', async () => {
      const db = (lib as any).db
      const indexer = new IndexService(db, libPath, new NodeFS())
      await indexer.rebuildFull()

      const meta = JSON.parse(readFileSync(join(libPath, '.banjuan', 'db.meta.json'), 'utf-8'))
      expect(meta.lastIndexTime).toBeDefined()
      expect(typeof meta.lastIndexTime).toBe('number')
    })
  })
})

describe('FileWatcher', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = await Library.init(libPath, testDeps())
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  it('can start and stop without errors', async () => {
    const db = (lib as any).db
    const watcher = new FileWatcher(db, libPath, new NodeFS())
    await watcher.start()
    await new Promise(resolve => setTimeout(resolve, 100))
    watcher.stop()
  })

  it('detects new annotation JSON file', async () => {
    const db = (lib as any).db
    const watcher = new FileWatcher(db, libPath, new NodeFS())
    await watcher.start()

    const annDir = join(libPath, '.banjuan', 'data', 'annotations', 'ab')
    mkdirSync(annDir, { recursive: true })
    const annData = {
      id: 'ab000000-test-file-watcher',
      docId: 'doc-id',
      type: 'highlight',
      page: 1,
      position: { type: 'pdf', page: 1, rects: [], text: '' },
      content: 'watched',
      selectedText: null,
      color: 'yellow',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writeFileSync(join(annDir, 'ab000000-test-file-watcher.json'), JSON.stringify(annData, null, 2))

    // Wait for the fs.watch event + debounce. Poll instead of a fixed sleep: under
    // parallel test load (pnpm -r) a fixed 500ms was sometimes too short.
    const find = () => db.queryOne('SELECT id FROM annotations WHERE id = ?', ['ab000000-test-file-watcher'])
    for (let waited = 0; !find() && waited < 5000; waited += 50) await new Promise(resolve => setTimeout(resolve, 50))

    watcher.stop()

    expect(find()).toBeDefined()
  })
})
