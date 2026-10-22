import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, createTestFile, testDeps } from './helpers.js'

// The library view fetched tags with one IPC + query per document.
describe('TagService.namesByTarget', () => {
  it('returns every tagged target of a type with its tag names, in one call', async () => {
    const root = join(createTempDir(), 'lib')
    const lib = await Library.init(root, testDeps())
    await lib.tags.create({ name: '论文' })
    await lib.tags.create({ name: 'AI' })
    const a = await lib.documents.import(createTestFile(root, 'a.md', '# A'))
    const b = await lib.documents.import(createTestFile(root, 'b.md', '# B'))
    await lib.documents.import(createTestFile(root, 'c.md', '# C'))   // untagged
    await lib.tags.assign(a.id, 'document', ['论文', 'AI'])
    await lib.tags.assign(b.id, 'document', ['AI'])
    const map = await lib.tags.namesByTarget('document')
    expect(Object.keys(map).sort()).toEqual([a.id, b.id].sort())
    expect(map[a.id].sort()).toEqual(['AI', '论文'])
    expect(map[b.id]).toEqual(['AI'])
    expect(await lib.tags.namesByTarget('note')).toEqual({})
  })
})
