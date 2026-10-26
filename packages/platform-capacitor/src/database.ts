// @ts-ignore - use asm.js build (no WASM file loading needed)
import initSqlJs from 'sql.js/dist/sql-asm.js'
import type { Database as SqlJsDatabase } from 'sql.js'
import type { PlatformDatabase, DatabaseFactory, PlatformFS } from '@banjuan/core'

class WasmDatabase implements PlatformDatabase {
  /** Inside an explicit BEGIN … COMMIT/ROLLBACK (see save()). */
  private inTransaction = false

  constructor(private db: SqlJsDatabase, private dbPath: string, private fs: PlatformFS) {}

  execute(sql: string, params?: unknown[]): void {
    if (params?.length) {
      this.db.run(sql, params as any[])
    } else {
      this.db.exec(sql)
    }
    if (/^\s*BEGIN\b/i.test(sql)) this.inTransaction = true
    else if (/^\s*(COMMIT|END|ROLLBACK)\b/i.test(sql)) this.inTransaction = false
  }

  run(sql: string, params?: unknown[]): { changes: number } {
    this.db.run(sql, (params ?? []) as any[])
    return { changes: this.db.getRowsModified() }
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.prepare(sql)
    if (params?.length) stmt.bind(params as any[])
    const results: T[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T)
    }
    stmt.free()
    return results
  }

  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
    return this.query<T>(sql, params)[0]
  }

  pragma(name: string, value?: unknown): unknown {
    const sql = value !== undefined ? `PRAGMA ${name} = ${value}` : `PRAGMA ${name}`
    return this.query(sql)
  }

  transaction<R>(fn: () => R): R {
    this.execute('BEGIN TRANSACTION')
    try {
      const result = fn()
      this.execute('COMMIT')
      return result
    } catch (err) {
      this.execute('ROLLBACK')
      throw err
    }
  }

  /**
   * sql.js export() closes and reopens the database: an open transaction is
   * rolled back, and temporary tables and triggers (an index rebuild's change
   * log) are dropped. A flush (the text indexer, going to the background) that
   * landed mid-rebuild undid it — so wait until neither is in use.
   */
  async save(): Promise<void> {
    for (let waited = 0; this.busy() && waited < 120_000; waited += 100) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const data = this.exportKeepingPragmas()
    await this.fs.writeFile(this.dbPath, data)
  }

  private busy(): boolean {
    if (this.inTransaction) return true
    try {
      return (this.queryOne<{ n: number }>('SELECT count(*) AS n FROM sqlite_temp_master')?.n ?? 0) > 0
    } catch {
      return false
    }
  }

  /** export(), then the connection settings it resets (foreign key checks). */
  private exportKeepingPragmas(): Uint8Array {
    let foreignKeys = false
    try { foreignKeys = !!(this.queryOne<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys) } catch { /* default */ }
    const data = this.db.export()
    if (foreignKeys) this.db.exec('PRAGMA foreign_keys = ON')
    return data
  }

  close(): void {
    const data = this.db.export()
    this.fs.writeFile(this.dbPath, data).catch(() => {})
    this.db.close()
  }
}

export class CapacitorDatabaseFactory implements DatabaseFactory {
  private sqlPromise: Promise<any> | null = null

  constructor(private fs: PlatformFS) {}

  private getSql() {
    if (!this.sqlPromise) {
      this.sqlPromise = initSqlJs()
    }
    return this.sqlPromise
  }

  async open(path: string): Promise<PlatformDatabase> {
    const SQL = await this.getSql()
    let db: SqlJsDatabase
    const exists = await this.fs.exists(path)
    if (exists) {
      const data = await this.fs.readFile(path)
      db = new SQL.Database(data)
      // The database is only an index of the library's files. If the saved copy
      // is damaged, set it aside and start empty — the library rebuilds the index
      // on open — instead of failing to open the library at all.
      try {
        db.exec('SELECT count(*) FROM sqlite_master')
      } catch (e) {
        console.warn('[db] saved database is unreadable, starting a fresh index', path, e)
        try { db.close() } catch { /* ignore */ }
        await this.fs.rename(path, `${path}.corrupt-${Date.now()}`).catch(() => {})
        db = new SQL.Database()
      }
    } else {
      db = new SQL.Database()
    }
    return new WasmDatabase(db, path, this.fs)
  }
}
