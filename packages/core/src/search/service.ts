import type Database from 'better-sqlite3'

export class SearchService {
  constructor(private db: Database.Database) {}
}
