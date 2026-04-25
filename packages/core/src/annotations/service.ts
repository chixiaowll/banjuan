import type Database from 'better-sqlite3'

export class AnnotationService {
  constructor(private db: Database.Database) {}
}
