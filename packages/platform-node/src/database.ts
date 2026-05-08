import Database from 'better-sqlite3'
import type { PlatformDatabase, DatabaseFactory } from '@banjuan/core'

class NodeDatabase implements PlatformDatabase {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  execute(sql: string, params?: unknown[]): void {
    if (params && params.length > 0) {
      this.db.prepare(sql).run(...params)
    } else {
      this.db.exec(sql)
    }
  }

  run(sql: string, params?: unknown[]): { changes: number } {
    const result = this.db.prepare(sql).run(...(params ?? []))
    return { changes: result.changes }
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params ?? [])) as T[]
  }

  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params ?? [])) as T | undefined
  }

  pragma(name: string, value?: unknown): unknown {
    return this.db.pragma(name, value as Database.PragmaOptions | undefined)
  }

  transaction<R>(fn: () => R): R {
    return this.db.transaction(fn)()
  }

  close(): void {
    this.db.close()
  }
}

export class NodeDatabaseFactory implements DatabaseFactory {
  async open(path: string): Promise<PlatformDatabase> {
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    return new NodeDatabase(db)
  }
}
