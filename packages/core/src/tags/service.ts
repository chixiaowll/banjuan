import type Database from 'better-sqlite3'

export class TagService {
  constructor(private db: Database.Database) {}
}
