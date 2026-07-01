export interface PlatformDatabase {
  execute(sql: string, params?: unknown[]): void
  run(sql: string, params?: unknown[]): { changes: number }
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined
  pragma(name: string, value?: unknown): unknown
  transaction<R>(fn: () => R): R
  /**
   * Persist the database to durable storage. A no-op for file-backed engines
   * (better-sqlite3 writes as it goes); in-memory engines that snapshot to a
   * file (sql.js on mobile) must implement this, since close() may never run
   * when the OS kills the app.
   */
  save?(): Promise<void>
  close(): void
}

export interface DatabaseFactory {
  open(path: string): Promise<PlatformDatabase>
}
