import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, createTestFile, testDeps } from './helpers.js'

async function fresh() {
  const root = join(createTempDir(), 'lib')
  return { root, lib: await Library.init(root, testDeps()) }
}

// import() used to read EVERY document JSON (store.listAll) per file: importing
// N files was O(N²) reads — minutes of a frozen main process for a large library.
describe('document import scales', () => {
  it('importMany reads the document store at most once for the whole batch', async () => {
    const { root, lib } = await fresh()
    const files = Array.from({ length: 40 }, (_, i) => createTestFile(root, `papers/p${i}.md`, `# P${i}`))
    const store = (lib.documents as any).store
    const spy = vi.spyOn(store, 'listAll')
    const results = await lib.documents.importMany(files)
    expect(results.filter(r => r.doc).length).toBe(40)
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1)
    expect((await lib.documents.list()).length).toBe(40)
  })

  it('reuses the metadata of a document whose JSON has a legacy (non path-derived) id', async () => {
    const { root, lib } = await fresh()
    createTestFile(root, 'old.md', '# Old')
    const store = (lib.documents as any).store
    await store.write({ id: 'legacy0000000000000000000000000a', title: 'Kept title', authors: ['A'], path: 'old.md', type: 'markdown', hash: 'h', tags: [], metadata: {}, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' })
    const [r] = await lib.documents.importMany([join(root, 'old.md')])
    expect(r.doc?.id).toBe('legacy0000000000000000000000000a')
    expect(r.doc?.title).toBe('Kept title')
  })

  it('a single re-import whose JSON uses the path-derived id needs no full scan', async () => {
    const { root, lib } = await fresh()
    const f = createTestFile(root, 'again.md', '# Again')
    const first = await lib.documents.import(f)
    ;(lib as any).db.run('DELETE FROM documents')       // e.g. index wiped, JSON kept
    const spy = vi.spyOn((lib.documents as any).store, 'listAll')
    const second = await lib.documents.import(f)
    expect(second.id).toBe(first.id)
    expect(spy).not.toHaveBeenCalled()
  })
})
