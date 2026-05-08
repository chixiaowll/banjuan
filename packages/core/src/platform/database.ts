export interface PlatformDatabase {
  execute(sql: string, params?: unknown[]): void
  run(sql: string, params?: unknown[]): { changes: number }
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined
  pragma(name: string, value?: unknown): unknown
  transaction<R>(fn: () => R): R
  close(): void
}

export interface DatabaseFactory {
  open(path: string): Promise<PlatformDatabase>
}
