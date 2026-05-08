import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { PlatformDatabase, DatabaseFactory } from '@banjuan/core'

class CapacitorDatabase implements PlatformDatabase {
  constructor(private conn: any) {}

  execute(sql: string, params?: unknown[]): void {
    if (params?.length) {
      this.conn.run(sql, params, false)
    } else {
      this.conn.execute(sql, false)
    }
  }

  run(sql: string, params?: unknown[]): { changes: number } {
    const result = this.conn.run(sql, params ?? [], false)
    return { changes: result.changes?.changes ?? 0 }
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    const result = this.conn.query(sql, params ?? [])
    return (result.values ?? []) as T[]
  }

  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
    const rows = this.query<T>(sql, params)
    return rows[0]
  }

  pragma(name: string, value?: unknown): unknown {
    const sql = value !== undefined ? `PRAGMA ${name} = ${value}` : `PRAGMA ${name}`
    const result = this.conn.query(sql, [])
    return result.values
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

  close(): void {
    this.conn.close()
  }
}

export class CapacitorDatabaseFactory implements DatabaseFactory {
  private sqlite = new SQLiteConnection(CapacitorSQLite)

  async open(path: string): Promise<PlatformDatabase> {
    const dbName = path.replace(/.*\//, '').replace('.sqlite', '')
    const conn = await this.sqlite.createConnection(dbName, false, 'no-encryption', 1, false)
    await conn.open()
    return new CapacitorDatabase(conn)
  }
}
