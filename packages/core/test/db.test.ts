import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { NodeDatabaseFactory } from '@banjuan/platform-node'
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

  it('creates a SQLite connection', async () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = await createConnection(dbPath, new NodeDatabaseFactory())
    expect(db).toBeDefined()
    db.close()
  })

  it('initializes schema with all tables', async () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = await createConnection(dbPath, new NodeDatabaseFactory())
    initSchema(db)

    const tables = db
      .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
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

  it('initializes FTS5 search index', async () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = await createConnection(dbPath, new NodeDatabaseFactory())
    initSchema(db)

    const tables = db
      .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('search_index')
    db.close()
  })

  it('is idempotent — running initSchema twice does not error', async () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = await createConnection(dbPath, new NodeDatabaseFactory())
    initSchema(db)
    initSchema(db)

    const count = db
      .queryOne<{ c: number }>("SELECT count(*) as c FROM sqlite_master WHERE type='table'")!
    expect(count.c).toBeGreaterThan(0)
    db.close()
  })
})
