import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir, createTestFile, testDeps } from './helpers.js'
import { Library } from '../src/library.js'

describe('SearchService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    lib = await Library.init(join(tempDir, 'lib'), testDeps())

    createTestFile(join(tempDir, 'lib'), 'transformers.txt', 'Attention is all you need paper about transformers')
    await lib.documents.import('transformers.txt')

    createTestFile(join(tempDir, 'lib'), 'cnn.txt', 'Convolutional neural networks for image recognition')
    await lib.documents.import('cnn.txt')

    await lib.notes.create({
      title: 'Transformer Notes',
      content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'The transformer architecture uses self-attention mechanisms' }] }]),
    })
  })

  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  it('indexes documents on import', async () => {
    const results = await lib.search.query('transformers')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].type).toBe('document')
  })

  it('indexes notes on creation (hyphenated query)', async () => {
    const results = await lib.search.query('self-attention')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.type === 'note')).toBe(true)
  })

  it('treats FTS5 syntax characters in the query as plain text', async () => {
    await expect(lib.search.query('attention: (draft) NOT')).resolves.toBeDefined()
    const results = await lib.search.query('self-attention mechanism')
    expect(results.some((r) => r.type === 'note')).toBe(true)
  })

  it('filters by type', async () => {
    const results = await lib.search.query('transformer', { type: 'note' })
    expect(results.every((r) => r.type === 'note')).toBe(true)
  })

  it('re-indexes a note when its content or title is edited', async () => {
    const note = await lib.notes.create({
      title: 'Draft',
      content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'original wording' }] }]),
    })
    await lib.notes.update(note.id, {
      title: 'Quantum Draft',
      content: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'entanglement experiment' }] }]),
    })
    expect((await lib.search.query('entanglement')).map(r => r.id)).toContain(note.id)
    expect((await lib.search.query('original')).map(r => r.id)).not.toContain(note.id)
    // one index row per note, not one more per save
    const db = (lib as any).db
    expect(db.query("SELECT rowid FROM search_index WHERE type = ?", ['note:' + note.id])).toHaveLength(1)
  })

  it('returns empty for no match', async () => {
    const results = await lib.search.query('quantum computing')
    expect(results).toHaveLength(0)
  })
})
