import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import type Database from 'better-sqlite3'
import { createConnection } from './db/connection.js'
import { initSchema } from './db/schema.js'
import { DocumentService } from './documents/service.js'
import { AnnotationService } from './annotations/service.js'
import { NoteService } from './notes/service.js'
import { TagService } from './tags/service.js'
import { SearchService } from './search/service.js'
import { MindmapService } from './mindmaps/service.js'
import { GraphService } from './graph/service.js'
import { EventBus } from './events/bus.js'
import { PluginManager } from './plugins/manager.js'
import type { LibraryConfig, SyncConfig } from './types.js'
import { WebDAVAdapter } from './sync/webdav-adapter.js'
import { SyncService } from './sync/service.js'
import { StubService } from './sync/stub-service.js'
import { IndexService } from './indexing/service.js'

export class Library {
  readonly rootPath: string
  readonly documents: DocumentService
  readonly annotations: AnnotationService
  readonly notes: NoteService
  readonly tags: TagService
  readonly search: SearchService
  readonly mindmaps: MindmapService
  readonly graph: GraphService
  readonly events: EventBus
  readonly plugins: PluginManager
  private db: Database.Database

  private constructor(rootPath: string, db: Database.Database) {
    this.rootPath = rootPath
    this.db = db
    this.events = new EventBus()
    this.search = new SearchService(db)
    this.documents = new DocumentService(db, rootPath, this.search, this.events)
    this.annotations = new AnnotationService(db, rootPath, this.events)
    this.notes = new NoteService(db, rootPath, this.search, this.events)
    this.tags = new TagService(db, rootPath, this.events)
    this.mindmaps = new MindmapService(db, rootPath, this.events)
    this.graph = new GraphService(db)
    this.plugins = new PluginManager(this, this.events, rootPath)
  }

  static init(rootPath: string): Library {
    const banjuanDir = join(rootPath, '.banjuan')
    if (existsSync(banjuanDir)) {
      throw new Error(`Library already exists at ${rootPath}`)
    }

    mkdirSync(banjuanDir, { recursive: true })
    mkdirSync(join(banjuanDir, 'data', 'documents'), { recursive: true })
    mkdirSync(join(banjuanDir, 'data', 'annotations'), { recursive: true })
    mkdirSync(join(banjuanDir, 'data', 'mindmaps'), { recursive: true })
    mkdirSync(join(banjuanDir, 'stubs'), { recursive: true })
    mkdirSync(join(rootPath, 'notes'), { recursive: true })

    const config: LibraryConfig = {
      name: 'My Library',
      version: '1',
      createdAt: new Date().toISOString(),
    }
    writeFileSync(join(banjuanDir, 'config.json'), JSON.stringify(config, null, 2))
    writeFileSync(join(banjuanDir, 'tags.json'), '[]')

    const dbPath = join(banjuanDir, 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)

    return new Library(rootPath, db)
  }

  static open(rootPath: string): Library {
    const banjuanDir = join(rootPath, '.banjuan')
    if (!existsSync(banjuanDir)) {
      throw new Error(`${rootPath} is not a library — .banjuan directory not found`)
    }

    const dbPath = join(banjuanDir, 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)

    return new Library(rootPath, db)
  }

  getSyncConfig(): SyncConfig | null {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    if (!existsSync(syncPath)) return null
    return JSON.parse(readFileSync(syncPath, 'utf-8')) as SyncConfig
  }

  saveSyncConfig(config: SyncConfig): void {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    writeFileSync(syncPath, JSON.stringify(config, null, 2))
  }

  createSyncService(): SyncService {
    const config = this.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const adapter = new WebDAVAdapter()
    return new SyncService(this.rootPath, adapter, this.events)
  }

  createIndexService(): IndexService {
    return new IndexService(this.db, this.rootPath)
  }

  createStubService(): StubService {
    const config = this.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const adapter = new WebDAVAdapter()
    return new StubService(this.rootPath, adapter)
  }

  async scanAndImport(): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const supportedExts = new Set([
      '.pdf', '.epub', '.txt', '.md', '.markdown',
      '.jpg', '.jpeg', '.png', '.webp', '.gif',
      '.mp4', '.mov', '.webm',
      '.html', '.htm',
    ])
    const skipDirs = new Set(['.banjuan', 'notes', 'node_modules', '.git'])
    const files: string[] = []

    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          const topDir = relative(this.rootPath, fullPath).split('/')[0]
          if (skipDirs.has(topDir)) continue
          walk(fullPath)
        } else {
          const ext = extname(entry.name).toLowerCase()
          if (supportedExts.has(ext)) files.push(fullPath)
        }
      }
    }
    walk(this.rootPath)

    const result = { imported: 0, skipped: 0, errors: [] as string[] }
    for (const file of files) {
      try {
        await this.documents.import(file)
        result.imported++
      } catch {
        result.skipped++
      }
    }
    return result
  }

  async close(): Promise<void> {
    await this.plugins.unloadAll()
    this.events.emit('library:closed', { path: this.rootPath })
    this.events.removeAllListeners()
    this.db.close()
  }
}
