import { describe, it, expect, vi } from 'vitest'
import type { PlatformFS } from '@banjuan/core'

vi.mock('@capacitor/core', () => ({}))
vi.mock('@capacitor/filesystem', () => ({}))
const { CapacitorDatabaseFactory } = await import('./database.js')

// The in-memory database is saved by export(), which closes and reopens it.
function memoryFS() {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    fs: {
      exists: async (p: string) => files.has(p),
      readFile: async (p: string) => files.get(p)!,
      writeFile: async (p: string, d: Uint8Array) => { files.set(p, d) },
      rename: async () => {},
    } as unknown as PlatformFS,
  }
}

describe('WasmDatabase.save', () => {
  it('waits for an open transaction instead of rolling it back', async () => {
    const { fs } = memoryFS()
    const db = await new CapacitorDatabaseFactory(fs).open('/db.sqlite')
    db.execute('CREATE TABLE t (x INTEGER)')
    db.execute('BEGIN')
    db.run('INSERT INTO t (x) VALUES (1)')
    const saving = db.save!()
    await new Promise(r => setTimeout(r, 250))
    db.run('INSERT INTO t (x) VALUES (2)')
    db.execute('COMMIT')
    await saving
    expect(db.query<{ x: number }>('SELECT x FROM t ORDER BY x').map(r => r.x)).toEqual([1, 2])

    const reopened = await new CapacitorDatabaseFactory(fs).open('/db.sqlite')
    expect(reopened.query<{ x: number }>('SELECT x FROM t ORDER BY x').map(r => r.x)).toEqual([1, 2])
  })

  it('waits while temporary triggers are in place, and keeps foreign key checks on', async () => {
    const { fs } = memoryFS()
    const db = await new CapacitorDatabaseFactory(fs).open('/db.sqlite')
    db.pragma('foreign_keys = ON')
    db.execute('CREATE TABLE t (x INTEGER)')
    db.execute('CREATE TEMP TABLE log (x INTEGER)')
    db.execute('CREATE TEMP TRIGGER t_log AFTER INSERT ON t BEGIN INSERT INTO log (x) VALUES (NEW.x); END')
    let saved = false
    const saving = db.save!().then(() => { saved = true })
    await new Promise(r => setTimeout(r, 250))
    expect(saved).toBe(false)
    db.run('INSERT INTO t (x) VALUES (7)')
    expect(db.query('SELECT x FROM log')).toEqual([{ x: 7 }])
    db.execute('DROP TRIGGER temp.t_log')
    db.execute('DROP TABLE temp.log')
    await saving
    expect(saved).toBe(true)
    expect(db.queryOne<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1)
  })
})
