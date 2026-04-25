import Database from 'better-sqlite3'

export function createConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  return db
}
