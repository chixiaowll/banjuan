import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { Library } from '../src/library.js'

describe('SearchService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))

    createTestFile(join(tempDir, 'lib'), 'transformers.txt', 'Attention is all you need paper about transformers')
    await lib.documents.import('transformers.txt')

    createTestFile(join(tempDir, 'lib'), 'cnn.txt', 'Convolutional neural networks for image recognition')
    await lib.documents.import('cnn.txt')

    await lib.notes.create({
      title: 'Transformer Notes',
      content: 'The transformer architecture uses self-attention mechanisms',
    })
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  it('indexes documents on import', async () => {
    const results = await lib.search.query('transformers')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].type).toBe('document')
  })

  it('indexes notes on creation', async () => {
    const results = await lib.search.query('self-attention')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.type === 'note')).toBe(true)
  })

  it('filters by type', async () => {
    const results = await lib.search.query('transformer', { type: 'note' })
    expect(results.every((r) => r.type === 'note')).toBe(true)
  })

  it('returns empty for no match', async () => {
    const results = await lib.search.query('quantum computing')
    expect(results).toHaveLength(0)
  })
})
