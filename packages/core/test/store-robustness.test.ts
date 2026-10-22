import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { JsonStore } from '../src/storage/json-store.js'
import { Library } from '../src/library.js'
import { createTempDir, createTestFile, testDeps } from './helpers.js'

describe('JsonStore.listAll tolerates bad entries', () => {
  it('skips a corrupt JSON file (e.g. half-written by a crash) instead of failing the whole list', async () => {
    const dir = createTempDir()
    const store = new JsonStore<{ id: string }>(dir, new NodeFS())
    await store.write({ id: 'aa111' })
    mkdirSync(join(dir, 'bb'), { recursive: true })
    writeFileSync(join(dir, 'bb', 'bb222.json'), '{"id": "bb2')          // truncated
    writeFileSync(join(dir, 'bb', '.bb333.json.123-x.banjuan-tmp'), '{}')  // leftover temp file
    expect((await store.listAll()).map(d => d.id)).toEqual(['aa111'])
  })
})

describe('rebuildFull with a legacy mind-map directory', () => {
  // Legacy .banjuan/mindmaps is migrated into notes on open, but the folder stays;
  // rebuildFull used to index it into the long-gone `mindmaps` table and throw.
  it('does not fail', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    mkdirSync(join(root, '.banjuan', 'mindmaps'), { recursive: true })
    writeFileSync(join(root, '.banjuan', 'mindmaps', 'old.json'), JSON.stringify({ id: 'old-mm', title: 'Old', nodes: [], edges: [] }))
    await expect(lib.createIndexService().rebuildFull()).resolves.toBeUndefined()
  })
})

describe('TagService.syncFromFiles restores document tags', () => {
  // Document JSON lives in two-char prefix subfolders (JsonStore); scanning only
  // the top level of data/documents found nothing, so doc tags were never restored.
  it('reads tags from the sharded document store', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    await lib.tags.create({ name: '论文' })
    const doc = await lib.documents.import(createTestFile(root, 'paper.md', '# Paper'))
    await lib.tags.assign(doc.id, 'document', ['论文'])
    ;(lib as any).db.run('DELETE FROM doc_tags')
    await lib.tags.syncFromFiles()
    expect((await lib.tags.forTarget(doc.id, 'document')).map(t => t.name)).toEqual(['论文'])
  })
})
