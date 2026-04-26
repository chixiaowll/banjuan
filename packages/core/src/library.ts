import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import type Database from 'better-sqlite3'
import { createConnection } from './db/connection.js'
import { initSchema } from './db/schema.js'
import { DocumentService } from './documents/service.js'
import { AnnotationService } from './annotations/service.js'
import { NoteService } from './notes/service.js'
import { NoteLinkService } from './notes/link-service.js'
import { FolderService } from './notes/folder-service.js'
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
import { TemplateService } from './notes/template-service.js'
import { migrateNotesToJson } from './notes/migration.js'

export class Library {
  readonly rootPath: string
  readonly documents: DocumentService
  readonly annotations: AnnotationService
  readonly notes: NoteService
  readonly folders: FolderService
  readonly noteLinks: NoteLinkService
  readonly tags: TagService
  readonly search: SearchService
  readonly mindmaps: MindmapService
  readonly graph: GraphService
  readonly events: EventBus
  readonly plugins: PluginManager
  readonly templates: TemplateService
  private db: Database.Database

  private constructor(rootPath: string, db: Database.Database) {
    this.rootPath = rootPath
    this.db = db
    this.events = new EventBus()
    this.search = new SearchService(db)
    this.documents = new DocumentService(db, rootPath, this.search, this.events)
    this.annotations = new AnnotationService(db, rootPath, this.events)
    this.notes = new NoteService(db, rootPath, this.search, this.events)
    this.folders = new FolderService(db, this.events)
    this.noteLinks = new NoteLinkService(db)
    this.tags = new TagService(db, rootPath, this.events)
    this.mindmaps = new MindmapService(db, rootPath, this.events)
    this.graph = new GraphService(db)
    this.plugins = new PluginManager(this, this.events, rootPath)
    this.templates = new TemplateService(db)

    this.notes.setTemplateService(this.templates)
    this.notes.setLinkService(this.noteLinks)
  }

  static isLibrary(rootPath: string): boolean {
    return existsSync(join(rootPath, '.banjuan'))
  }

  static init(rootPath: string, name?: string): Library {
    const banjuanDir = join(rootPath, '.banjuan')
    if (existsSync(banjuanDir)) {
      throw new Error(`Library already exists at ${rootPath}`)
    }

    mkdirSync(banjuanDir, { recursive: true })
    mkdirSync(join(banjuanDir, 'data', 'documents'), { recursive: true })
    mkdirSync(join(banjuanDir, 'data', 'annotations'), { recursive: true })
    mkdirSync(join(banjuanDir, 'data', 'mindmaps'), { recursive: true })
    mkdirSync(join(banjuanDir, 'stubs'), { recursive: true })
    mkdirSync(join(banjuanDir, 'notes'), { recursive: true })

    const config: LibraryConfig = {
      name: name || 'My Library',
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

  static async migrateNotes(rootPath: string): Promise<{ migrated: number; errors: string[] }> {
    const notesDir = join(rootPath, '.banjuan', 'notes')
    return migrateNotesToJson(notesDir)
  }

  getConfig(): LibraryConfig {
    const configPath = join(this.rootPath, '.banjuan', 'config.json')
    return JSON.parse(readFileSync(configPath, 'utf-8')) as LibraryConfig
  }

  get name(): string {
    return this.getConfig().name
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

  private walkFiles(): string[] {
    const skipDirs = new Set(['.banjuan', 'node_modules', '.git'])
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
          files.push(fullPath)
        }
      }
    }
    walk(this.rootPath)
    return files
  }

  async scanAndImport(): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const files = this.walkFiles()
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

  async syncWithDisk(): Promise<{ imported: number; removed: number }> {
    const diskFiles = new Set(this.walkFiles().map(f => relative(this.rootPath, f)))
    const docs = await this.documents.list()

    let imported = 0
    let removed = 0

    for (const doc of docs) {
      if (!diskFiles.has(doc.path)) {
        await this.documents.delete(doc.id)
        removed++
      }
    }

    for (const relPath of diskFiles) {
      try {
        await this.documents.import(relPath)
        imported++
      } catch {
        // already imported or unsupported
      }
    }

    return { imported, removed }
  }

  async close(): Promise<void> {
    await this.plugins.unloadAll()
    this.events.emit('library:closed', { path: this.rootPath })
    this.events.removeAllListeners()
    this.db.close()
  }
}
