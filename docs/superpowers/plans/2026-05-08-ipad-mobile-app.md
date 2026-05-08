# iPad/iOS Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an iPad/iPhone Capacitor app that shares UI and business logic with the existing Electron desktop app.

**Architecture:** Three-layer decoupling — platform abstraction interfaces in core, platform-specific implementations (node / capacitor), and shared UI extracted from the existing renderer. The desktop app continues to work via `platform-node`; the mobile app uses `platform-capacitor`.

**Tech Stack:** Capacitor 6, React 19, Mantine 8, Vite 6, @capacitor/filesystem, @capacitor-community/sqlite, existing core business logic.

---

## File Structure

### New packages

```
packages/platform-node/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── fs.ts          # NodeFS implements PlatformFS
    ├── database.ts    # NodeDatabase implements PlatformDatabase
    └── crypto.ts      # NodeCrypto implements PlatformCrypto

packages/platform-capacitor/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── fs.ts          # CapacitorFS implements PlatformFS
    ├── database.ts    # CapacitorDatabase implements PlatformDatabase
    └── crypto.ts      # WebCrypto implements PlatformCrypto

packages/shared-ui/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── api.ts         # BanjuanAPI interface + Context + hook
    ├── views/         # moved from app/src/renderer/views/ (except WelcomeView)
    ├── components/    # moved from app/src/renderer/components/
    ├── stores/        # moved from app/src/renderer/stores/
    ├── styles/        # moved from app/src/renderer/styles/
    └── i18n/          # moved from app/src/renderer/i18n/

packages/mobile/
├── package.json
├── capacitor.config.ts
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── index.tsx
    ├── App.tsx
    ├── WelcomeView.tsx
    └── capacitor-api.ts  # BanjuanAPI implementation using core + platform-capacitor
```

### Modified files in existing packages

```
packages/core/src/
├── platform/           # NEW directory
│   ├── index.ts        # re-exports interfaces
│   ├── fs.ts           # PlatformFS interface
│   ├── database.ts     # PlatformDatabase + DatabaseFactory interfaces
│   ├── crypto.ts       # PlatformCrypto interface
│   └── path.ts         # pure-JS path utilities (join, dirname, basename, etc.)
├── library.ts          # MODIFY: accept PlatformDeps, make methods async
├── db/connection.ts    # MODIFY: use DatabaseFactory instead of better-sqlite3
├── db/schema.ts        # MODIFY: use PlatformDatabase instead of better-sqlite3
├── storage/json-store.ts       # MODIFY: use PlatformFS
├── documents/service.ts        # MODIFY: use PlatformFS + PlatformCrypto
├── documents/metadata.ts       # MODIFY: use platform path utils
├── annotations/service.ts      # MODIFY: use PlatformFS (via JsonStore)
├── notes/service.ts            # MODIFY: use PlatformFS
├── notes/attachment-service.ts # MODIFY: use PlatformFS
├── notes/migration.ts          # MODIFY: use PlatformFS
├── tags/service.ts             # MODIFY: use PlatformFS
├── mindmaps/service.ts         # MODIFY: use PlatformFS
├── sync/service.ts             # MODIFY: use PlatformFS
├── sync/stub-service.ts        # MODIFY: use PlatformFS
├── sync/webdav-adapter.ts      # MODIFY: use PlatformFS
├── indexing/service.ts         # MODIFY: use PlatformFS
├── indexing/watcher.ts         # MODIFY: make optional (no-op on mobile)
├── plugins/manager.ts          # MODIFY: use PlatformFS
├── plugins/base.ts             # MODIFY: use PlatformFS
├── events/bus.ts               # MODIFY: remove node:events dependency
├── index.ts                    # MODIFY: export platform interfaces
└── types.ts                    # no change

packages/app/src/
├── renderer/
│   ├── index.tsx       # MODIFY: import from shared-ui, provide ElectronAPI
│   ├── App.tsx         # MODIFY: wrap with BanjuanAPIProvider
│   ├── WelcomeView.tsx # KEEP (Electron-specific)
│   └── electron-api.ts # NEW: adapts window.electronAPI to BanjuanAPI interface
│   (views/, components/, stores/, styles/, i18n/ → MOVED to shared-ui)
└── preload/index.ts    # no change
```

---

## Task 1: Platform abstraction interfaces in core

**Files:**
- Create: `packages/core/src/platform/fs.ts`
- Create: `packages/core/src/platform/database.ts`
- Create: `packages/core/src/platform/crypto.ts`
- Create: `packages/core/src/platform/path.ts`
- Create: `packages/core/src/platform/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create PlatformFS interface**

```typescript
// packages/core/src/platform/fs.ts
export interface PlatformFS {
  readFile(path: string): Promise<Uint8Array>
  readTextFile(path: string): Promise<string>
  writeFile(path: string, data: Uint8Array): Promise<void>
  writeTextFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  readdir(path: string): Promise<string[]>
  readdirWithTypes(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  remove(path: string): Promise<void>
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>
  stat(path: string): Promise<{ mtime: number; size: number }>
  rename(from: string, to: string): Promise<void>
}
```

- [ ] **Step 2: Create PlatformDatabase interface**

```typescript
// packages/core/src/platform/database.ts
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
```

- [ ] **Step 3: Create PlatformCrypto interface**

```typescript
// packages/core/src/platform/crypto.ts
export interface PlatformCrypto {
  sha256(data: Uint8Array): Promise<string>
}
```

- [ ] **Step 4: Create pure-JS path utilities**

The existing code uses `node:path` (join, dirname, basename, extname, relative, isAbsolute). Create a pure-JS implementation that works identically for POSIX paths (which is what `.banjuan/` paths always use):

```typescript
// packages/core/src/platform/path.ts
export function join(...parts: string[]): string {
  const joined = parts.filter(Boolean).join('/')
  return normalize(joined)
}

export function normalize(p: string): string {
  const parts = p.split('/')
  const result: string[] = []
  for (const part of parts) {
    if (part === '.' || part === '') continue
    if (part === '..' && result.length > 0 && result[result.length - 1] !== '..') {
      result.pop()
    } else {
      result.push(part)
    }
  }
  const normalized = result.join('/')
  return p.startsWith('/') ? '/' + normalized : normalized
}

export function dirname(p: string): string {
  const idx = p.lastIndexOf('/')
  if (idx === -1) return '.'
  if (idx === 0) return '/'
  return p.slice(0, idx)
}

export function basename(p: string, ext?: string): string {
  const base = p.slice(p.lastIndexOf('/') + 1)
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length)
  return base
}

export function extname(p: string): string {
  const base = basename(p)
  const idx = base.lastIndexOf('.')
  return idx <= 0 ? '' : base.slice(idx)
}

export function relative(from: string, to: string): string {
  const fromParts = from.split('/').filter(Boolean)
  const toParts = to.split('/').filter(Boolean)
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  const ups = fromParts.length - common
  const rest = toParts.slice(common)
  return [...Array(ups).fill('..'), ...rest].join('/')
}

export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}
```

- [ ] **Step 5: Create platform barrel export**

```typescript
// packages/core/src/platform/index.ts
export type { PlatformFS } from './fs.js'
export type { PlatformDatabase, DatabaseFactory } from './database.js'
export type { PlatformCrypto } from './crypto.js'
export * from './path.js'

export interface PlatformDeps {
  fs: PlatformFS
  dbFactory: DatabaseFactory
  crypto: PlatformCrypto
}
```

- [ ] **Step 6: Export platform types from core index**

Add to `packages/core/src/index.ts`:

```typescript
export * from './platform/index.js'
```

- [ ] **Step 7: Run build to verify**

Run: `cd packages/core && pnpm build`
Expected: PASS (new files are additive, nothing breaks)

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/platform/ packages/core/src/index.ts
git commit -m "feat(core): add platform abstraction interfaces (fs, database, crypto, path)"
```

---

## Task 2: Create platform-node package

**Files:**
- Create: `packages/platform-node/package.json`
- Create: `packages/platform-node/tsconfig.json`
- Create: `packages/platform-node/src/fs.ts`
- Create: `packages/platform-node/src/database.ts`
- Create: `packages/platform-node/src/crypto.ts`
- Create: `packages/platform-node/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@banjuan/platform-node",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@banjuan/core": "workspace:*",
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create NodeFS**

```typescript
// packages/platform-node/src/fs.ts
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  readdirSync, unlinkSync, statSync, renameSync, rmSync,
} from 'node:fs'
import { dirname } from 'node:path'
import type { PlatformFS } from '@banjuan/core'

export class NodeFS implements PlatformFS {
  async readFile(path: string): Promise<Uint8Array> {
    return readFileSync(path)
  }

  async readTextFile(path: string): Promise<string> {
    return readFileSync(path, 'utf-8')
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, data)
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(path)
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    mkdirSync(path, options)
  }

  async readdir(path: string): Promise<string[]> {
    return readdirSync(path).map(String)
  }

  async readdirWithTypes(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    return readdirSync(path, { withFileTypes: true }).map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }))
  }

  async remove(path: string): Promise<void> {
    unlinkSync(path)
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    rmSync(path, { recursive: options?.recursive, force: true })
  }

  async stat(path: string): Promise<{ mtime: number; size: number }> {
    const s = statSync(path)
    return { mtime: s.mtimeMs, size: s.size }
  }

  async rename(from: string, to: string): Promise<void> {
    renameSync(from, to)
  }
}
```

- [ ] **Step 4: Create NodeDatabase**

```typescript
// packages/platform-node/src/database.ts
import Database from 'better-sqlite3'
import type { PlatformDatabase, DatabaseFactory } from '@banjuan/core'

class NodeDatabase implements PlatformDatabase {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
  }

  execute(sql: string, params?: unknown[]): void {
    if (params?.length) {
      this.db.prepare(sql).run(...params)
    } else {
      this.db.exec(sql)
    }
  }

  run(sql: string, params?: unknown[]): { changes: number } {
    const result = this.db.prepare(sql).run(...(params ?? []))
    return { changes: result.changes }
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params ?? [])) as T[]
  }

  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params ?? [])) as T | undefined
  }

  pragma(name: string, value?: unknown): unknown {
    return this.db.pragma(name, value as any)
  }

  transaction<R>(fn: () => R): R {
    return this.db.transaction(fn)()
  }

  close(): void {
    this.db.close()
  }
}

export class NodeDatabaseFactory implements DatabaseFactory {
  async open(path: string): Promise<PlatformDatabase> {
    return new NodeDatabase(path)
  }
}
```

- [ ] **Step 5: Create NodeCrypto**

```typescript
// packages/platform-node/src/crypto.ts
import { createHash } from 'node:crypto'
import type { PlatformCrypto } from '@banjuan/core'

export class NodeCrypto implements PlatformCrypto {
  async sha256(data: Uint8Array): Promise<string> {
    return createHash('sha256').update(data).digest('hex')
  }
}
```

- [ ] **Step 6: Create barrel export**

```typescript
// packages/platform-node/src/index.ts
export { NodeFS } from './fs.js'
export { NodeDatabaseFactory } from './database.js'
export { NodeCrypto } from './crypto.js'
```

- [ ] **Step 7: Install deps and build**

Run: `cd packages/platform-node && pnpm install && pnpm build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/platform-node/
git commit -m "feat: create platform-node package with NodeFS, NodeDatabase, NodeCrypto"
```

---

## Task 3: Refactor EventBus to remove node:events dependency

**Files:**
- Modify: `packages/core/src/events/bus.ts`

- [ ] **Step 1: Replace EventEmitter with a simple typed implementation**

```typescript
// packages/core/src/events/bus.ts
import type { BanjuanEventMap, BanjuanEvent } from '../types.js'

export class EventBus {
  private listeners = new Map<string, Set<Function>>()

  emit<E extends BanjuanEvent>(event: E, data: BanjuanEventMap[E]): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      for (const handler of handlers) handler(data)
    }
  }

  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }

  off<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.listeners.get(event)?.delete(handler)
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}
```

- [ ] **Step 2: Build core to verify**

Run: `cd packages/core && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/events/bus.ts
git commit -m "refactor(core): replace node:events EventEmitter with platform-agnostic implementation"
```

---

## Task 4: Refactor core db layer to use platform interfaces

**Files:**
- Modify: `packages/core/src/db/connection.ts`
- Modify: `packages/core/src/db/schema.ts`

- [ ] **Step 1: Refactor connection.ts**

Replace the `createConnection` function with a factory-based approach. The `Library` class will now pass in a `PlatformDatabase` directly, so `connection.ts` becomes unnecessary. However, to minimize changes, convert it to accept a factory:

```typescript
// packages/core/src/db/connection.ts
import type { PlatformDatabase, DatabaseFactory } from '../platform/index.js'

export async function createConnection(dbPath: string, factory: DatabaseFactory): Promise<PlatformDatabase> {
  return factory.open(dbPath)
}
```

- [ ] **Step 2: Refactor schema.ts to use PlatformDatabase**

Replace `Database.Database` with `PlatformDatabase`:

```typescript
// packages/core/src/db/schema.ts
import type { PlatformDatabase } from '../platform/index.js'

const SCHEMA_SQL = `...` // unchanged SQL string

export function initSchema(db: PlatformDatabase): void {
  db.execute(SCHEMA_SQL)

  const nodeColumns = db.pragma('table_info(mindmap_nodes)') as Array<{ name: string }>
  const nodeColNames = new Set(nodeColumns.map(c => c.name))
  const newNodeCols: Array<[string, string]> = [
    ['hyperlink', 'TEXT'],
    ['image_url', 'TEXT'],
    ['notes', 'TEXT'],
    ['shape', 'TEXT'],
    ['style_overrides', 'TEXT'],
    ['floating', 'INTEGER DEFAULT 0'],
  ]
  for (const [name, type] of newNodeCols) {
    if (!nodeColNames.has(name)) {
      db.execute(`ALTER TABLE mindmap_nodes ADD COLUMN ${name} ${type}`)
    }
  }
}
```

- [ ] **Step 3: Build core to verify**

Run: `cd packages/core && pnpm build`
Expected: FAIL (Library and services still reference old types — expected at this stage)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/db/
git commit -m "refactor(core): db layer uses PlatformDatabase interface instead of better-sqlite3"
```

---

## Task 5: Refactor JsonStore to use PlatformFS

**Files:**
- Modify: `packages/core/src/storage/json-store.ts`

- [ ] **Step 1: Rewrite JsonStore to use PlatformFS**

All methods become async since PlatformFS is async:

```typescript
// packages/core/src/storage/json-store.ts
import type { PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'

export class JsonStore<T extends { id: string }> {
  constructor(private baseDir: string, private fs: PlatformFS) {}

  private dirFor(id: string): string {
    return join(this.baseDir, id.slice(0, 2))
  }

  private pathFor(id: string): string {
    return join(this.dirFor(id), `${id}.json`)
  }

  async read(id: string): Promise<T | null> {
    const p = this.pathFor(id)
    if (!(await this.fs.exists(p))) return null
    const text = await this.fs.readTextFile(p)
    return JSON.parse(text)
  }

  async write(data: T): Promise<void> {
    const dir = this.dirFor(data.id)
    await this.fs.mkdir(dir, { recursive: true })
    await this.fs.writeTextFile(this.pathFor(data.id), JSON.stringify(data, null, 2))
  }

  async delete(id: string): Promise<boolean> {
    const p = this.pathFor(id)
    if (!(await this.fs.exists(p))) return false
    await this.fs.remove(p)
    return true
  }

  async listAll(): Promise<T[]> {
    if (!(await this.fs.exists(this.baseDir))) return []
    const results: T[] = []
    const prefixes = await this.fs.readdirWithTypes(this.baseDir)
    for (const prefix of prefixes) {
      if (!prefix.isDirectory) continue
      const files = await this.fs.readdirWithTypes(join(this.baseDir, prefix.name))
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue
        const content = await this.fs.readTextFile(join(this.baseDir, prefix.name, file.name))
        results.push(JSON.parse(content))
      }
    }
    return results
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/storage/json-store.ts
git commit -m "refactor(core): JsonStore uses PlatformFS instead of node:fs"
```

---

## Task 6: Refactor Library class to accept PlatformDeps

This is the largest single refactor. The `Library` class needs to:
1. Accept `PlatformDeps` in constructor
2. Pass `fs` to services that need it
3. Make `init()` and `open()` async
4. Replace all `node:fs` and `node:path` imports

**Files:**
- Modify: `packages/core/src/library.ts`

- [ ] **Step 1: Rewrite Library class**

Replace all `node:fs` and `node:path` imports with platform abstractions. Key changes:
- Constructor takes `PlatformDeps`
- `init()` and `open()` become `async static`
- All services receive `PlatformFS` as needed
- `node:path` calls replaced with `platform/path.js` utilities

```typescript
// packages/core/src/library.ts
import type { PlatformDatabase } from './platform/index.js'
import type { PlatformDeps } from './platform/index.js'
import type { PlatformFS } from './platform/index.js'
import { join, relative, extname, dirname } from './platform/path.js'
import { initSchema } from './db/schema.js'
import { DocumentService } from './documents/service.js'
import { AnnotationService } from './annotations/service.js'
import { NoteService } from './notes/service.js'
import { NoteLinkService } from './notes/link-service.js'
import { DocLinkService } from './notes/doc-link-service.js'
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
import { AttachmentService } from './notes/attachment-service.js'

export class Library {
  readonly rootPath: string
  readonly documents: DocumentService
  readonly annotations: AnnotationService
  readonly notes: NoteService
  readonly folders: FolderService
  readonly noteLinks: NoteLinkService
  readonly docLinks: DocLinkService
  readonly tags: TagService
  readonly search: SearchService
  readonly mindmaps: MindmapService
  readonly graph: GraphService
  readonly events: EventBus
  readonly plugins: PluginManager
  readonly templates: TemplateService
  readonly attachments: AttachmentService
  private db: PlatformDatabase
  private fs: PlatformFS

  private constructor(rootPath: string, db: PlatformDatabase, deps: PlatformDeps) {
    this.rootPath = rootPath
    this.db = db
    this.fs = deps.fs
    this.events = new EventBus()
    this.search = new SearchService(db)
    this.documents = new DocumentService(db, rootPath, this.search, this.events, deps.fs, deps.crypto)
    this.annotations = new AnnotationService(db, rootPath, this.events, deps.fs)
    this.notes = new NoteService(db, rootPath, this.search, this.events, deps.fs)
    this.folders = new FolderService(db, this.events)
    this.noteLinks = new NoteLinkService(db)
    this.docLinks = new DocLinkService(db)
    this.tags = new TagService(db, rootPath, this.events, deps.fs)
    this.mindmaps = new MindmapService(db, rootPath, this.events, deps.fs)
    this.graph = new GraphService(db)
    this.plugins = new PluginManager(this, this.events, rootPath, deps.fs)
    this.templates = new TemplateService(db)
    this.attachments = new AttachmentService(rootPath, deps.fs)

    this.notes.setTemplateService(this.templates)
    this.notes.setLinkService(this.noteLinks)
    this.mindmaps.setLinkService(this.noteLinks)
  }

  static async isLibrary(rootPath: string, deps: PlatformDeps): Promise<boolean> {
    return deps.fs.exists(join(rootPath, '.banjuan'))
  }

  static async init(rootPath: string, deps: PlatformDeps, name?: string): Promise<Library> {
    const banjuanDir = join(rootPath, '.banjuan')
    if (await deps.fs.exists(banjuanDir)) {
      throw new Error(`Library already exists at ${rootPath}`)
    }

    await deps.fs.mkdir(banjuanDir, { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'data', 'documents'), { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'data', 'annotations'), { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'stubs'), { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'notes'), { recursive: true })

    const config: LibraryConfig = {
      name: name || 'My Library',
      version: '1',
      createdAt: new Date().toISOString(),
    }
    await deps.fs.writeTextFile(join(banjuanDir, 'config.json'), JSON.stringify(config, null, 2))
    await deps.fs.writeTextFile(join(banjuanDir, 'tags.json'), '[]')

    const dbPath = join(banjuanDir, 'db.sqlite')
    const db = await deps.dbFactory.open(dbPath)
    initSchema(db)

    return new Library(rootPath, db, deps)
  }

  static async open(rootPath: string, deps: PlatformDeps): Promise<Library> {
    const fs = deps.fs
    const banjuanDir = join(rootPath, '.banjuan')
    if (!(await fs.exists(banjuanDir))) {
      throw new Error(`${rootPath} is not a library — .banjuan directory not found`)
    }

    await Library.migrateExistingMindmapFiles(rootPath, fs)

    const dbPath = join(banjuanDir, 'db.sqlite')
    if (await fs.exists(dbPath)) await fs.remove(dbPath)
    const walPath = dbPath + '-wal'
    const shmPath = dbPath + '-shm'
    if (await fs.exists(walPath)) await fs.remove(walPath)
    if (await fs.exists(shmPath)) await fs.remove(shmPath)

    const db = await deps.dbFactory.open(dbPath)
    initSchema(db)

    return new Library(rootPath, db, deps)
  }

  static async migrateNotes(rootPath: string, fs: PlatformFS): Promise<{ migrated: number; errors: string[] }> {
    const notesDir = join(rootPath, '.banjuan', 'notes')
    return migrateNotesToJson(notesDir, fs)
  }

  async getConfig(): Promise<LibraryConfig> {
    const configPath = join(this.rootPath, '.banjuan', 'config.json')
    const text = await this.fs.readTextFile(configPath)
    return JSON.parse(text) as LibraryConfig
  }

  async getName(): Promise<string> {
    return (await this.getConfig()).name
  }

  async getSyncConfig(): Promise<SyncConfig | null> {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    if (!(await this.fs.exists(syncPath))) return null
    const text = await this.fs.readTextFile(syncPath)
    return JSON.parse(text) as SyncConfig
  }

  async saveSyncConfig(config: SyncConfig): Promise<void> {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    await this.fs.writeTextFile(syncPath, JSON.stringify(config, null, 2))
  }

  createSyncService(): SyncService {
    return new SyncService(this.rootPath, new WebDAVAdapter(this.fs), this.events, this.fs)
  }

  createIndexService(): IndexService {
    return new IndexService(this.db, this.rootPath, this.fs)
  }

  createStubService(): StubService {
    return new StubService(this.rootPath, new WebDAVAdapter(this.fs), this.fs)
  }

  private static async migrateExistingMindmapFiles(rootPath: string, fs: PlatformFS): Promise<void> {
    const banjuanDir = join(rootPath, '.banjuan')
    const notesDir = join(banjuanDir, 'notes')
    const oldDirs = [
      join(banjuanDir, 'mindmaps'),
      join(banjuanDir, 'data', 'mindmaps'),
    ]

    for (const oldDir of oldDirs) {
      if (!(await fs.exists(oldDir))) continue
      const scan = async (dir: string, prefix: string) => {
        const entries = await fs.readdirWithTypes(dir)
        for (const entry of entries) {
          const srcPath = join(dir, entry.name)
          if (entry.isDirectory) {
            await scan(srcPath, prefix ? `${prefix}/${entry.name}` : entry.name)
          } else if (entry.name.endsWith('.json')) {
            try {
              const rawText = await fs.readTextFile(srcPath)
              const raw = JSON.parse(rawText)
              if (!raw.id) continue
              const meta = {
                id: raw.id, title: raw.title,
                type: 'mindmap' as const,
                docId: raw.docId ?? null, folderId: null,
                annotationIds: [], tags: raw.tags ?? [],
                contentFormat: 'json' as const,
                typeMeta: { layout: raw.layout ?? 'mindmap', theme: raw.theme ?? 'classic' },
                createdAt: raw.createdAt, updatedAt: raw.updatedAt,
              }
              const newFileData = { meta, nodes: raw.nodes ?? [], edges: raw.edges ?? [] }
              const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
              const destPath = join(notesDir, relPath)
              if (!(await fs.exists(destPath))) {
                await fs.mkdir(dirname(destPath), { recursive: true })
                await fs.writeTextFile(destPath, JSON.stringify(newFileData, null, 2))
              }
            } catch { /* skip malformed files */ }
          }
        }
      }
      await scan(oldDir, '')
    }
  }

  private async walkFiles(): Promise<string[]> {
    const skipDirs = new Set(['.banjuan', 'node_modules', '.git'])
    const files: string[] = []
    const walk = async (dir: string) => {
      const entries = await this.fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory) {
          const topDir = relative(this.rootPath, fullPath).split('/')[0]
          if (skipDirs.has(topDir)) continue
          await walk(fullPath)
        } else {
          files.push(fullPath)
        }
      }
    }
    await walk(this.rootPath)
    return files
  }

  async scanAndImport(): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const files = await this.walkFiles()
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
    const allFiles = await this.walkFiles()
    const diskFiles = new Set(allFiles.map(f => relative(this.rootPath, f)))

    const removed = await this.documents.purgeOrphanMetadata(diskFiles)

    let imported = 0
    for (const relPath of diskFiles) {
      try {
        await this.documents.import(relPath)
        imported++
      } catch { /* already imported or unsupported */ }
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
```

Note: `name` getter becomes `getName()` async method because `getConfig()` is now async.

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/library.ts
git commit -m "refactor(core): Library class accepts PlatformDeps, all fs ops now async"
```

---

## Task 7: Refactor all core services to use platform interfaces

This task updates every service to replace `node:fs`, `node:path`, `node:crypto`, and `better-sqlite3` imports with platform abstractions. Each service needs:
- Replace `import type Database from 'better-sqlite3'` with `import type { PlatformDatabase } from '../platform/index.js'`
- Replace `node:path` with `'../platform/path.js'`
- Replace `node:fs` calls with `this.fs.*` (received via constructor)
- Make file-operation methods async where they weren't already
- JsonStore calls become awaited (since `JsonStore.read/write/delete/listAll` are now async)

**Files:**
- Modify: `packages/core/src/documents/service.ts`
- Modify: `packages/core/src/documents/metadata.ts`
- Modify: `packages/core/src/annotations/service.ts`
- Modify: `packages/core/src/notes/service.ts`
- Modify: `packages/core/src/notes/attachment-service.ts`
- Modify: `packages/core/src/notes/migration.ts`
- Modify: `packages/core/src/tags/service.ts`
- Modify: `packages/core/src/mindmaps/service.ts`
- Modify: `packages/core/src/sync/service.ts`
- Modify: `packages/core/src/sync/stub-service.ts`
- Modify: `packages/core/src/sync/webdav-adapter.ts`
- Modify: `packages/core/src/indexing/service.ts`
- Modify: `packages/core/src/indexing/watcher.ts`
- Modify: `packages/core/src/plugins/manager.ts`
- Modify: `packages/core/src/plugins/base.ts`
- Modify: `packages/core/src/search/service.ts`
- Modify: `packages/core/src/graph/service.ts`
- Modify: `packages/core/src/notes/folder-service.ts`
- Modify: `packages/core/src/notes/link-service.ts`
- Modify: `packages/core/src/notes/doc-link-service.ts`
- Modify: `packages/core/src/notes/template-service.ts`

The pattern is the same for each file. Here are the key changes per service:

- [ ] **Step 1: Refactor DocumentService**

Key changes in `documents/service.ts`:
- Constructor adds `fs: PlatformFS` and `crypto: PlatformCrypto` params
- `import { createHash } from 'node:crypto'` → use `this.crypto.sha256()`
- `import { readFileSync, existsSync, unlinkSync } from 'node:fs'` → use `this.fs.*`
- `import { join, relative, isAbsolute } from 'node:path'` → `import { join, relative, isAbsolute } from '../platform/path.js'`
- `import type Database from 'better-sqlite3'` → `import type { PlatformDatabase } from '../platform/index.js'`
- `JsonStore` constructor now takes `fs` parameter
- `this.store.read/write/delete/listAll` calls become awaited
- `purgeOrphanMetadata` becomes async

```typescript
// packages/core/src/documents/service.ts
import type { PlatformDatabase } from '../platform/index.js'
import type { PlatformFS } from '../platform/index.js'
import type { PlatformCrypto } from '../platform/index.js'
import { join, relative, isAbsolute } from '../platform/path.js'
// ... rest of imports unchanged except remove node:fs, node:path, node:crypto, better-sqlite3

export class DocumentService {
  private store: JsonStore<DocumentFileData>

  constructor(
    private db: PlatformDatabase,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
    private fs: PlatformFS,
    private crypto: PlatformCrypto,
  ) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'), fs)
  }

  async import(filePath: string, options?: { title?: string; tags?: string[] }): Promise<Document> {
    const absPath = isAbsolute(filePath) ? filePath : join(this.rootPath, filePath)
    if (!(await this.fs.exists(absPath))) {
      throw new Error(`File not found: ${absPath}`)
    }

    const relPath = relative(this.rootPath, absPath)
    if (relPath.startsWith('..')) {
      throw new Error('File must be inside the library directory')
    }

    const content = await this.fs.readFile(absPath)
    const hash = await this.crypto.sha256(content)

    // ... rest of method uses db.queryOne instead of db.prepare().get()
    const existingByPath = this.db.queryOne<{ id: string }>(
      'SELECT id FROM documents WHERE path = ?', [relPath]
    )
    if (existingByPath) {
      throw new Error(`File already imported at path: ${relPath}`)
    }

    const existing = await this.findExistingByPath(relPath)
    const type = detectDocumentType(absPath)
    const title = options?.title ?? existing?.title ?? extractTitle(absPath)
    const id = existing?.id ?? (await this.crypto.sha256(new TextEncoder().encode(relPath))).slice(0, 32)
    const now = new Date().toISOString()
    const tags = options?.tags ?? existing?.tags ?? []

    const fileData: DocumentFileData = {
      id, title, authors: existing?.authors ?? [], path: relPath, type, hash,
      tags, metadata: existing?.metadata ?? {}, createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    await this.store.write(fileData)

    this.db.run(
      `INSERT INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, JSON.stringify(fileData.authors), relPath, type, hash,
       JSON.stringify(fileData.metadata), fileData.createdAt, fileData.updatedAt]
    )

    this.search.index({ id, title, content: title, type: 'document' })

    const doc: Document = {
      id, title, authors: [], path: relPath, type, hash,
      metadata: {}, createdAt: now, updatedAt: now,
    }
    this.events.emit('document:imported', { document: doc })
    return doc
  }

  // All db.prepare(...).get/all/run calls become db.queryOne/query/run
  // All store.read/write/delete calls get await
  // Pattern repeats for list, get, update, delete, purgeOrphanMetadata
  // ...
}
```

- [ ] **Step 2: Refactor metadata.ts**

Replace `import { basename, extname } from 'node:path'` with `import { basename, extname } from '../platform/path.js'`.

- [ ] **Step 3: Refactor AnnotationService**

Same pattern: `PlatformDatabase` instead of `Database`, add `fs: PlatformFS` to constructor, `JsonStore` gets `fs`, await all store calls. `node:path` → `platform/path.js`.

- [ ] **Step 4: Refactor NoteService**

Largest service change. Replace all `readFileSync/writeFileSync/existsSync/mkdirSync/readdirSync/renameSync/unlinkSync` with `this.fs.*`. All operations that touch files become async. Constructor takes `fs: PlatformFS`.

- [ ] **Step 5: Refactor AttachmentService**

Replace `node:fs` with `this.fs.*`. Constructor takes `fs: PlatformFS`.

- [ ] **Step 6: Refactor notes/migration.ts**

`migrateNotesToJson` takes `fs: PlatformFS` parameter.

- [ ] **Step 7: Refactor TagService**

Replace `readFileSync/writeFileSync/existsSync` with `this.fs.*`. Constructor takes `fs: PlatformFS`. `readTagsFile/writeTagsFile` become async.

- [ ] **Step 8: Refactor MindmapService**

Same pattern. Constructor takes `fs: PlatformFS`.

- [ ] **Step 9: Refactor sync services**

`SyncService`, `StubService`, `WebDAVAdapter` — replace `node:fs` with `PlatformFS`. Constructors take `fs: PlatformFS`.

- [ ] **Step 10: Refactor IndexService**

Replace `node:fs` with `PlatformFS`. Constructor takes `fs: PlatformFS`. `JsonStore` gets `fs`.

- [ ] **Step 11: Refactor FileWatcher (indexing/watcher.ts)**

Make the watcher optional. On platforms without `node:fs.watch`, it becomes a no-op. The watcher depends on `node:fs.watch` which has no Capacitor equivalent.

```typescript
// Keep existing implementation but make it importable only from platform-node
// In core, export a WatcherFactory interface instead
```

For now, just replace the `node:path` imports and make the `Database` type generic. The actual watching will only work on Node.js — iPad triggers reindex manually after sync.

- [ ] **Step 12: Refactor SearchService, GraphService, FolderService, NoteLinkService, DocLinkService, TemplateService**

These services are database-only (no filesystem). Replace `import type Database from 'better-sqlite3'` with `import type { PlatformDatabase } from '../platform/index.js'`. Replace `db.prepare(sql).get/all/run(...)` calls with `db.queryOne/query/run(sql, [...])`.

- [ ] **Step 13: Refactor plugin system**

`PluginManager` and `BanjuanPlugin` base class: replace `node:fs` and `node:path`. Plugin dynamic import via `import(...)` only works on Node.js. Add a try/catch — on platforms that don't support it, plugins are simply unavailable (matching the spec: plugins deferred on iPad).

- [ ] **Step 14: Build core**

Run: `cd packages/core && pnpm build`
Expected: PASS — all files compile with new interfaces

- [ ] **Step 15: Run existing tests**

Run: `cd packages/core && pnpm test`

Tests will need updating to provide `PlatformDeps` (use `NodeFS`, `NodeDatabaseFactory`, `NodeCrypto` from platform-node). Update test files to use `await Library.open(...)` instead of `Library.open(...)`.

- [ ] **Step 16: Commit**

```bash
git add packages/core/src/
git commit -m "refactor(core): all services use platform interfaces instead of node:fs/better-sqlite3"
```

---

## Task 8: Update Electron app to use platform-node

**Files:**
- Modify: `packages/app/package.json` (add `@banjuan/platform-node` dependency)
- Modify: `packages/app/src/main/index.ts` (or wherever Library is instantiated)

- [ ] **Step 1: Add platform-node dependency**

Add `"@banjuan/platform-node": "workspace:*"` to `packages/app/package.json` dependencies.

- [ ] **Step 2: Update Library instantiation in main process**

Find where `Library.init()` and `Library.open()` are called in the Electron main process and update them:

```typescript
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'

const deps = {
  fs: new NodeFS(),
  dbFactory: new NodeDatabaseFactory(),
  crypto: new NodeCrypto(),
}

// Before: Library.open(rootPath)
// After:
const library = await Library.open(rootPath, deps)
```

Update all call sites. The `Library.isLibrary()` and `Library.migrateNotes()` calls also need `deps` or `fs` parameter now.

- [ ] **Step 3: Handle sync `name` getter → async `getName()`**

The old `Library.name` was a sync getter. It's now `library.getName()` (async). Find all usages in the main process and update.

- [ ] **Step 4: Build and test desktop app**

Run: `cd packages/app && pnpm build`
Then manually test: `pnpm dev`

Expected: Desktop app works identically to before.

- [ ] **Step 5: Commit**

```bash
git add packages/app/
git commit -m "feat(app): use platform-node for Library initialization"
```

---

## Task 9: Create BanjuanAPI interface and Context in shared-ui

**Files:**
- Create: `packages/shared-ui/package.json`
- Create: `packages/shared-ui/tsconfig.json`
- Create: `packages/shared-ui/src/api.ts`
- Create: `packages/shared-ui/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@banjuan/shared-ui",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@banjuan/core": "workspace:*",
    "@blocknote/core": "^0.49.0",
    "@blocknote/mantine": "^0.49.0",
    "@blocknote/react": "^0.49.0",
    "@codemirror/commands": "^6.10.3",
    "@codemirror/lang-markdown": "^6.5.0",
    "@codemirror/state": "^6.6.0",
    "@codemirror/theme-one-dark": "^6.1.3",
    "@codemirror/view": "^6.41.1",
    "@mantine/core": "^8.3.18",
    "@mantine/hooks": "^8.3.18",
    "@xyflow/react": "^12.10.2",
    "d3": "^7.9.0",
    "elkjs": "^0.11.1",
    "epubjs": "^0.3.93",
    "framer-motion": "^12.38.0",
    "html-to-image": "^1.11.13",
    "lucide-react": "^1.14.0",
    "mermaid": "^11.14.0",
    "pdfjs-dist": "4.10.38",
    "perfect-freehand": "^1.2.3",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "zustand": "^5.0.12"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create BanjuanAPI interface and Context**

Derive from the existing preload script shape (`packages/app/src/preload/index.ts`):

```typescript
// packages/shared-ui/src/api.ts
import { createContext, useContext } from 'react'
import type {
  Document, DocumentListOptions, DocumentUpdateInput,
  Annotation, AnnotationCreateInput, AnnotationListOptions,
  Note, NoteCreateInput, NoteListOptions,
  Folder, FolderCreateInput,
  Tag, TagTarget,
  MindmapNode, MindmapNodeCreateInput, MindmapEdge, MindmapEdgeCreateInput,
  MindmapBoundary, MindmapSummary,
  GraphData,
  NoteTemplate, NoteTemplateCreateInput,
  SyncConfig, DocumentSyncStatus,
  PluginInfo, PluginCommand, PluginViewInfo,
} from '@banjuan/core'

export interface BanjuanAPI {
  library: {
    check(path: string): Promise<boolean>
    init(path: string, name?: string): Promise<void>
    open(path: string): Promise<{ name: string }>
    isOpen(): Promise<boolean>
  }
  dialog: {
    openDirectory(): Promise<string | null>
    openFile?(options?: { filters?: string[] }): Promise<string | null>
  }
  documents: {
    import(): Promise<Document | null>
    list(options?: DocumentListOptions): Promise<Document[]>
    get(id: string): Promise<Document | null>
    delete(id: string): Promise<void>
    update(id: string, updates: DocumentUpdateInput): Promise<Document | null>
    getFilePath(relativePath: string): Promise<string>
    readContent(relativePath: string): Promise<string>
    readFileBuffer(relativePath: string): Promise<ArrayBuffer>
  }
  tags: {
    list(): Promise<Tag[]>
    listWithCounts(): Promise<Array<Tag & { count: number }>>
    create(input: { name: string; color?: string }): Promise<Tag>
    forTarget(id: string, type: TagTarget): Promise<Tag[]>
    assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void>
    unassign(targetId: string, targetType: TagTarget, tagName: string): Promise<void>
    delete(tagId: string): Promise<void>
    rename(tagId: string, newName: string): Promise<void>
    updateColor(tagId: string, color: string): Promise<void>
  }
  annotations: {
    create(input: AnnotationCreateInput): Promise<Annotation>
    list(options: AnnotationListOptions): Promise<Annotation[]>
    get(id: string): Promise<Annotation | null>
    update(id: string, updates: { content?: string; color?: string; position?: unknown }): Promise<Annotation>
    delete(id: string): Promise<void>
  }
  notes: {
    create(input: NoteCreateInput): Promise<Note>
    list(options?: NoteListOptions): Promise<Note[]>
    get(id: string): Promise<Note | null>
    update(id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }): Promise<Note>
    delete(id: string): Promise<void>
    getAnnotations(noteId: string): Promise<Annotation[]>
    move(id: string, targetFolder: string | null): Promise<Note>
    listDirs(): Promise<string[]>
    createDir(dirPath: string): Promise<void>
    renameDir(oldPath: string, newPath: string): Promise<void>
    onNavigateLink?(callback: (noteId: string) => void): () => void
  }
  folders: {
    create(input: FolderCreateInput): Promise<Folder>
    getTree(): Promise<Folder[]>
    update(id: string, updates: { name?: string; parentId?: string; sortOrder?: number }): Promise<Folder>
    delete(id: string): Promise<void>
  }
  attachments: {
    save(noteId: string, fileName: string, data: ArrayBuffer): Promise<string>
    getPath(relativePath: string): Promise<string>
    delete(relativePath: string): Promise<void>
    open?(relativePath: string): Promise<void>
  }
  noteLinks: {
    getBacklinks(noteId: string): Promise<Array<{ sourceId: string; targetId: string; context: string }>>
    getForwardLinks(noteId: string): Promise<Array<{ sourceId: string; targetId: string; context: string }>>
    sync(noteId: string, links: Array<{ targetId: string; context: string }>): Promise<void>
  }
  docLinks: {
    getBacklinks(docId: string): Promise<Array<{ sourceId: string; targetId: string; context: string }>>
    getForwardLinks(noteId: string): Promise<Array<{ sourceId: string; targetId: string; context: string }>>
    sync(noteId: string, links: Array<{ targetId: string; context: string }>): Promise<void>
  }
  templates: {
    list(): Promise<NoteTemplate[]>
    get(id: string): Promise<NoteTemplate | null>
    create(input: NoteTemplateCreateInput): Promise<NoteTemplate>
    update(id: string, updates: Partial<NoteTemplateCreateInput & { sortOrder: number }>): Promise<NoteTemplate>
    delete(id: string): Promise<void>
  }
  mindmaps: {
    addNode(noteId: string, input: MindmapNodeCreateInput): Promise<MindmapNode>
    getNodes(noteId: string): Promise<MindmapNode[]>
    findNodesByNoteId(noteId: string): Promise<MindmapNode[]>
    updateNode(id: string, updates: Partial<MindmapNodeCreateInput & { collapsed: boolean; sortOrder: number; parentId: string }>): Promise<MindmapNode>
    removeNode(id: string): Promise<void>
    addEdge(noteId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge>
    getEdges(noteId: string): Promise<MindmapEdge[]>
    updateEdge(id: string, updates: { label?: string }): Promise<MindmapEdge>
    removeEdge(id: string): Promise<void>
    addBoundary(mindmapId: string, input: { nodeIds: string[]; label?: string; color?: string }): Promise<MindmapBoundary>
    getBoundaries(mindmapId: string): Promise<MindmapBoundary[]>
    updateBoundary(id: string, updates: { label?: string; color?: string; nodeIds?: string[] }): Promise<MindmapBoundary>
    removeBoundary(id: string): Promise<void>
    addSummary(mindmapId: string, input: { nodeIds: string[]; summaryTitle?: string }): Promise<MindmapSummary>
    getSummaries(mindmapId: string): Promise<MindmapSummary[]>
    removeSummary(id: string): Promise<void>
  }
  graph: {
    getData(): Promise<GraphData>
  }
  plugins?: {
    list(): Promise<PluginInfo[]>
    enable(pluginId: string): Promise<void>
    disable(pluginId: string): Promise<void>
    rpc(pluginId: string, method: string, args: unknown[]): Promise<unknown>
    getViews(): Promise<PluginViewInfo[]>
    getRendererSource(pluginId: string): Promise<string>
    getCssSource(pluginId: string): Promise<string>
  }
  sync: {
    getConfig(): Promise<SyncConfig | null>
    saveConfig(config: SyncConfig): Promise<void>
    run(): Promise<{ uploaded: number; downloaded: number; errors: string[] }>
    stubList?(): Promise<unknown[]>
    stubDownload?(docId: string): Promise<void>
    stubUpload?(docId: string): Promise<void>
    getDocStatus?(docId: string): Promise<DocumentSyncStatus>
  }
  export?: {
    markdown(input: { title: string; markdown: string; attachments: string[] }): Promise<string | null>
    pdf?(input: { title: string; html: string; attachments: string[] }): Promise<string | null>
  }
  clipboard?: {
    readFiles(): Promise<Array<{ path: string; name: string }>>
    readFileBuffer(filePath: string): Promise<ArrayBuffer>
  }
  index: {
    rebuild(): Promise<void>
  }
}

const BanjuanAPIContext = createContext<BanjuanAPI | null>(null)

export const BanjuanAPIProvider = BanjuanAPIContext.Provider

export function useBanjuanAPI(): BanjuanAPI {
  const api = useContext(BanjuanAPIContext)
  if (!api) throw new Error('useBanjuanAPI must be used within BanjuanAPIProvider')
  return api
}
```

- [ ] **Step 3: Create barrel export**

```typescript
// packages/shared-ui/src/index.ts
export { BanjuanAPIProvider, useBanjuanAPI } from './api.js'
export type { BanjuanAPI } from './api.js'
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared-ui/
git commit -m "feat(shared-ui): create BanjuanAPI interface, Context, and useBanjuanAPI hook"
```

---

## Task 10: Move shared views/components from app to shared-ui

**Files:**
- Move: `packages/app/src/renderer/views/{LibraryView,NoteView,DocumentViewer,GraphView,TagManagerView,PluginViewHost}.tsx` → `packages/shared-ui/src/views/`
- Move: `packages/app/src/renderer/components/{TabManager,annotations,graph,handwriting,mindmap,notes,sync,tags,viewers,ResizeHandle,NoteRenderService,TitleBar}` → `packages/shared-ui/src/components/`
- Move: `packages/app/src/renderer/stores/` → `packages/shared-ui/src/stores/`
- Move: `packages/app/src/renderer/styles/` → `packages/shared-ui/src/styles/`
- Move: `packages/app/src/renderer/i18n/` → `packages/shared-ui/src/i18n/`
- Keep: `packages/app/src/renderer/{index.tsx,App.tsx,WelcomeView.tsx}`

- [ ] **Step 1: Move files using git mv**

```bash
# Create target directories
mkdir -p packages/shared-ui/src/{views,components,stores,styles,i18n}

# Move views (except WelcomeView)
git mv packages/app/src/renderer/views/LibraryView.tsx packages/shared-ui/src/views/
git mv packages/app/src/renderer/views/NoteView.tsx packages/shared-ui/src/views/
git mv packages/app/src/renderer/views/GraphView.tsx packages/shared-ui/src/views/
git mv packages/app/src/renderer/views/TagManagerView.tsx packages/shared-ui/src/views/
git mv packages/app/src/renderer/views/PluginViewHost.tsx packages/shared-ui/src/views/
# Move DocumentViewer if it exists as a view
# Check: may be in components/viewers/ instead

# Move components
git mv packages/app/src/renderer/components/TabManager.tsx packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/annotations packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/graph packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/handwriting packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/mindmap packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/notes packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/sync packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/tags packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/viewers packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/ResizeHandle.tsx packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/NoteRenderService.tsx packages/shared-ui/src/components/
git mv packages/app/src/renderer/components/TitleBar.tsx packages/shared-ui/src/components/

# Move stores, styles, i18n if they exist as directories
# (check actual structure and adjust)
```

- [ ] **Step 2: Replace all `window.electronAPI` calls with `useBanjuanAPI()`**

In every moved file, replace:
```typescript
// Before
const result = await window.electronAPI.documents.list()

// After
import { useBanjuanAPI } from '../api.js'
// inside component:
const api = useBanjuanAPI()
const result = await api.documents.list()
```

This is a mechanical find-and-replace across ~40+ call sites. Each component that calls `window.electronAPI` needs:
1. Import `useBanjuanAPI`
2. Call `const api = useBanjuanAPI()` in the component body
3. Replace `window.electronAPI.x.y(...)` with `api.x.y(...)`

- [ ] **Step 3: Update shared-ui barrel exports**

Add view and component exports to `packages/shared-ui/src/index.ts`:

```typescript
export { BanjuanAPIProvider, useBanjuanAPI } from './api.js'
export type { BanjuanAPI } from './api.js'
export { TabManager } from './components/TabManager.js'
export { LibraryView } from './views/LibraryView.js'
export { NoteView } from './views/NoteView.js'
export { GraphView } from './views/GraphView.js'
export { TagManagerView } from './views/TagManagerView.js'
// ... etc
```

- [ ] **Step 4: Update app to import from shared-ui**

In `packages/app/package.json`, add:
```json
"@banjuan/shared-ui": "workspace:*"
```

Create `packages/app/src/renderer/electron-api.ts`:

```typescript
import type { BanjuanAPI } from '@banjuan/shared-ui'

// window.electronAPI already matches BanjuanAPI shape
export const electronAPI: BanjuanAPI = (window as any).electronAPI
```

Update `packages/app/src/renderer/App.tsx`:

```typescript
import { BanjuanAPIProvider, TabManager } from '@banjuan/shared-ui'
import { electronAPI } from './electron-api.js'
import { WelcomeView } from './WelcomeView.js'

function App() {
  const [libraryOpen, setLibraryOpen] = useState(false)
  // ...

  return (
    <BanjuanAPIProvider value={electronAPI}>
      {libraryOpen ? <TabManager /> : <WelcomeView onOpen={() => setLibraryOpen(true)} />}
    </BanjuanAPIProvider>
  )
}
```

- [ ] **Step 5: Build and test desktop app**

Run: `pnpm build` (all packages)
Then: `cd packages/app && pnpm dev`

Expected: Desktop app works identically.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-ui/ packages/app/
git commit -m "feat: extract shared UI components from app to shared-ui package"
```

---

## Task 11: Create platform-capacitor package

**Files:**
- Create: `packages/platform-capacitor/package.json`
- Create: `packages/platform-capacitor/tsconfig.json`
- Create: `packages/platform-capacitor/src/fs.ts`
- Create: `packages/platform-capacitor/src/database.ts`
- Create: `packages/platform-capacitor/src/crypto.ts`
- Create: `packages/platform-capacitor/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@banjuan/platform-capacitor",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@banjuan/core": "workspace:*",
    "@capacitor/core": "^6.0.0",
    "@capacitor/filesystem": "^6.0.0",
    "@capacitor-community/sqlite": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create CapacitorFS**

```typescript
// packages/platform-capacitor/src/fs.ts
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { PlatformFS } from '@banjuan/core'

export class CapacitorFS implements PlatformFS {
  constructor(private baseDir: string) {}

  private resolvePath(path: string): string {
    if (path.startsWith(this.baseDir)) return path
    return `${this.baseDir}/${path}`
  }

  async readFile(path: string): Promise<Uint8Array> {
    const result = await Filesystem.readFile({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    const binary = atob(result.data as string)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  async readTextFile(path: string): Promise<string> {
    const result = await Filesystem.readFile({
      path: this.resolvePath(path),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return result.data as string
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    let binary = ''
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
    const base64 = btoa(binary)
    await Filesystem.writeFile({
      path: this.resolvePath(path),
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    })
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await Filesystem.writeFile({
      path: this.resolvePath(path),
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path: this.resolvePath(path), directory: Directory.Documents })
      return true
    } catch {
      return false
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await Filesystem.mkdir({
        path: this.resolvePath(path),
        directory: Directory.Documents,
        recursive: options?.recursive,
      })
    } catch { /* may already exist */ }
  }

  async readdir(path: string): Promise<string[]> {
    const result = await Filesystem.readdir({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    return result.files.map(f => f.name)
  }

  async readdirWithTypes(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const result = await Filesystem.readdir({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    return result.files.map(f => ({
      name: f.name,
      isDirectory: f.type === 'directory',
    }))
  }

  async remove(path: string): Promise<void> {
    await Filesystem.deleteFile({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await Filesystem.rmdir({
      path: this.resolvePath(path),
      directory: Directory.Documents,
      recursive: options?.recursive,
    })
  }

  async stat(path: string): Promise<{ mtime: number; size: number }> {
    const result = await Filesystem.stat({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    return { mtime: result.mtime, size: result.size }
  }

  async rename(from: string, to: string): Promise<void> {
    await Filesystem.rename({
      from: this.resolvePath(from),
      to: this.resolvePath(to),
      directory: Directory.Documents,
    })
  }
}
```

- [ ] **Step 3: Create CapacitorDatabase**

```typescript
// packages/platform-capacitor/src/database.ts
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { PlatformDatabase, DatabaseFactory } from '@banjuan/core'

class CapacitorDatabase implements PlatformDatabase {
  constructor(private conn: SQLiteDBConnection) {}

  execute(sql: string, params?: unknown[]): void {
    if (params?.length) {
      this.conn.run(sql, params as any[])
    } else {
      this.conn.execute(sql)
    }
  }

  run(sql: string, params?: unknown[]): { changes: number } {
    const result = this.conn.run(sql, (params ?? []) as any[])
    return { changes: result.changes?.changes ?? 0 }
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    const result = this.conn.query(sql, (params ?? []) as any[])
    return (result.values ?? []) as T[]
  }

  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
    const rows = this.query<T>(sql, params)
    return rows[0]
  }

  pragma(name: string, value?: unknown): unknown {
    const sql = value !== undefined ? `PRAGMA ${name} = ${value}` : `PRAGMA ${name}`
    const result = this.conn.query(sql, [])
    return result.values
  }

  transaction<R>(fn: () => R): R {
    this.conn.execute('BEGIN TRANSACTION')
    try {
      const result = fn()
      this.conn.execute('COMMIT')
      return result
    } catch (err) {
      this.conn.execute('ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.conn.close()
  }
}

export class CapacitorDatabaseFactory implements DatabaseFactory {
  private sqlite = new SQLiteConnection(CapacitorSQLite)

  async open(path: string): Promise<PlatformDatabase> {
    const dbName = path.replace(/.*\//, '').replace('.sqlite', '')
    await this.sqlite.checkConnectionsConsistency()
    const conn = await this.sqlite.createConnection(dbName, false, 'no-encryption', 1, false)
    await conn.open()
    return new CapacitorDatabase(conn)
  }
}
```

- [ ] **Step 4: Create WebCrypto**

```typescript
// packages/platform-capacitor/src/crypto.ts
import type { PlatformCrypto } from '@banjuan/core'

export class WebCrypto implements PlatformCrypto {
  async sha256(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(hash)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }
}
```

- [ ] **Step 5: Create barrel export**

```typescript
// packages/platform-capacitor/src/index.ts
export { CapacitorFS } from './fs.js'
export { CapacitorDatabaseFactory } from './database.js'
export { WebCrypto } from './crypto.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/platform-capacitor/
git commit -m "feat: create platform-capacitor with CapacitorFS, CapacitorDatabase, WebCrypto"
```

---

## Task 12: Create mobile Capacitor package

**Files:**
- Create: `packages/mobile/package.json`
- Create: `packages/mobile/capacitor.config.ts`
- Create: `packages/mobile/vite.config.ts`
- Create: `packages/mobile/tsconfig.json`
- Create: `packages/mobile/index.html`
- Create: `packages/mobile/src/index.tsx`
- Create: `packages/mobile/src/App.tsx`
- Create: `packages/mobile/src/WelcomeView.tsx`
- Create: `packages/mobile/src/capacitor-api.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@banjuan/mobile",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "cap:sync": "npx cap sync",
    "cap:open": "npx cap open ios"
  },
  "dependencies": {
    "@banjuan/core": "workspace:*",
    "@banjuan/platform-capacitor": "workspace:*",
    "@banjuan/shared-ui": "workspace:*",
    "@capacitor/core": "^6.0.0",
    "@capacitor/filesystem": "^6.0.0",
    "@capacitor/ios": "^6.0.0",
    "@capacitor-community/sqlite": "^6.0.0",
    "@mantine/core": "^8.3.18",
    "@mantine/hooks": "^8.3.18",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.3.0"
  }
}
```

- [ ] **Step 2: Create capacitor.config.ts**

```typescript
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.banjuan.app',
  appName: 'Banjuan',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
    },
  },
}

export default config
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Banjuan</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create capacitor-api.ts**

This file creates a `BanjuanAPI` implementation that directly calls core library methods via platform-capacitor:

```typescript
// packages/mobile/src/capacitor-api.ts
import { Library } from '@banjuan/core'
import type { PlatformDeps } from '@banjuan/core'
import { CapacitorFS, CapacitorDatabaseFactory, WebCrypto } from '@banjuan/platform-capacitor'
import type { BanjuanAPI } from '@banjuan/shared-ui'

let library: Library | null = null

function createDeps(baseDir: string): PlatformDeps {
  return {
    fs: new CapacitorFS(baseDir),
    dbFactory: new CapacitorDatabaseFactory(),
    crypto: new WebCrypto(),
  }
}

export function createCapacitorAPI(): BanjuanAPI {
  return {
    library: {
      async check(path) {
        return Library.isLibrary(path, createDeps(path))
      },
      async init(path, name) {
        const deps = createDeps(path)
        library = await Library.init(path, deps, name)
      },
      async open(path) {
        const deps = createDeps(path)
        library = await Library.open(path, deps)
        const name = await library.getName()
        return { name }
      },
      async isOpen() {
        return library !== null
      },
    },

    dialog: {
      async openDirectory() {
        // iPad: use a fixed library path within Documents
        return 'BanjuanLibrary'
      },
    },

    documents: {
      async import() {
        // iPad: use Capacitor FilePicker, then call library.documents.import()
        return null
      },
      async list(options) { return library!.documents.list(options) },
      async get(id) { return library!.documents.get(id) },
      async delete(id) { return library!.documents.delete(id) },
      async update(id, updates) { return library!.documents.update(id, updates) },
      async getFilePath(relativePath) {
        // Return the absolute path within Capacitor filesystem
        return `${library!.rootPath}/${relativePath}`
      },
      async readContent(relativePath) {
        const deps = createDeps(library!.rootPath)
        return deps.fs.readTextFile(`${library!.rootPath}/${relativePath}`)
      },
      async readFileBuffer(relativePath) {
        const deps = createDeps(library!.rootPath)
        const data = await deps.fs.readFile(`${library!.rootPath}/${relativePath}`)
        return data.buffer as ArrayBuffer
      },
    },

    tags: {
      async list() { return library!.tags.list() },
      async listWithCounts() { return library!.tags.listWithCounts() },
      async create(input) { return library!.tags.create(input) },
      async forTarget(id, type) { return library!.tags.forTarget(id, type) },
      async assign(targetId, targetType, tagNames) { return library!.tags.assign(targetId, targetType, tagNames) },
      async unassign(targetId, targetType, tagName) { return library!.tags.unassign(targetId, targetType, tagName) },
      async delete(tagId) { return library!.tags.delete(tagId) },
      async rename(tagId, newName) { return library!.tags.rename(tagId, newName) },
      async updateColor(tagId, color) { return library!.tags.updateColor(tagId, color) },
    },

    annotations: {
      async create(input) { return library!.annotations.create(input) },
      async list(options) { return library!.annotations.list(options) },
      async get(id) { return library!.annotations.get(id) },
      async update(id, updates) { return library!.annotations.update(id, updates) },
      async delete(id) { return library!.annotations.delete(id) },
    },

    notes: {
      async create(input) { return library!.notes.create(input) },
      async list(options) { return library!.notes.list(options) },
      async get(id) { return library!.notes.get(id) },
      async update(id, updates) { return library!.notes.update(id, updates) },
      async delete(id) { return library!.notes.delete(id) },
      async getAnnotations(noteId) { return library!.notes.getAnnotations(noteId) },
      async move(id, targetFolder) { return library!.notes.move(id, targetFolder) },
      async listDirs() { return library!.notes.listDirs() },
      async createDir(dirPath) { return library!.notes.createDir(dirPath) },
      async renameDir(oldPath, newPath) { return library!.notes.renameDir(oldPath, newPath) },
    },

    folders: {
      async create(input) { return library!.folders.create(input) },
      async getTree() { return library!.folders.getTree() },
      async update(id, updates) { return library!.folders.update(id, updates) },
      async delete(id) { return library!.folders.delete(id) },
    },

    attachments: {
      async save(noteId, fileName, data) {
        return library!.attachments.save(noteId, fileName, Buffer.from(data))
      },
      async getPath(relativePath) { return `${library!.rootPath}/.banjuan/attachments/${relativePath}` },
      async delete(relativePath) { return library!.attachments.delete(relativePath) },
    },

    noteLinks: {
      async getBacklinks(noteId) { return library!.noteLinks.getBacklinks(noteId) },
      async getForwardLinks(noteId) { return library!.noteLinks.getForwardLinks(noteId) },
      async sync(noteId, links) { return library!.noteLinks.sync(noteId, links) },
    },

    docLinks: {
      async getBacklinks(docId) { return library!.docLinks.getBacklinks(docId) },
      async getForwardLinks(noteId) { return library!.docLinks.getForwardLinks(noteId) },
      async sync(noteId, links) { return library!.docLinks.sync(noteId, links) },
    },

    templates: {
      async list() { return library!.templates.list() },
      async get(id) { return library!.templates.get(id) },
      async create(input) { return library!.templates.create(input) },
      async update(id, updates) { return library!.templates.update(id, updates) },
      async delete(id) { return library!.templates.delete(id) },
    },

    mindmaps: {
      async addNode(noteId, input) { return library!.mindmaps.addNode(noteId, input) },
      async getNodes(noteId) { return library!.mindmaps.getNodes(noteId) },
      async findNodesByNoteId(noteId) { return library!.mindmaps.findNodesByNoteId(noteId) },
      async updateNode(id, updates) { return library!.mindmaps.updateNode(id, updates) },
      async removeNode(id) { return library!.mindmaps.removeNode(id) },
      async addEdge(noteId, input) { return library!.mindmaps.addEdge(noteId, input) },
      async getEdges(noteId) { return library!.mindmaps.getEdges(noteId) },
      async updateEdge(id, updates) { return library!.mindmaps.updateEdge(id, updates) },
      async removeEdge(id) { return library!.mindmaps.removeEdge(id) },
      async addBoundary(mindmapId, input) { return library!.mindmaps.addBoundary(mindmapId, input) },
      async getBoundaries(mindmapId) { return library!.mindmaps.getBoundaries(mindmapId) },
      async updateBoundary(id, updates) { return library!.mindmaps.updateBoundary(id, updates) },
      async removeBoundary(id) { return library!.mindmaps.removeBoundary(id) },
      async addSummary(mindmapId, input) { return library!.mindmaps.addSummary(mindmapId, input) },
      async getSummaries(mindmapId) { return library!.mindmaps.getSummaries(mindmapId) },
      async removeSummary(id) { return library!.mindmaps.removeSummary(id) },
    },

    graph: {
      async getData() { return library!.graph.getData() },
    },

    sync: {
      async getConfig() { return library!.getSyncConfig() },
      async saveConfig(config) { return library!.saveSyncConfig(config) },
      async run() {
        const svc = library!.createSyncService()
        const syncConfig = await library!.getSyncConfig()
        if (!syncConfig) throw new Error('No sync configuration found')
        await svc.connect(syncConfig)
        const result = await svc.sync()
        // Rebuild index after sync
        const indexSvc = library!.createIndexService()
        await indexSvc.rebuildAll()
        return result
      },
    },

    index: {
      async rebuild() {
        const svc = library!.createIndexService()
        await svc.rebuildAll()
      },
    },
  }
}
```

- [ ] **Step 6: Create entry point and App**

```typescript
// packages/mobile/src/index.tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

createRoot(document.getElementById('root')!).render(<App />)
```

```typescript
// packages/mobile/src/App.tsx
import { useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { BanjuanAPIProvider, TabManager } from '@banjuan/shared-ui'
import { createCapacitorAPI } from './capacitor-api.js'
import { WelcomeView } from './WelcomeView.js'

import '@mantine/core/styles.css'

const api = createCapacitorAPI()

export function App() {
  const [libraryOpen, setLibraryOpen] = useState(false)

  return (
    <MantineProvider>
      <BanjuanAPIProvider value={api}>
        {libraryOpen
          ? <TabManager />
          : <WelcomeView onOpen={() => setLibraryOpen(true)} />
        }
      </BanjuanAPIProvider>
    </MantineProvider>
  )
}
```

- [ ] **Step 7: Create WelcomeView for iPad**

```typescript
// packages/mobile/src/WelcomeView.tsx
import { useState } from 'react'
import { Button, Stack, Text, TextInput, Container } from '@mantine/core'
import { useBanjuanAPI } from '@banjuan/shared-ui'

interface Props {
  onOpen: () => void
}

export function WelcomeView({ onOpen }: Props) {
  const api = useBanjuanAPI()
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    setLoading(true)
    try {
      const path = 'BanjuanLibrary'
      const exists = await api.library.check(path)
      if (exists) {
        await api.library.open(path)
      } else {
        await api.library.init(path, 'My Library')
      }
      // Trigger sync on first open
      try {
        await api.sync.run()
      } catch { /* sync config may not be set yet */ }
      onOpen()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size="sm" style={{ paddingTop: 80, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Stack align="center" gap="lg">
        <Text size="xl" fw={700}>Banjuan</Text>
        <Text c="dimmed">Knowledge Management</Text>
        <Button size="lg" onClick={handleOpen} loading={loading}>
          Open Library
        </Button>
      </Stack>
    </Container>
  )
}
```

- [ ] **Step 8: Initialize Capacitor iOS project**

```bash
cd packages/mobile
pnpm install
npx cap add ios
```

- [ ] **Step 9: Build and sync**

```bash
cd packages/mobile
pnpm build
npx cap sync ios
```

- [ ] **Step 10: Commit**

```bash
git add packages/mobile/
git commit -m "feat: create mobile Capacitor package with iPad/iPhone support"
```

---

## Task 13: UI responsive adaptation for iPad/iPhone

**Files:**
- Modify: `packages/shared-ui/src/components/TabManager.tsx`
- Modify: `packages/shared-ui/src/views/LibraryView.tsx`

- [ ] **Step 1: Add responsive sidebar in TabManager**

Use Mantine's `useMediaQuery` to detect screen size. On narrow screens, sidebar becomes a Drawer:

```typescript
import { useMediaQuery } from '@mantine/hooks'
import { Drawer } from '@mantine/core'

// Inside TabManager component:
const isNarrow = useMediaQuery('(max-width: 768px)')
const [sidebarOpen, setSidebarOpen] = useState(false)

// If narrow: wrap sidebar content in <Drawer opened={sidebarOpen} ...>
// If wide: render sidebar inline as before
```

- [ ] **Step 2: Add safe area padding for iOS**

Add CSS for iOS safe areas (notch, home indicator):

```css
/* packages/shared-ui/src/styles/mobile.css */
@supports (padding: env(safe-area-inset-top)) {
  .app-container {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ui/
git commit -m "feat(shared-ui): responsive layout for iPad/iPhone with drawer sidebar"
```

---

## Task 14: Touch event adaptation

**Files:**
- Modify: `packages/shared-ui/src/components/annotations/` (PDF annotation tools)
- Modify: `packages/shared-ui/src/components/viewers/` (document viewers)

- [ ] **Step 1: Replace mouse events with Pointer Events in PDF annotation overlay**

Find annotation overlay components that use `onMouseDown/onMouseMove/onMouseUp` and replace with `onPointerDown/onPointerMove/onPointerUp`. Pointer Events work across mouse, touch, and stylus.

```typescript
// Before:
onMouseDown={handleStart}
onMouseMove={handleMove}
onMouseUp={handleEnd}

// After:
onPointerDown={handleStart}
onPointerMove={handleMove}
onPointerUp={handleEnd}
style={{ touchAction: 'none' }} // prevent browser gestures during annotation
```

- [ ] **Step 2: Add long-press for context menus**

Replace right-click context menu triggers with long-press detection:

```typescript
import { useRef, useCallback } from 'react'

function useLongPress(callback: (e: React.PointerEvent) => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    timer.current = setTimeout(() => callback(e), delay)
  }, [callback, delay])
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return { onPointerDown, onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ui/
git commit -m "feat(shared-ui): touch adaptation with Pointer Events and long-press menus"
```

---

## Task 15: End-to-end build and verification

- [ ] **Step 1: Full monorepo build**

```bash
pnpm install
pnpm -r build
```

Expected: All packages build successfully.

- [ ] **Step 2: Test desktop app**

```bash
cd packages/app && pnpm dev
```

Verify: create library, import document, create notes, add annotations, use mindmap, sync — all working as before.

- [ ] **Step 3: Build and open mobile in Xcode**

```bash
cd packages/mobile
pnpm build
npx cap sync ios
npx cap open ios
```

Run on iPad simulator. Verify: app launches, WelcomeView shows, can create/open library.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end build and verification fixes"
```
