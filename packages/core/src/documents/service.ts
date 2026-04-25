import type Database from 'better-sqlite3'
import type { SearchService } from '../search/service.js'

export class DocumentService {
  constructor(private db: Database.Database, private rootPath: string, private search: SearchService) {}
}
