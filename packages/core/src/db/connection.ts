import type { PlatformDatabase, DatabaseFactory } from '../platform/index.js'

export async function createConnection(dbPath: string, factory: DatabaseFactory): Promise<PlatformDatabase> {
  return factory.open(dbPath)
}
