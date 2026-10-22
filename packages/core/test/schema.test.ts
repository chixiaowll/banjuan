import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir, testDeps } from './helpers.js'
import { Library } from '../src/library.js'

describe('Schema — new tables', () => {
  let tempDir: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    lib = await Library.init(join(tempDir, 'lib'), testDeps())
  })

  afterEach(async () => { await lib.close(); cleanupTempDir(tempDir) })

  it('creates folders table', () => {
    const info = (lib as any).db.queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='folders'")
    expect(info).toBeTruthy()
  })

  it('creates note_links table', () => {
    const info = (lib as any).db.queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='note_links'")
    expect(info).toBeTruthy()
  })

  it('creates note_templates table', () => {
    const info = (lib as any).db.queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='note_templates'")
    expect(info).toBeTruthy()
  })

  it('notes table has folder_id and content_format columns', () => {
    const columns = (lib as any).db.query("PRAGMA table_info(notes)") as Array<{ name: string }>
    const names = columns.map(c => c.name)
    expect(names).toContain('folder_id')
    expect(names).toContain('content_format')
  })
})
