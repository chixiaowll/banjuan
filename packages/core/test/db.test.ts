import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { createConnection } from '../src/db/connection.js'
import { initSchema } from '../src/db/schema.js'

describe('Database', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
    mkdirSync(join(tempDir, '.banjuan'), { recursive: true })
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  it('creates a SQLite connection', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    expect(db).toBeDefined()
    db.close()
  })

  it('initializes schema with all tables', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('documents')
    expect(tableNames).toContain('annotations')
    expect(tableNames).toContain('notes')
    expect(tableNames).toContain('note_annotations')
    expect(tableNames).toContain('tags')
    expect(tableNames).toContain('doc_tags')
    expect(tableNames).toContain('note_tags')

    db.close()
  })

  it('initializes FTS5 search index', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('search_index')
    db.close()
  })

  it('is idempotent — running initSchema twice does not error', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)
    initSchema(db)

    const count = db
      .prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'")
      .get() as { c: number }
    expect(count.c).toBeGreaterThan(0)
    db.close()
  })
})
