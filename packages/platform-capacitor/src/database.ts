// @ts-ignore - use asm.js build (no WASM file loading needed)
import initSqlJs from 'sql.js/dist/sql-asm.js'
import type { Database as SqlJsDatabase } from 'sql.js'
import type { PlatformDatabase, DatabaseFactory, PlatformFS } from '@banjuan/core'

class WasmDatabase implements PlatformDatabase {
  constructor(private db: SqlJsDatabase, private dbPath: string, private fs: PlatformFS) {}

  execute(sql: string, params?: unknown[]): void {
    if (params?.length) {
      this.db.run(sql, params as any[])
    } else {
      this.db.exec(sql)
    }
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

  async save(): Promise<void> {
    const data = this.db.export()
    await this.fs.writeFile(this.dbPath, data)
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
    } else {
      db = new SQL.Database()
    }
    return new WasmDatabase(db, path, this.fs)
  }
}
