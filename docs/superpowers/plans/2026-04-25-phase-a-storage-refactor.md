# Phase A: Storage Layer Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor all @banjuan/core services from SQLite-first to file-first storage, where JSON/Markdown files are the source of truth and SQLite is a rebuild-able local index cache.

**Architecture:** Each entity (document metadata, annotation, mindmap) stored as independent JSON file under `.banjuan/data/{type}/{prefix}/{id}.json`. Notes stored as `.md` with YAML frontmatter under `notes/` with user-chosen filenames. Tags defined in `.banjuan/tags.json`, assigned by embedding tag names in each entity's file. SQLite schema retained (minus FK constraints) as a query cache. All writes go: file → SQLite index → EventBus event. IndexService can rebuild SQLite entirely from files.

**Tech Stack:** TypeScript, better-sqlite3, yaml (YAML parser), uuid, vitest

**Spec:** `docs/superpowers/specs/2026-04-25-sync-architecture-design.md`

---

## File Structure

**Create:**
- `packages/core/src/storage/json-store.ts` — Generic read/write/delete/list for JSON files with UUID-prefix subdirectories
- `packages/core/src/storage/frontmatter.ts` — Parse and serialize Markdown with YAML frontmatter
- `packages/core/src/storage/index.ts` — Barrel exports for storage module
- `packages/core/src/indexing/service.ts` — IndexService: full and incremental SQLite rebuild from files
- `packages/core/src/indexing/watcher.ts` — FileWatcher: real-time file change detection → index update
- `packages/core/test/storage.test.ts` — Tests for JsonStore and frontmatter utilities
- `packages/core/test/indexing.test.ts` — Tests for IndexService and FileWatcher

**Modify:**
- `packages/core/package.json` — Add `yaml` dependency
- `packages/core/src/types.ts` — Add file data interfaces, extend TagTarget
- `packages/core/src/db/schema.ts` — Remove FK constraints, add mindmap_tags table
- `packages/core/src/db/connection.ts` — Remove `foreign_keys = ON` pragma
- `packages/core/src/documents/service.ts` — File-first rewrite
- `packages/core/src/annotations/service.ts` — File-first rewrite, add rootPath param
- `packages/core/src/notes/service.ts` — Frontmatter-based rewrite, user-chosen filenames
- `packages/core/src/mindmaps/service.ts` — File-first rewrite with embedded nodes/edges, add rootPath param
- `packages/core/src/tags/service.ts` — tags.json for definitions, embedded tag assignment
- `packages/core/src/library.ts` — New directory structure, new services, IndexService/FileWatcher
- `packages/core/src/index.ts` — Export new modules
- `packages/core/test/helpers.ts` — Add `createTestFile` helper
- `packages/core/test/documents.test.ts` — Rewrite for file-first behavior
- `packages/core/test/annotations.test.ts` — Rewrite for file-first behavior
- `packages/core/test/notes.test.ts` — Rewrite for frontmatter-based behavior
- `packages/core/test/mindmaps.test.ts` — Rewrite for file-first behavior
- `packages/core/test/tags.test.ts` — Rewrite for tags.json + embedded assignment
- `packages/core/test/library.test.ts` — Update for new directory structure

---

### Task 1: Storage Utilities and Dependencies

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/storage/json-store.ts`
- Create: `packages/core/src/storage/frontmatter.ts`
- Create: `packages/core/src/storage/index.ts`
- Create: `packages/core/test/storage.test.ts`
- Modify: `packages/core/test/helpers.ts`

- [ ] **Step 1: Add yaml dependency**

```bash
cd /Users/chixiao/Documents/work/research/newproject
pnpm add yaml --filter @banjuan/core
```

- [ ] **Step 2: Add file data interfaces to types.ts**

Add these interfaces at the end of `packages/core/src/types.ts`, before the `BanjuanEventMap` type:

```typescript
// --- File data interfaces (source-of-truth file formats) ---

export interface DocumentFileData {
  id: string
  title: string
  authors: string[]
  path: string
  type: DocumentType
  hash: string
  tags: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AnnotationFileData {
  id: string
  docId: string
  type: AnnotationType
  page: number | null
  position: AnnotationPosition
  content: string | null
  selectedText: string | null
  color: string
  createdAt: string
  updatedAt: string
}

export interface NoteFileData {
  id: string
  title: string
  docId: string | null
  annotationIds: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MindmapFileData {
  id: string
  title: string
  docId: string | null
  layout: MindmapLayout
  tags: string[]
  nodes: Array<{
    id: string
    parentId: string | null
    annotationId: string | null
    title: string
    content: string | null
    color: string | null
    positionX: number | null
    positionY: number | null
    sortOrder: number
    collapsed: boolean
  }>
  edges: Array<{
    id: string
    sourceId: string
    targetId: string
    label: string | null
    style: string | null
  }>
  createdAt: string
  updatedAt: string
}
```

Also update `TagTarget`:

```typescript
export type TagTarget = 'document' | 'note' | 'mindmap'
```

- [ ] **Step 3: Write failing tests for JsonStore**

Create `packages/core/test/storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { JsonStore } from '../src/storage/json-store.js'
import { parseFrontmatter, serializeFrontmatter } from '../src/storage/frontmatter.js'

interface TestEntity {
  id: string
  name: string
}

describe('JsonStore', () => {
  let tempDir: string
  let store: JsonStore<TestEntity>

  beforeEach(() => {
    tempDir = createTempDir()
    store = new JsonStore<TestEntity>(join(tempDir, 'data'))
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  it('writes and reads a JSON file with prefix subdirectory', () => {
    const entity = { id: '9d087c54-3519-4175-950e-aa68410e05c5', name: 'test' }
    store.write(entity)

    const filePath = join(tempDir, 'data', '9d', '9d087c54-3519-4175-950e-aa68410e05c5.json')
    expect(existsSync(filePath)).toBe(true)

    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(raw.id).toBe(entity.id)
    expect(raw.name).toBe('test')

    const read = store.read('9d087c54-3519-4175-950e-aa68410e05c5')
    expect(read).toEqual(entity)
  })

  it('returns null for non-existent entity', () => {
    expect(store.read('nonexistent-id')).toBeNull()
  })

  it('deletes a JSON file', () => {
    const entity = { id: 'a4fbbc5e-1234-5678-9012-abcdef123456', name: 'deleteme' }
    store.write(entity)
    expect(store.read(entity.id)).not.toBeNull()

    const deleted = store.delete(entity.id)
    expect(deleted).toBe(true)
    expect(store.read(entity.id)).toBeNull()
  })

  it('returns false when deleting non-existent entity', () => {
    expect(store.delete('nonexistent')).toBe(false)
  })

  it('lists all entities across prefix subdirectories', () => {
    store.write({ id: '9d087c54-aaaa', name: 'first' })
    store.write({ id: 'a4fbbc5e-bbbb', name: 'second' })
    store.write({ id: '9d123456-cccc', name: 'third' })

    const all = store.listAll()
    expect(all).toHaveLength(3)
    const names = all.map(e => e.name).sort()
    expect(names).toEqual(['first', 'second', 'third'])
  })

  it('returns empty array when base directory does not exist', () => {
    const emptyStore = new JsonStore<TestEntity>(join(tempDir, 'nonexistent'))
    expect(emptyStore.listAll()).toEqual([])
  })

  it('overwrites existing entity on write', () => {
    const entity = { id: 'ab000000-1111', name: 'original' }
    store.write(entity)
    store.write({ ...entity, name: 'updated' })

    const read = store.read(entity.id)
    expect(read?.name).toBe('updated')
  })
})

describe('parseFrontmatter', () => {
  it('parses YAML frontmatter and markdown content', () => {
    const raw = `---
id: abc123
title: My Note
tags:
  - ml
  - attention
---

# Hello

This is content.`

    const result = parseFrontmatter(raw)
    expect(result.data.id).toBe('abc123')
    expect(result.data.title).toBe('My Note')
    expect(result.data.tags).toEqual(['ml', 'attention'])
    expect(result.content).toBe('# Hello\n\nThis is content.')
  })

  it('returns empty data for content without frontmatter', () => {
    const raw = '# Just markdown\n\nNo frontmatter here.'
    const result = parseFrontmatter(raw)
    expect(result.data).toEqual({})
    expect(result.content).toBe(raw)
  })

  it('handles empty content after frontmatter', () => {
    const raw = `---
id: test
---
`
    const result = parseFrontmatter(raw)
    expect(result.data.id).toBe('test')
    expect(result.content).toBe('')
  })
})

describe('serializeFrontmatter', () => {
  it('combines YAML data and markdown content', () => {
    const data = { id: 'abc', title: 'Test', tags: ['a', 'b'] }
    const content = '# Hello\n\nWorld'
    const result = serializeFrontmatter(data, content)

    expect(result).toContain('---\n')
    expect(result).toContain('id: abc')
    expect(result).toContain('title: Test')
    expect(result).toContain('# Hello\n\nWorld')

    // Round-trip
    const parsed = parseFrontmatter(result)
    expect(parsed.data.id).toBe('abc')
    expect(parsed.data.title).toBe('Test')
    expect(parsed.content).toBe('# Hello\n\nWorld')
  })

  it('handles empty content', () => {
    const result = serializeFrontmatter({ id: 'x' }, '')
    const parsed = parseFrontmatter(result)
    expect(parsed.data.id).toBe('x')
    expect(parsed.content).toBe('')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd /Users/chixiao/Documents/work/research/newproject
pnpm --filter @banjuan/core test -- storage
```

Expected: FAIL — modules not found.

- [ ] **Step 5: Implement JsonStore**

Create `packages/core/src/storage/json-store.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export class JsonStore<T extends { id: string }> {
  constructor(private baseDir: string) {}

  private dirFor(id: string): string {
    return join(this.baseDir, id.slice(0, 2))
  }

  private pathFor(id: string): string {
    return join(this.dirFor(id), `${id}.json`)
  }

  read(id: string): T | null {
    const p = this.pathFor(id)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8'))
  }

  write(data: T): void {
    const dir = this.dirFor(data.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.pathFor(data.id), JSON.stringify(data, null, 2))
  }

  delete(id: string): boolean {
    const p = this.pathFor(id)
    if (!existsSync(p)) return false
    unlinkSync(p)
    return true
  }

  listAll(): T[] {
    if (!existsSync(this.baseDir)) return []
    const results: T[] = []
    const prefixes = readdirSync(this.baseDir, { withFileTypes: true })
    for (const prefix of prefixes) {
      if (!prefix.isDirectory()) continue
      const files = readdirSync(join(this.baseDir, prefix.name), { withFileTypes: true })
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue
        const content = readFileSync(join(this.baseDir, prefix.name, file.name), 'utf-8')
        results.push(JSON.parse(content))
      }
    }
    return results
  }
}
```

- [ ] **Step 6: Implement frontmatter utilities**

Create `packages/core/src/storage/frontmatter.ts`:

```typescript
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T
  content: string
}

export function parseFrontmatter<T = Record<string, unknown>>(raw: string): FrontmatterResult<T> {
  if (!raw.startsWith('---')) {
    return { data: {} as T, content: raw }
  }
  const lines = raw.split('\n')
  let endLine = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endLine = i
      break
    }
  }
  if (endLine === -1) return { data: {} as T, content: raw }

  const yamlStr = lines.slice(1, endLine).join('\n')
  const data = parseYaml(yamlStr) ?? {}
  const content = lines.slice(endLine + 1).join('\n').replace(/^\n+/, '')
  return { data: data as T, content }
}

export function serializeFrontmatter(data: Record<string, unknown>, content: string): string {
  const yaml = stringifyYaml(data).trim()
  if (content) {
    return `---\n${yaml}\n---\n\n${content}`
  }
  return `---\n${yaml}\n---\n`
}
```

- [ ] **Step 7: Create barrel export**

Create `packages/core/src/storage/index.ts`:

```typescript
export { JsonStore } from './json-store.js'
export { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
export type { FrontmatterResult } from './frontmatter.js'
```

- [ ] **Step 8: Add createTestFile helper**

Add to `packages/core/test/helpers.ts`:

```typescript
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'banjuan-test-'))
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

export function createTestFile(libPath: string, relativePath: string, content?: string | Buffer): string {
  const fullPath = join(libPath, relativePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content ?? 'test content')
  return fullPath
}
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
cd /Users/chixiao/Documents/work/research/newproject
pnpm --filter @banjuan/core test -- storage
```

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/storage/ packages/core/test/storage.test.ts packages/core/test/helpers.ts packages/core/src/types.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): add JsonStore, frontmatter utilities, and file data types"
```

---

### Task 2: Update DB Schema

**Files:**
- Modify: `packages/core/src/db/schema.ts`
- Modify: `packages/core/src/db/connection.ts`
- Modify: `packages/core/test/db.test.ts`

- [ ] **Step 1: Update connection.ts — remove FK pragma**

Replace `packages/core/src/db/connection.ts`:

```typescript
import Database from 'better-sqlite3'

export function createConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  return db
}
```

Remove the `foreign_keys = ON` line. SQLite is now a cache — data integrity is guaranteed by the file layer.

- [ ] **Step 2: Update schema.ts — remove FK constraints, add mindmap_tags**

Replace the `SCHEMA_SQL` in `packages/core/src/db/schema.ts`:

```typescript
import type Database from 'better-sqlite3'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    authors TEXT DEFAULT '[]',
    path TEXT NOT NULL,
    type TEXT NOT NULL,
    hash TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    type TEXT NOT NULL,
    page INTEGER,
    position TEXT NOT NULL,
    content TEXT,
    selected_text TEXT,
    color TEXT DEFAULT 'yellow',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    doc_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_annotations (
    note_id TEXT NOT NULL,
    annotation_id TEXT NOT NULL,
    PRIMARY KEY (note_id, annotation_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

CREATE TABLE IF NOT EXISTS doc_tags (
    doc_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (doc_id, tag_id)
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS mindmap_tags (
    mindmap_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (mindmap_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    title, content, type,
    tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    doc_id TEXT,
    layout TEXT DEFAULT 'tree',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    parent_id TEXT,
    annotation_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT,
    position_x REAL,
    position_y REAL,
    sort_order INTEGER DEFAULT 0,
    collapsed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mindmap_edges (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT,
    style TEXT
);
`

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL)
}
```

- [ ] **Step 3: Update db.test.ts for new schema**

The existing db.test.ts should still pass since we're only removing constraints, not changing table structure. Run to verify:

```bash
cd /Users/chixiao/Documents/work/research/newproject
pnpm --filter @banjuan/core test -- db.test
```

If the test checks for FK behavior, update it to not rely on CASCADE deletes.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/db/
git commit -m "feat(core): remove FK constraints from schema, add mindmap_tags table

SQLite is now a local index cache. Data integrity is guaranteed by the file layer."
```

---

### Task 3: Library Restructure

**Files:**
- Modify: `packages/core/src/library.ts`
- Modify: `packages/core/test/library.test.ts`

- [ ] **Step 1: Write failing tests for new directory structure**

Update `packages/core/test/library.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir } from './helpers.js'

describe('Library', () => {
  let tempDir: string
  let lib: Library | null = null

  afterEach(async () => {
    if (lib) await lib.close()
    lib = null
    if (tempDir) cleanupTempDir(tempDir)
  })

  describe('init', () => {
    it('creates .banjuan directory structure', () => {
      tempDir = createTempDir()
      const rootPath = join(tempDir, 'mylib')
      lib = Library.init(rootPath)

      expect(existsSync(join(rootPath, '.banjuan'))).toBe(true)
      expect(existsSync(join(rootPath, '.banjuan', 'config.json'))).toBe(true)
      expect(existsSync(join(rootPath, '.banjuan', 'tags.json'))).toBe(true)
      expect(existsSync(join(rootPath, '.banjuan', 'data', 'documents'))).toBe(true)
      expect(existsSync(join(rootPath, '.banjuan', 'data', 'annotations'))).toBe(true)
      expect(existsSync(join(rootPath, '.banjuan', 'data', 'mindmaps'))).toBe(true)
      expect(existsSync(join(rootPath, '.banjuan', 'stubs'))).toBe(true)
      expect(existsSync(join(rootPath, 'notes'))).toBe(true)
      expect(existsSync(join(rootPath, '.banjuan', 'db.sqlite'))).toBe(true)
    })

    it('creates empty tags.json', () => {
      tempDir = createTempDir()
      const rootPath = join(tempDir, 'mylib')
      lib = Library.init(rootPath)

      const tags = JSON.parse(readFileSync(join(rootPath, '.banjuan', 'tags.json'), 'utf-8'))
      expect(tags).toEqual([])
    })

    it('throws if library already exists', () => {
      tempDir = createTempDir()
      const rootPath = join(tempDir, 'mylib')
      lib = Library.init(rootPath)
      expect(() => Library.init(rootPath)).toThrow('already exists')
    })
  })

  describe('open', () => {
    it('opens an existing library', () => {
      tempDir = createTempDir()
      const rootPath = join(tempDir, 'mylib')
      lib = Library.init(rootPath)
      lib.close()

      lib = Library.open(rootPath)
      expect(lib.rootPath).toBe(rootPath)
    })

    it('throws if .banjuan directory does not exist', () => {
      tempDir = createTempDir()
      expect(() => Library.open(join(tempDir, 'nonexistent'))).toThrow('.banjuan directory not found')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- library.test
```

Expected: FAIL — new directories and tags.json not created.

- [ ] **Step 3: Update Library.init and Library.open**

Replace `packages/core/src/library.ts`:

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
import type { LibraryConfig } from './types.js'

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

  async close(): Promise<void> {
    await this.plugins.unloadAll()
    this.events.emit('library:closed', { path: this.rootPath })
    this.events.removeAllListeners()
    this.db.close()
  }
}
```

Key changes:
- Creates `.banjuan/data/{documents,annotations,mindmaps}`, `.banjuan/stubs/`, `notes/`
- No longer creates `documents/` directory at root level
- Creates `.banjuan/tags.json` with empty array
- Passes `rootPath` to AnnotationService, MindmapService, TagService (new constructor param)

**Note:** Services will temporarily break compilation until Tasks 4-8 update their constructors. The subagent implementing this task should add a temporary `rootPath` parameter to each service constructor that accepts but ignores it, to keep tests passing:

For AnnotationService, temporarily change constructor to:
```typescript
constructor(private db: Database.Database, _rootPath: string, private events: EventBus) {}
```

Same pattern for MindmapService and TagService. These will be properly implemented in Tasks 5, 7, 8.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- library.test
```

Expected: PASS.

- [ ] **Step 5: Run all existing tests to check for regressions**

```bash
pnpm --filter @banjuan/core test
```

Some tests may fail due to the constructor signature changes and missing `documents/` directory. Fix any test that relied on:
- `documents/` directory existing at root
- FK CASCADE behavior
- Old constructor signatures

For tests that create files in `documents/`, update them to create files directly in the library root. This is a temporary fix — each service's tests will be fully rewritten in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/library.ts packages/core/test/library.test.ts packages/core/src/annotations/service.ts packages/core/src/mindmaps/service.ts packages/core/src/tags/service.ts
git commit -m "feat(core): restructure Library for file-first storage

New directory layout: .banjuan/data/{documents,annotations,mindmaps},
.banjuan/stubs/, .banjuan/tags.json, notes/. Pass rootPath to all services."
```

---

### Task 4: DocumentService Refactor

**Files:**
- Modify: `packages/core/src/documents/service.ts`
- Modify: `packages/core/test/documents.test.ts`

- [ ] **Step 1: Write failing tests for file-first DocumentService**

Replace `packages/core/test/documents.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'

describe('DocumentService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('import', () => {
    it('creates metadata JSON file without copying original', async () => {
      createTestFile(libPath, 'papers/test.pdf', Buffer.from('fake pdf'))
      const doc = await lib.documents.import(join(libPath, 'papers/test.pdf'))

      expect(doc.path).toBe('papers/test.pdf')
      expect(doc.title).toBe('test')
      expect(doc.type).toBe('pdf')

      // Metadata JSON exists
      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.id).toBe(doc.id)
      expect(fileData.path).toBe('papers/test.pdf')
      expect(fileData.tags).toEqual([])

      // Original file untouched
      expect(existsSync(join(libPath, 'papers/test.pdf'))).toBe(true)
    })

    it('accepts relative path to library root', async () => {
      createTestFile(libPath, 'books/intro.epub', Buffer.from('fake epub'))
      const doc = await lib.documents.import('books/intro.epub')
      expect(doc.path).toBe('books/intro.epub')
    })

    it('rejects file outside library root', async () => {
      createTestFile(tempDir, 'outside.pdf', Buffer.from('outside'))
      await expect(lib.documents.import(join(tempDir, 'outside.pdf'))).rejects.toThrow('must be inside')
    })

    it('deduplicates by hash', async () => {
      createTestFile(libPath, 'a.txt', 'same content')
      createTestFile(libPath, 'b.txt', 'same content')
      await lib.documents.import('a.txt')
      await expect(lib.documents.import('b.txt')).rejects.toThrow('already imported')
    })

    it('stores tags in JSON file', async () => {
      createTestFile(libPath, 'tagged.txt', 'content')
      const doc = await lib.documents.import('tagged.txt', { tags: ['research', 'ai'] })

      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).toEqual(['research', 'ai'])
    })

    it('emits document:imported event', async () => {
      createTestFile(libPath, 'event.txt', 'content')
      let emitted: any = null
      lib.events.on('document:imported', (data) => { emitted = data })
      await lib.documents.import('event.txt')
      expect(emitted).not.toBeNull()
      expect(emitted.document.path).toBe('event.txt')
    })
  })

  describe('list', () => {
    it('returns all documents sorted by created_at desc', async () => {
      createTestFile(libPath, 'first.txt', 'a')
      createTestFile(libPath, 'second.txt', 'b')
      await lib.documents.import('first.txt')
      await lib.documents.import('second.txt')

      const docs = await lib.documents.list()
      expect(docs).toHaveLength(2)
    })

    it('filters by type', async () => {
      createTestFile(libPath, 'doc.pdf', Buffer.from('pdf'))
      createTestFile(libPath, 'note.txt', 'text')
      await lib.documents.import('doc.pdf')
      await lib.documents.import('note.txt')

      const pdfs = await lib.documents.list({ type: 'pdf' })
      expect(pdfs).toHaveLength(1)
      expect(pdfs[0].type).toBe('pdf')
    })
  })

  describe('get', () => {
    it('returns document by id', async () => {
      createTestFile(libPath, 'get-test.txt', 'content')
      const doc = await lib.documents.import('get-test.txt')
      const found = await lib.documents.get(doc.id)
      expect(found?.id).toBe(doc.id)
    })

    it('returns null for non-existent id', async () => {
      const found = await lib.documents.get('nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('delete', () => {
    it('deletes metadata JSON but not the original file', async () => {
      createTestFile(libPath, 'deleteme.txt', 'content')
      const doc = await lib.documents.import('deleteme.txt')

      await lib.documents.delete(doc.id)

      // Original file still exists
      expect(existsSync(join(libPath, 'deleteme.txt'))).toBe(true)

      // Metadata JSON deleted
      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      expect(existsSync(jsonPath)).toBe(false)

      // SQLite record gone
      expect(await lib.documents.get(doc.id)).toBeNull()
    })

    it('emits document:deleted event', async () => {
      createTestFile(libPath, 'del-event.txt', 'x')
      const doc = await lib.documents.import('del-event.txt')
      let emitted: any = null
      lib.events.on('document:deleted', (data) => { emitted = data })
      await lib.documents.delete(doc.id)
      expect(emitted).toEqual({ id: doc.id })
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- documents.test
```

Expected: FAIL.

- [ ] **Step 3: Implement file-first DocumentService**

Replace `packages/core/src/documents/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { v4 as uuid } from 'uuid'
import type { Document, DocumentListOptions, DocumentFileData } from '../types.js'
import { detectDocumentType, extractTitle } from './metadata.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'

export class DocumentService {
  private store: JsonStore<DocumentFileData>

  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
  ) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'))
  }

  async import(
    filePath: string,
    options?: { title?: string; tags?: string[] },
  ): Promise<Document> {
    const absPath = isAbsolute(filePath) ? filePath : join(this.rootPath, filePath)
    if (!existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`)
    }

    const relPath = relative(this.rootPath, absPath)
    if (relPath.startsWith('..')) {
      throw new Error('File must be inside the library directory')
    }

    const content = readFileSync(absPath)
    const hash = createHash('sha256').update(content).digest('hex')

    const existing = this.db
      .prepare('SELECT id FROM documents WHERE hash = ?')
      .get(hash) as { id: string } | undefined
    if (existing) {
      throw new Error(`File already imported (id: ${existing.id})`)
    }

    const type = detectDocumentType(absPath)
    const title = options?.title ?? extractTitle(absPath)
    const id = uuid()
    const now = new Date().toISOString()
    const tags = options?.tags ?? []

    const fileData: DocumentFileData = {
      id, title, authors: [], path: relPath, type, hash,
      tags, metadata: {}, createdAt: now, updatedAt: now,
    }
    this.store.write(fileData)

    this.db
      .prepare(
        `INSERT INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, '[]', ?, ?, ?, '{}', ?, ?)`,
      )
      .run(id, title, relPath, type, hash, now, now)

    this.search.index({ id, title, content: title, type: 'document' })

    const doc: Document = {
      id, title, authors: [], path: relPath, type, hash,
      metadata: {}, createdAt: now, updatedAt: now,
    }
    this.events.emit('document:imported', { document: doc })
    return doc
  }

  async list(options?: DocumentListOptions): Promise<Document[]> {
    let sql = 'SELECT * FROM documents'
    const params: unknown[] = []

    if (options?.tag) {
      sql += ' WHERE id IN (SELECT doc_id FROM doc_tags JOIN tags ON tags.id = doc_tags.tag_id WHERE tags.name = ?)'
      params.push(options.tag)
    }

    if (options?.type) {
      sql += params.length ? ' AND' : ' WHERE'
      sql += ' type = ?'
      params.push(options.type)
    }

    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map(rowToDocument)
  }

  async get(id: string): Promise<Document | null> {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? rowToDocument(row) : null
  }

  async delete(id: string): Promise<void> {
    const doc = await this.get(id)
    if (!doc) return

    this.store.delete(id)
    this.search.removeById(id)
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
    this.events.emit('document:deleted', { id })
  }
}

function rowToDocument(row: Record<string, unknown>): Document {
  return {
    id: row.id as string,
    title: row.title as string,
    authors: JSON.parse((row.authors as string) || '[]'),
    path: row.path as string,
    type: row.type as Document['type'],
    hash: row.hash as string,
    metadata: JSON.parse((row.metadata as string) || '{}'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- documents.test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/documents/service.ts packages/core/test/documents.test.ts
git commit -m "feat(core): refactor DocumentService to file-first storage

Import creates metadata JSON in .banjuan/data/documents/ without copying
the original file. Delete removes metadata JSON, leaves original untouched.
Path is now relative to library root."
```

---

### Task 5: AnnotationService Refactor

**Files:**
- Modify: `packages/core/src/annotations/service.ts`
- Modify: `packages/core/test/annotations.test.ts`

- [ ] **Step 1: Write failing tests for file-first AnnotationService**

Replace `packages/core/test/annotations.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'

describe('AnnotationService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string
  let docId: string

  beforeEach(async () => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
    createTestFile(libPath, 'test.pdf', Buffer.from('fake pdf'))
    const doc = await lib.documents.import('test.pdf')
    docId = doc.id
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('writes annotation JSON file and indexes in SQLite', async () => {
      const ann = await lib.annotations.create({
        docId,
        type: 'highlight',
        page: 3,
        position: { type: 'pdf', page: 3, rects: [{ x: 0, y: 0, w: 100, h: 20 }], text: 'hello' },
        content: 'important',
        selectedText: 'hello world',
        color: '#fde68a',
      })

      expect(ann.id).toBeDefined()
      expect(ann.docId).toBe(docId)
      expect(ann.type).toBe('highlight')

      // JSON file created
      const jsonPath = join(libPath, '.banjuan', 'data', 'annotations', ann.id.slice(0, 2), `${ann.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.docId).toBe(docId)
      expect(fileData.selectedText).toBe('hello world')
      expect(fileData.color).toBe('#fde68a')

      // SQLite indexed
      const found = await lib.annotations.get(ann.id)
      expect(found?.id).toBe(ann.id)
    })

    it('emits annotation:created event', async () => {
      let emitted: any = null
      lib.events.on('annotation:created', (data) => { emitted = data })

      await lib.annotations.create({
        docId,
        type: 'highlight',
        position: { type: 'pdf', page: 1, rects: [], text: '' },
      })

      expect(emitted?.annotation.docId).toBe(docId)
    })
  })

  describe('list', () => {
    it('filters by docId and page', async () => {
      await lib.annotations.create({
        docId, type: 'highlight', page: 1,
        position: { type: 'pdf', page: 1, rects: [], text: '' },
      })
      await lib.annotations.create({
        docId, type: 'highlight', page: 2,
        position: { type: 'pdf', page: 2, rects: [], text: '' },
      })

      const page1 = await lib.annotations.list({ docId, page: 1 })
      expect(page1).toHaveLength(1)

      const all = await lib.annotations.list({ docId })
      expect(all).toHaveLength(2)
    })
  })

  describe('update', () => {
    it('updates JSON file and SQLite index', async () => {
      const ann = await lib.annotations.create({
        docId, type: 'highlight',
        position: { type: 'pdf', page: 1, rects: [], text: '' },
        content: 'old',
      })

      const updated = await lib.annotations.update(ann.id, { content: 'new', color: 'blue' })
      expect(updated.content).toBe('new')
      expect(updated.color).toBe('blue')

      // JSON file updated
      const jsonPath = join(libPath, '.banjuan', 'data', 'annotations', ann.id.slice(0, 2), `${ann.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.content).toBe('new')
      expect(fileData.color).toBe('blue')
    })
  })

  describe('delete', () => {
    it('deletes JSON file and SQLite row', async () => {
      const ann = await lib.annotations.create({
        docId, type: 'highlight',
        position: { type: 'pdf', page: 1, rects: [], text: '' },
      })

      const jsonPath = join(libPath, '.banjuan', 'data', 'annotations', ann.id.slice(0, 2), `${ann.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      await lib.annotations.delete(ann.id)
      expect(existsSync(jsonPath)).toBe(false)
      expect(await lib.annotations.get(ann.id)).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- annotations.test
```

- [ ] **Step 3: Implement file-first AnnotationService**

Replace `packages/core/src/annotations/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Annotation, AnnotationCreateInput, AnnotationListOptions, AnnotationFileData } from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'

export class AnnotationService {
  private store: JsonStore<AnnotationFileData>

  constructor(private db: Database.Database, rootPath: string, private events: EventBus) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'annotations'))
  }

  async create(input: AnnotationCreateInput): Promise<Annotation> {
    const id = uuid()
    const now = new Date().toISOString()
    const color = input.color ?? 'yellow'

    const fileData: AnnotationFileData = {
      id, docId: input.docId, type: input.type, page: input.page ?? null,
      position: input.position, content: input.content ?? null,
      selectedText: input.selectedText ?? null, color, createdAt: now, updatedAt: now,
    }
    this.store.write(fileData)

    this.db
      .prepare(
        `INSERT INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.docId, input.type, input.page ?? null,
        JSON.stringify(input.position), input.content ?? null,
        input.selectedText ?? null, color, now, now)

    const annotation: Annotation = {
      id, docId: input.docId, type: input.type, page: input.page ?? null,
      position: input.position, content: input.content ?? null,
      selectedText: input.selectedText ?? null, color, createdAt: now, updatedAt: now,
    }
    this.events.emit('annotation:created', { annotation })
    return annotation
  }

  async list(options: AnnotationListOptions): Promise<Annotation[]> {
    let sql = 'SELECT * FROM annotations WHERE doc_id = ?'
    const params: unknown[] = [options.docId]

    if (options.page !== undefined) { sql += ' AND page = ?'; params.push(options.page) }
    if (options.type) { sql += ' AND type = ?'; params.push(options.type) }
    if (options.color) { sql += ' AND color = ?'; params.push(options.color) }

    sql += ' ORDER BY created_at ASC'
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map(rowToAnnotation)
  }

  async get(id: string): Promise<Annotation | null> {
    const row = this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as
      | Record<string, unknown> | undefined
    return row ? rowToAnnotation(row) : null
  }

  async update(id: string, updates: { content?: string; color?: string }): Promise<Annotation> {
    const now = new Date().toISOString()

    // Update JSON file
    const fileData = this.store.read(id)
    if (fileData) {
      if (updates.content !== undefined) fileData.content = updates.content
      if (updates.color !== undefined) fileData.color = updates.color
      fileData.updatedAt = now
      this.store.write(fileData)
    }

    // Update SQLite index
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
    if (updates.color !== undefined) { sets.push('color = ?'); params.push(updates.color) }
    params.push(id)
    this.db.prepare(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    const annotation = (await this.get(id))!
    this.events.emit('annotation:updated', { annotation })
    return annotation
  }

  async delete(id: string): Promise<void> {
    const ann = this.db.prepare('SELECT doc_id FROM annotations WHERE id = ?').get(id) as { doc_id: string } | undefined
    this.store.delete(id)
    this.db.prepare('DELETE FROM annotations WHERE id = ?').run(id)
    if (ann) this.events.emit('annotation:deleted', { id, docId: ann.doc_id })
  }
}

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: row.id as string, docId: row.doc_id as string,
    type: row.type as Annotation['type'], page: row.page as number | null,
    position: JSON.parse(row.position as string),
    content: row.content as string | null, selectedText: row.selected_text as string | null,
    color: row.color as string, createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- annotations.test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/annotations/service.ts packages/core/test/annotations.test.ts
git commit -m "feat(core): refactor AnnotationService to file-first storage

Annotations stored as JSON files in .banjuan/data/annotations/{prefix}/
with SQLite as query cache."
```

---

### Task 6: NoteService Refactor

**Files:**
- Modify: `packages/core/src/notes/service.ts`
- Modify: `packages/core/test/notes.test.ts`

- [ ] **Step 1: Write failing tests for frontmatter-based NoteService**

Replace `packages/core/test/notes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { parseFrontmatter } from '../src/storage/frontmatter.js'

describe('NoteService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('creates .md file with frontmatter in notes/', async () => {
      const note = await lib.notes.create({
        title: 'Attention 论文笔记',
        content: '# Hello\n\nSome notes here.',
      })

      expect(note.id).toBeDefined()
      expect(note.title).toBe('Attention 论文笔记')
      expect(note.content).toBe('# Hello\n\nSome notes here.')

      // File created in notes/ with user-friendly name
      const notePath = join(libPath, 'notes', note.path)
      expect(existsSync(notePath)).toBe(true)
      expect(note.path).toContain('Attention 论文笔记')
      expect(note.path).toEndWith('.md')

      // Frontmatter contains metadata
      const raw = readFileSync(notePath, 'utf-8')
      const { data, content } = parseFrontmatter(raw)
      expect(data.id).toBe(note.id)
      expect(data.title).toBe('Attention 论文笔记')
      expect(content).toBe('# Hello\n\nSome notes here.')
    })

    it('links to document and annotations via frontmatter', async () => {
      createTestFile(libPath, 'test.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('test.pdf')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'pdf', page: 1, rects: [], text: '' },
      })

      const note = await lib.notes.create({
        title: 'My Note',
        docId: doc.id,
        annotationIds: [ann.id],
        content: 'notes about the paper',
      })

      const notePath = join(libPath, 'notes', note.path)
      const raw = readFileSync(notePath, 'utf-8')
      const { data } = parseFrontmatter(raw)
      expect(data.docId).toBe(doc.id)
      expect(data.annotationIds).toEqual([ann.id])
    })

    it('handles filename conflicts', async () => {
      const note1 = await lib.notes.create({ title: 'Same Title', content: 'first' })
      const note2 = await lib.notes.create({ title: 'Same Title', content: 'second' })

      expect(note1.path).not.toBe(note2.path)
      expect(existsSync(join(libPath, 'notes', note1.path))).toBe(true)
      expect(existsSync(join(libPath, 'notes', note2.path))).toBe(true)
    })

    it('emits note:created event', async () => {
      let emitted: any = null
      lib.events.on('note:created', (data) => { emitted = data })
      await lib.notes.create({ title: 'Event Test' })
      expect(emitted?.note.title).toBe('Event Test')
    })
  })

  describe('get', () => {
    it('returns note with content loaded from .md file', async () => {
      const created = await lib.notes.create({ title: 'Read Test', content: '## Content\n\nBody text.' })
      const note = await lib.notes.get(created.id)

      expect(note).not.toBeNull()
      expect(note!.title).toBe('Read Test')
      expect(note!.content).toBe('## Content\n\nBody text.')
    })

    it('returns null for non-existent id', async () => {
      expect(await lib.notes.get('nonexistent')).toBeNull()
    })
  })

  describe('list', () => {
    it('lists all notes', async () => {
      await lib.notes.create({ title: 'Note A' })
      await lib.notes.create({ title: 'Note B' })

      const notes = await lib.notes.list()
      expect(notes).toHaveLength(2)
    })

    it('filters by docId', async () => {
      createTestFile(libPath, 'doc.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('doc.pdf')

      await lib.notes.create({ title: 'Linked', docId: doc.id })
      await lib.notes.create({ title: 'Unlinked' })

      const filtered = await lib.notes.list({ docId: doc.id })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].title).toBe('Linked')
    })
  })

  describe('update', () => {
    it('updates frontmatter and content in .md file', async () => {
      const note = await lib.notes.create({ title: 'Original', content: 'old content' })
      const updated = await lib.notes.update(note.id, { title: 'Updated Title', content: 'new content' })

      expect(updated.title).toBe('Updated Title')
      expect(updated.content).toBe('new content')

      // File reflects changes
      const raw = readFileSync(join(libPath, 'notes', note.path), 'utf-8')
      const { data, content } = parseFrontmatter(raw)
      expect(data.title).toBe('Updated Title')
      expect(content).toBe('new content')
    })
  })

  describe('delete', () => {
    it('deletes .md file and SQLite record', async () => {
      const note = await lib.notes.create({ title: 'Delete Me', content: 'bye' })
      const filePath = join(libPath, 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)

      await lib.notes.delete(note.id)
      expect(existsSync(filePath)).toBe(false)
      expect(await lib.notes.get(note.id)).toBeNull()
    })
  })

  describe('getAnnotations', () => {
    it('returns linked annotations', async () => {
      createTestFile(libPath, 'ann-doc.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('ann-doc.pdf')
      const ann1 = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'pdf', page: 1, rects: [], text: '' },
      })
      const ann2 = await lib.annotations.create({
        docId: doc.id, type: 'note',
        position: { type: 'pdf', page: 2, rects: [], text: '' },
      })

      const note = await lib.notes.create({
        title: 'Linked Note',
        docId: doc.id,
        annotationIds: [ann1.id, ann2.id],
      })

      const annotations = await lib.notes.getAnnotations(note.id)
      expect(annotations).toHaveLength(2)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- notes.test
```

- [ ] **Step 3: Implement frontmatter-based NoteService**

Replace `packages/core/src/notes/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Note, NoteCreateInput, NoteListOptions, Annotation, NoteFileData } from '../types.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import { parseFrontmatter, serializeFrontmatter } from '../storage/frontmatter.js'

function titleToFilename(title: string): string {
  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return `${safe || 'untitled'}.md`
}

function uniqueFilename(dir: string, filename: string): string {
  if (!existsSync(join(dir, filename))) return filename
  const ext = '.md'
  const base = filename.slice(0, -ext.length)
  let i = 2
  while (existsSync(join(dir, `${base} ${i}${ext}`))) i++
  return `${base} ${i}${ext}`
}

export class NoteService {
  private notesDir: string

  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
  ) {
    this.notesDir = join(rootPath, 'notes')
  }

  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    const filename = uniqueFilename(this.notesDir, titleToFilename(input.title))
    const fullPath = join(this.notesDir, filename)

    mkdirSync(this.notesDir, { recursive: true })

    const frontmatterData: NoteFileData = {
      id,
      title: input.title,
      docId: input.docId ?? null,
      annotationIds: input.annotationIds ?? [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }

    const mdContent = serializeFrontmatter(frontmatterData as unknown as Record<string, unknown>, input.content ?? '')
    writeFileSync(fullPath, mdContent)

    this.db
      .prepare(`INSERT INTO notes (id, title, path, doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, input.title, filename, input.docId ?? null, now, now)

    this.search.index({ id, title: input.title, content: input.content ?? '', type: 'note' })

    if (input.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of input.annotationIds) { insertLink.run(id, annId) }
    }

    const note: Note = { id, title: input.title, path: filename, docId: input.docId ?? null, content: input.content ?? '', createdAt: now, updatedAt: now }
    this.events.emit('note:created', { note })
    return note
  }

  async list(options?: NoteListOptions): Promise<Note[]> {
    let sql = 'SELECT * FROM notes'
    const params: unknown[] = []
    const conditions: string[] = []

    if (options?.docId) { conditions.push('doc_id = ?'); params.push(options.docId) }
    if (options?.tag) {
      conditions.push('id IN (SELECT note_id FROM note_tags JOIN tags ON tags.id = note_tags.tag_id WHERE tags.name = ?)')
      params.push(options.tag)
    }

    if (conditions.length) { sql += ` WHERE ${conditions.join(' AND ')}` }

    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map((row) => this.rowToNote(row))
  }

  async get(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const note = this.rowToNote(row)
    const filePath = join(this.notesDir, note.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      const { content } = parseFrontmatter(raw)
      note.content = content
    }
    return note
  }

  async update(id: string, updates: { title?: string; content?: string }): Promise<Note> {
    const now = new Date().toISOString()

    // Update SQLite
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    params.push(id)
    this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    // Update .md file
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as { path: string }
    const filePath = join(this.notesDir, row.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      const { data, content } = parseFrontmatter(raw)
      if (updates.title !== undefined) data.title = updates.title
      data.updatedAt = now
      const newContent = updates.content !== undefined ? updates.content : content
      writeFileSync(filePath, serializeFrontmatter(data, newContent))
    }

    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  async delete(id: string): Promise<void> {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as { path: string } | undefined
    if (!row) return
    const filePath = join(this.notesDir, row.path)
    if (existsSync(filePath)) { unlinkSync(filePath) }
    this.search.removeById(id)
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    this.events.emit('note:deleted', { id })
  }

  async getAnnotations(noteId: string): Promise<Annotation[]> {
    const rows = this.db
      .prepare(`SELECT a.* FROM annotations a JOIN note_annotations na ON a.id = na.annotation_id WHERE na.note_id = ?`)
      .all(noteId) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: row.id as string, docId: row.doc_id as string,
      type: row.type as Annotation['type'], page: row.page as number | null,
      position: JSON.parse(row.position as string),
      content: row.content as string | null, selectedText: row.selected_text as string | null,
      color: row.color as string, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }))
  }

  private rowToNote(row: Record<string, unknown>): Note {
    return {
      id: row.id as string, title: row.title as string, path: row.path as string,
      docId: row.doc_id as string | null, content: '',
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- notes.test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/notes/service.ts packages/core/test/notes.test.ts
git commit -m "feat(core): refactor NoteService to frontmatter-based storage

Notes stored as .md files with YAML frontmatter in notes/ directory.
User-friendly filenames derived from title. Frontmatter contains id,
docId, annotationIds, tags, timestamps."
```

---

### Task 7: MindmapService Refactor

**Files:**
- Modify: `packages/core/src/mindmaps/service.ts`
- Modify: `packages/core/test/mindmaps.test.ts`

- [ ] **Step 1: Write failing tests for file-first MindmapService**

Replace `packages/core/test/mindmaps.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir } from './helpers.js'

describe('MindmapService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('creates JSON file with empty nodes and edges', async () => {
      const mm = await lib.mindmaps.create({ title: 'Test Map' })

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.id).toBe(mm.id)
      expect(fileData.title).toBe('Test Map')
      expect(fileData.nodes).toEqual([])
      expect(fileData.edges).toEqual([])
      expect(fileData.tags).toEqual([])
      expect(fileData.layout).toBe('tree')
    })
  })

  describe('addNode', () => {
    it('adds node to JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Root Node' })

      expect(node.title).toBe('Root Node')
      expect(node.mindmapId).toBe(mm.id)

      // JSON file updated
      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.nodes).toHaveLength(1)
      expect(fileData.nodes[0].title).toBe('Root Node')
    })
  })

  describe('updateNode', () => {
    it('updates node in JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Old' })

      const updated = await lib.mindmaps.updateNode(node.id, { title: 'New' })
      expect(updated.title).toBe('New')

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.nodes[0].title).toBe('New')
    })
  })

  describe('removeNode', () => {
    it('removes node from JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const node = await lib.mindmaps.addNode(mm.id, { title: 'Remove Me' })

      await lib.mindmaps.removeNode(node.id)

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.nodes).toHaveLength(0)
    })
  })

  describe('addEdge', () => {
    it('adds edge to JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'B' })

      const edge = await lib.mindmaps.addEdge(mm.id, {
        sourceId: n1.id, targetId: n2.id, label: 'relates',
      })

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.edges).toHaveLength(1)
      expect(fileData.edges[0].label).toBe('relates')
    })
  })

  describe('removeEdge', () => {
    it('removes edge from JSON file and SQLite', async () => {
      const mm = await lib.mindmaps.create({ title: 'Map' })
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'B' })
      const edge = await lib.mindmaps.addEdge(mm.id, { sourceId: n1.id, targetId: n2.id })

      await lib.mindmaps.removeEdge(edge.id)

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.edges).toHaveLength(0)
    })
  })

  describe('delete', () => {
    it('deletes JSON file and SQLite records', async () => {
      const mm = await lib.mindmaps.create({ title: 'Delete Me' })
      await lib.mindmaps.addNode(mm.id, { title: 'Node' })

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      expect(existsSync(jsonPath)).toBe(true)

      await lib.mindmaps.delete(mm.id)
      expect(existsSync(jsonPath)).toBe(false)
      expect(await lib.mindmaps.get(mm.id)).toBeUndefined()
    })
  })

  describe('list and get', () => {
    it('lists mindmaps from SQLite', async () => {
      await lib.mindmaps.create({ title: 'Map A' })
      await lib.mindmaps.create({ title: 'Map B' })
      const all = await lib.mindmaps.list()
      expect(all).toHaveLength(2)
    })

    it('gets mindmap by id', async () => {
      const mm = await lib.mindmaps.create({ title: 'Find Me' })
      const found = await lib.mindmaps.get(mm.id)
      expect(found?.title).toBe('Find Me')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- mindmaps.test
```

- [ ] **Step 3: Implement file-first MindmapService**

Replace `packages/core/src/mindmaps/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type {
  Mindmap, MindmapCreateInput, MindmapNode, MindmapNodeCreateInput,
  MindmapEdge, MindmapEdgeCreateInput, MindmapLayout, MindmapFileData,
} from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'

interface MindmapRow {
  id: string; title: string; doc_id: string | null; layout: string
  created_at: string; updated_at: string
}

interface NodeRow {
  id: string; mindmap_id: string; parent_id: string | null; annotation_id: string | null
  title: string; content: string | null; color: string | null
  position_x: number | null; position_y: number | null
  sort_order: number; collapsed: number; created_at: string
}

interface EdgeRow {
  id: string; mindmap_id: string; source_id: string; target_id: string
  label: string | null; style: string | null
}

function rowToMindmap(row: MindmapRow): Mindmap {
  return { id: row.id, title: row.title, docId: row.doc_id, layout: row.layout as MindmapLayout, createdAt: row.created_at, updatedAt: row.updated_at }
}

function rowToNode(row: NodeRow): MindmapNode {
  return { id: row.id, mindmapId: row.mindmap_id, parentId: row.parent_id, annotationId: row.annotation_id, title: row.title, content: row.content, color: row.color, positionX: row.position_x, positionY: row.position_y, sortOrder: row.sort_order, collapsed: row.collapsed === 1, createdAt: row.created_at }
}

function rowToEdge(row: EdgeRow): MindmapEdge {
  return { id: row.id, mindmapId: row.mindmap_id, sourceId: row.source_id, targetId: row.target_id, label: row.label, style: row.style }
}

export class MindmapService {
  private store: JsonStore<MindmapFileData>

  constructor(private db: Database.Database, rootPath: string, private events: EventBus) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'mindmaps'))
  }

  private readFileData(id: string): MindmapFileData | null {
    return this.store.read(id)
  }

  private writeFileData(data: MindmapFileData): void {
    this.store.write(data)
  }

  async create(input: MindmapCreateInput): Promise<Mindmap> {
    const id = uuid()
    const now = new Date().toISOString()
    const layout = input.layout ?? 'tree'

    const fileData: MindmapFileData = {
      id, title: input.title, docId: input.docId ?? null, layout,
      tags: [], nodes: [], edges: [], createdAt: now, updatedAt: now,
    }
    this.writeFileData(fileData)

    this.db.prepare('INSERT INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, input.title, input.docId ?? null, layout, now, now)

    const mindmap = { id, title: input.title, docId: input.docId ?? null, layout, createdAt: now, updatedAt: now }
    this.events.emit('mindmap:created', { mindmap })
    return mindmap
  }

  async list(options?: { docId?: string }): Promise<Mindmap[]> {
    if (options?.docId) {
      return (this.db.prepare('SELECT * FROM mindmaps WHERE doc_id = ? ORDER BY created_at DESC').all(options.docId) as MindmapRow[]).map(rowToMindmap)
    }
    return (this.db.prepare('SELECT * FROM mindmaps ORDER BY created_at DESC').all() as MindmapRow[]).map(rowToMindmap)
  }

  async get(id: string): Promise<Mindmap | undefined> {
    const row = this.db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id) as MindmapRow | undefined
    return row ? rowToMindmap(row) : undefined
  }

  async update(id: string, updates: Partial<Pick<Mindmap, 'title' | 'layout' | 'docId'>>): Promise<Mindmap> {
    const now = new Date().toISOString()

    // Update JSON file
    const fileData = this.readFileData(id)
    if (fileData) {
      if (updates.title !== undefined) fileData.title = updates.title
      if (updates.layout !== undefined) fileData.layout = updates.layout
      if (updates.docId !== undefined) fileData.docId = updates.docId
      fileData.updatedAt = now
      this.writeFileData(fileData)
    }

    // Update SQLite
    const fields: string[] = ['updated_at = ?']
    const values: unknown[] = [now]
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.layout !== undefined) { fields.push('layout = ?'); values.push(updates.layout) }
    if (updates.docId !== undefined) { fields.push('doc_id = ?'); values.push(updates.docId) }
    values.push(id)
    this.db.prepare(`UPDATE mindmaps SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    const row = this.db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id) as MindmapRow
    const mindmap = rowToMindmap(row)
    this.events.emit('mindmap:updated', { mindmap })
    return mindmap
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id)
    this.db.prepare('DELETE FROM mindmap_nodes WHERE mindmap_id = ?').run(id)
    this.db.prepare('DELETE FROM mindmap_edges WHERE mindmap_id = ?').run(id)
    this.db.prepare('DELETE FROM mindmaps WHERE id = ?').run(id)
    this.events.emit('mindmap:deleted', { id })
  }

  // --- Nodes ---

  async addNode(mindmapId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
    const id = uuid()
    const now = new Date().toISOString()
    const parentId = input.parentId ?? null

    const maxRow = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?')
      .get(mindmapId, parentId) as { max_sort: number }
    const sortOrder = maxRow.max_sort + 1

    const nodeData = {
      id, parentId, annotationId: input.annotationId ?? null,
      title: input.title, content: input.content ?? null, color: input.color ?? null,
      positionX: input.positionX ?? null, positionY: input.positionY ?? null,
      sortOrder, collapsed: false,
    }

    // Update JSON file
    const fileData = this.readFileData(mindmapId)
    if (fileData) {
      fileData.nodes.push(nodeData)
      fileData.updatedAt = now
      this.writeFileData(fileData)
    }

    // Insert into SQLite
    this.db.prepare(
      `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, annotation_id, title, content, color, position_x, position_y, sort_order, collapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(id, mindmapId, parentId, input.annotationId ?? null, input.title, input.content ?? null, input.color ?? null, input.positionX ?? null, input.positionY ?? null, sortOrder, now)

    const node: MindmapNode = { ...nodeData, mindmapId, createdAt: now }
    this.events.emit('mindmap:node:added', { node })
    return node
  }

  async getNodes(mindmapId: string): Promise<MindmapNode[]> {
    return (this.db.prepare('SELECT * FROM mindmap_nodes WHERE mindmap_id = ? ORDER BY sort_order').all(mindmapId) as NodeRow[]).map(rowToNode)
  }

  async updateNode(id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>): Promise<MindmapNode> {
    // Find which mindmap this node belongs to
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined
    if (!nodeRow) throw new Error(`Node not found: ${id}`)

    // Update JSON file
    const fileData = this.readFileData(nodeRow.mindmap_id)
    if (fileData) {
      const nodeInFile = fileData.nodes.find(n => n.id === id)
      if (nodeInFile) {
        if (updates.title !== undefined) nodeInFile.title = updates.title
        if (updates.content !== undefined) nodeInFile.content = updates.content
        if (updates.color !== undefined) nodeInFile.color = updates.color
        if (updates.positionX !== undefined) nodeInFile.positionX = updates.positionX
        if (updates.positionY !== undefined) nodeInFile.positionY = updates.positionY
        if (updates.collapsed !== undefined) nodeInFile.collapsed = updates.collapsed
        if (updates.sortOrder !== undefined) nodeInFile.sortOrder = updates.sortOrder
      }
      fileData.updatedAt = new Date().toISOString()
      this.writeFileData(fileData)
    }

    // Update SQLite
    const fields: string[] = []
    const values: unknown[] = []
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color) }
    if (updates.positionX !== undefined) { fields.push('position_x = ?'); values.push(updates.positionX) }
    if (updates.positionY !== undefined) { fields.push('position_y = ?'); values.push(updates.positionY) }
    if (updates.collapsed !== undefined) { fields.push('collapsed = ?'); values.push(updates.collapsed ? 1 : 0) }
    if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder) }

    if (fields.length > 0) {
      values.push(id)
      this.db.prepare(`UPDATE mindmap_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = this.db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id) as NodeRow
    return rowToNode(row)
  }

  async removeNode(id: string): Promise<void> {
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined

    if (nodeRow) {
      // Update JSON file
      const fileData = this.readFileData(nodeRow.mindmap_id)
      if (fileData) {
        fileData.nodes = fileData.nodes.filter(n => n.id !== id)
        fileData.edges = fileData.edges.filter(e => e.sourceId !== id && e.targetId !== id)
        fileData.updatedAt = new Date().toISOString()
        this.writeFileData(fileData)
      }
    }

    this.db.prepare('DELETE FROM mindmap_nodes WHERE id = ?').run(id)
    if (nodeRow) this.events.emit('mindmap:node:removed', { id, mindmapId: nodeRow.mindmap_id })
  }

  // --- Edges ---

  async addEdge(mindmapId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge> {
    const id = uuid()

    const edgeData = {
      id, sourceId: input.sourceId, targetId: input.targetId,
      label: input.label ?? null, style: null,
    }

    // Update JSON file
    const fileData = this.readFileData(mindmapId)
    if (fileData) {
      fileData.edges.push(edgeData)
      fileData.updatedAt = new Date().toISOString()
      this.writeFileData(fileData)
    }

    // Insert into SQLite
    this.db.prepare('INSERT INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)').run(id, mindmapId, input.sourceId, input.targetId, input.label ?? null, null)

    const edge: MindmapEdge = { id, mindmapId, ...edgeData }
    this.events.emit('mindmap:edge:added', { edge })
    return edge
  }

  async getEdges(mindmapId: string): Promise<MindmapEdge[]> {
    return (this.db.prepare('SELECT * FROM mindmap_edges WHERE mindmap_id = ?').all(mindmapId) as EdgeRow[]).map(rowToEdge)
  }

  async removeEdge(id: string): Promise<void> {
    const edgeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_edges WHERE id = ?').get(id) as { mindmap_id: string } | undefined

    if (edgeRow) {
      const fileData = this.readFileData(edgeRow.mindmap_id)
      if (fileData) {
        fileData.edges = fileData.edges.filter(e => e.id !== id)
        fileData.updatedAt = new Date().toISOString()
        this.writeFileData(fileData)
      }
    }

    this.db.prepare('DELETE FROM mindmap_edges WHERE id = ?').run(id)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- mindmaps.test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/mindmaps/service.ts packages/core/test/mindmaps.test.ts
git commit -m "feat(core): refactor MindmapService to file-first storage

Mindmaps stored as JSON files with embedded nodes and edges in
.banjuan/data/mindmaps/{prefix}/. All node/edge mutations update
both the JSON file and SQLite index."
```

---

### Task 8: TagService Refactor

**Files:**
- Modify: `packages/core/src/tags/service.ts`
- Modify: `packages/core/test/tags.test.ts`

- [ ] **Step 1: Write failing tests for tags.json-based TagService**

Replace `packages/core/test/tags.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'

describe('TagService (file-first)', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('adds tag to tags.json and SQLite', async () => {
      const tag = await lib.tags.create({ name: 'Machine Learning', color: '#89b4fa' })

      expect(tag.name).toBe('Machine Learning')
      expect(tag.color).toBe('#89b4fa')

      // tags.json updated
      const tagsJson = JSON.parse(readFileSync(join(libPath, '.banjuan', 'tags.json'), 'utf-8'))
      expect(tagsJson).toHaveLength(1)
      expect(tagsJson[0].name).toBe('Machine Learning')
    })

    it('lists tags from SQLite', async () => {
      await lib.tags.create({ name: 'B Tag' })
      await lib.tags.create({ name: 'A Tag' })

      const tags = await lib.tags.list()
      expect(tags).toHaveLength(2)
      expect(tags[0].name).toBe('A Tag')
    })
  })

  describe('assign to document', () => {
    it('embeds tag names in document JSON file', async () => {
      await lib.tags.create({ name: 'AI' })
      createTestFile(libPath, 'test.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('test.pdf')

      await lib.tags.assign(doc.id, 'document', ['AI'])

      // Document JSON file has tags
      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).toContain('AI')

      // SQLite join table populated
      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('AI')
    })

    it('emits tag:assigned event', async () => {
      await lib.tags.create({ name: 'Test' })
      createTestFile(libPath, 'ev.txt', 'x')
      const doc = await lib.documents.import('ev.txt')

      let emitted: any = null
      lib.events.on('tag:assigned', (data) => { emitted = data })
      await lib.tags.assign(doc.id, 'document', ['Test'])
      expect(emitted?.tagName).toBe('Test')
    })
  })

  describe('assign to note', () => {
    it('embeds tag names in note frontmatter', async () => {
      await lib.tags.create({ name: 'Research' })
      const note = await lib.notes.create({ title: 'My Note', content: 'content' })

      await lib.tags.assign(note.id, 'note', ['Research'])

      // Note frontmatter has tags
      const raw = readFileSync(join(libPath, 'notes', note.path), 'utf-8')
      expect(raw).toContain('Research')

      const tags = await lib.tags.forTarget(note.id, 'note')
      expect(tags).toHaveLength(1)
    })
  })

  describe('assign to mindmap', () => {
    it('embeds tag names in mindmap JSON file', async () => {
      await lib.tags.create({ name: 'Concepts' })
      const mm = await lib.mindmaps.create({ title: 'Map' })

      await lib.tags.assign(mm.id, 'mindmap', ['Concepts'])

      const jsonPath = join(libPath, '.banjuan', 'data', 'mindmaps', mm.id.slice(0, 2), `${mm.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).toContain('Concepts')
    })
  })

  describe('unassign', () => {
    it('removes tag from document JSON and SQLite', async () => {
      await lib.tags.create({ name: 'Remove' })
      createTestFile(libPath, 'un.txt', 'x')
      const doc = await lib.documents.import('un.txt')
      await lib.tags.assign(doc.id, 'document', ['Remove'])

      await lib.tags.unassign(doc.id, 'document', 'Remove')

      const jsonPath = join(libPath, '.banjuan', 'data', 'documents', doc.id.slice(0, 2), `${doc.id}.json`)
      const fileData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      expect(fileData.tags).not.toContain('Remove')

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(0)
    })
  })

  describe('forTarget', () => {
    it('returns tags for a document', async () => {
      await lib.tags.create({ name: 'A' })
      await lib.tags.create({ name: 'B' })
      createTestFile(libPath, 'ft.txt', 'x')
      const doc = await lib.documents.import('ft.txt')
      await lib.tags.assign(doc.id, 'document', ['A', 'B'])

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(2)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- tags.test
```

- [ ] **Step 3: Implement file-first TagService**

Replace `packages/core/src/tags/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Tag, TagTarget, DocumentFileData, MindmapFileData } from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter, serializeFrontmatter } from '../storage/frontmatter.js'

export class TagService {
  private tagsFilePath: string
  private docStore: JsonStore<DocumentFileData>
  private mindmapStore: JsonStore<MindmapFileData>

  constructor(private db: Database.Database, private rootPath: string, private events: EventBus) {
    this.tagsFilePath = join(rootPath, '.banjuan', 'tags.json')
    this.docStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'))
    this.mindmapStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'mindmaps'))
  }

  private readTagsFile(): Array<{ id: string; name: string; color: string | null }> {
    if (!existsSync(this.tagsFilePath)) return []
    return JSON.parse(readFileSync(this.tagsFilePath, 'utf-8'))
  }

  private writeTagsFile(tags: Array<{ id: string; name: string; color: string | null }>): void {
    writeFileSync(this.tagsFilePath, JSON.stringify(tags, null, 2))
  }

  async create(input: { name: string; color?: string }): Promise<Tag> {
    const id = uuid()
    const color = input.color ?? null

    // Update tags.json
    const tags = this.readTagsFile()
    tags.push({ id, name: input.name, color })
    this.writeTagsFile(tags)

    // Update SQLite
    this.db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)').run(id, input.name, color)

    return { id, name: input.name, color }
  }

  async list(): Promise<Tag[]> {
    return this.db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
  }

  async assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void> {
    // Update entity file
    if (targetType === 'document') {
      const data = this.docStore.read(targetId)
      if (data) {
        data.tags = [...new Set([...data.tags, ...tagNames])]
        data.updatedAt = new Date().toISOString()
        this.docStore.write(data)
      }
    } else if (targetType === 'note') {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(targetId) as { path: string } | undefined
      if (row) {
        const filePath = join(this.rootPath, 'notes', row.path)
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, 'utf-8')
          const { data, content } = parseFrontmatter(raw)
          const existingTags = (data.tags as string[]) ?? []
          data.tags = [...new Set([...existingTags, ...tagNames])]
          data.updatedAt = new Date().toISOString()
          writeFileSync(filePath, serializeFrontmatter(data, content))
        }
      }
    } else if (targetType === 'mindmap') {
      const data = this.mindmapStore.read(targetId)
      if (data) {
        data.tags = [...new Set([...data.tags, ...tagNames])]
        data.updatedAt = new Date().toISOString()
        this.mindmapStore.write(data)
      }
    }

    // Update SQLite join table
    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]
    const insertTag = this.db.prepare(`INSERT OR IGNORE INTO ${table} (${idCol}, tag_id) VALUES (?, ?)`)
    const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')

    const assignAll = this.db.transaction(() => {
      for (const name of tagNames) {
        const tag = findTag.get(name) as { id: string } | undefined
        if (tag) {
          insertTag.run(targetId, tag.id)
          this.events.emit('tag:assigned', { targetId, targetType, tagName: name })
        }
      }
    })
    assignAll()
  }

  async unassign(targetId: string, targetType: TagTarget, tagName: string): Promise<void> {
    // Update entity file
    if (targetType === 'document') {
      const data = this.docStore.read(targetId)
      if (data) {
        data.tags = data.tags.filter(t => t !== tagName)
        data.updatedAt = new Date().toISOString()
        this.docStore.write(data)
      }
    } else if (targetType === 'note') {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(targetId) as { path: string } | undefined
      if (row) {
        const filePath = join(this.rootPath, 'notes', row.path)
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, 'utf-8')
          const { data, content } = parseFrontmatter(raw)
          data.tags = ((data.tags as string[]) ?? []).filter((t: string) => t !== tagName)
          data.updatedAt = new Date().toISOString()
          writeFileSync(filePath, serializeFrontmatter(data, content))
        }
      }
    } else if (targetType === 'mindmap') {
      const data = this.mindmapStore.read(targetId)
      if (data) {
        data.tags = data.tags.filter(t => t !== tagName)
        data.updatedAt = new Date().toISOString()
        this.mindmapStore.write(data)
      }
    }

    // Update SQLite
    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]
    const tag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: string } | undefined
    if (tag) {
      this.db.prepare(`DELETE FROM ${table} WHERE ${idCol} = ? AND tag_id = ?`).run(targetId, tag.id)
      this.events.emit('tag:removed', { targetId, targetType, tagName })
    }
  }

  async forTarget(targetId: string, targetType: TagTarget): Promise<Tag[]> {
    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]

    return this.db
      .prepare(`SELECT tags.* FROM tags JOIN ${table} ON tags.id = ${table}.tag_id WHERE ${table}.${idCol} = ?`)
      .all(targetId) as Tag[]
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- tags.test
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tags/service.ts packages/core/test/tags.test.ts
git commit -m "feat(core): refactor TagService to tags.json + embedded assignment

Tag definitions stored in .banjuan/tags.json. Tag assignment embeds
tag names in each entity's JSON/frontmatter file. Supports document,
note, and mindmap targets."
```

---

### Task 9: IndexService

**Files:**
- Create: `packages/core/src/indexing/service.ts`
- Create: `packages/core/test/indexing.test.ts`
- Modify: `packages/core/src/library.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for IndexService**

Create `packages/core/test/indexing.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '../src/library.js'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { IndexService } from '../src/indexing/service.js'

describe('IndexService', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  describe('rebuildFull', () => {
    it('rebuilds SQLite from document JSON files', async () => {
      // Create a document normally
      createTestFile(libPath, 'test.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('test.pdf')

      // Verify document is in SQLite
      expect(await lib.documents.get(doc.id)).not.toBeNull()

      // Wipe SQLite (simulate corruption)
      const db = (lib as any).db
      db.prepare('DELETE FROM documents').run()
      expect(await lib.documents.get(doc.id)).toBeNull()

      // Rebuild from files
      const indexer = new IndexService(db, libPath)
      await indexer.rebuildFull()

      // Document restored
      const restored = await lib.documents.get(doc.id)
      expect(restored).not.toBeNull()
      expect(restored!.title).toBe(doc.title)
      expect(restored!.path).toBe('test.pdf')
    })

    it('rebuilds annotations from JSON files', async () => {
      createTestFile(libPath, 'ann.pdf', Buffer.from('pdf'))
      const doc = await lib.documents.import('ann.pdf')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'pdf', page: 1, rects: [], text: '' },
        content: 'test annotation',
      })

      // Wipe
      const db = (lib as any).db
      db.prepare('DELETE FROM annotations').run()

      // Rebuild
      const indexer = new IndexService(db, libPath)
      await indexer.rebuildFull()

      const restored = await lib.annotations.get(ann.id)
      expect(restored).not.toBeNull()
      expect(restored!.content).toBe('test annotation')
    })

    it('rebuilds notes from .md frontmatter', async () => {
      const note = await lib.notes.create({ title: 'Rebuild Note', content: 'hello' })

      const db = (lib as any).db
      db.prepare('DELETE FROM notes').run()

      const indexer = new IndexService(db, libPath)
      await indexer.rebuildFull()

      const restored = await lib.notes.get(note.id)
      expect(restored).not.toBeNull()
      expect(restored!.title).toBe('Rebuild Note')
      expect(restored!.content).toBe('hello')
    })

    it('rebuilds mindmaps with nodes and edges', async () => {
      const mm = await lib.mindmaps.create({ title: 'Rebuild Map' })
      const n1 = await lib.mindmaps.addNode(mm.id, { title: 'Node A' })
      const n2 = await lib.mindmaps.addNode(mm.id, { title: 'Node B' })
      await lib.mindmaps.addEdge(mm.id, { sourceId: n1.id, targetId: n2.id })

      const db = (lib as any).db
      db.prepare('DELETE FROM mindmap_edges').run()
      db.prepare('DELETE FROM mindmap_nodes').run()
      db.prepare('DELETE FROM mindmaps').run()

      const indexer = new IndexService(db, libPath)
      await indexer.rebuildFull()

      expect(await lib.mindmaps.get(mm.id)).not.toBeUndefined()
      const nodes = await lib.mindmaps.getNodes(mm.id)
      expect(nodes).toHaveLength(2)
      const edges = await lib.mindmaps.getEdges(mm.id)
      expect(edges).toHaveLength(1)
    })

    it('rebuilds tags from tags.json', async () => {
      await lib.tags.create({ name: 'TestTag', color: '#ff0000' })

      const db = (lib as any).db
      db.prepare('DELETE FROM tags').run()

      const indexer = new IndexService(db, libPath)
      await indexer.rebuildFull()

      const tags = await lib.tags.list()
      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('TestTag')
    })

    it('rebuilds tag assignments from entity files', async () => {
      await lib.tags.create({ name: 'Indexed' })
      createTestFile(libPath, 'tagged.txt', 'x')
      const doc = await lib.documents.import('tagged.txt', { tags: ['Indexed'] })
      await lib.tags.assign(doc.id, 'document', ['Indexed'])

      const db = (lib as any).db
      db.prepare('DELETE FROM doc_tags').run()

      const indexer = new IndexService(db, libPath)
      await indexer.rebuildFull()

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(1)
    })

    it('writes timestamp to db.meta.json', async () => {
      const db = (lib as any).db
      const indexer = new IndexService(db, libPath)
      await indexer.rebuildFull()

      const meta = JSON.parse(readFileSync(join(libPath, '.banjuan', 'db.meta.json'), 'utf-8'))
      expect(meta.lastIndexTime).toBeDefined()
      expect(typeof meta.lastIndexTime).toBe('number')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- indexing.test
```

- [ ] **Step 3: Implement IndexService**

Create `packages/core/src/indexing/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { DocumentFileData, AnnotationFileData, MindmapFileData, NoteFileData } from '../types.js'

export class IndexService {
  private docStore: JsonStore<DocumentFileData>
  private annStore: JsonStore<AnnotationFileData>
  private mmStore: JsonStore<MindmapFileData>
  private metaPath: string
  private tagsPath: string
  private notesDir: string

  constructor(private db: Database.Database, private rootPath: string) {
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore(join(banjuanDir, 'data', 'documents'))
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'))
    this.mmStore = new JsonStore(join(banjuanDir, 'data', 'mindmaps'))
    this.metaPath = join(banjuanDir, 'db.meta.json')
    this.tagsPath = join(banjuanDir, 'tags.json')
    this.notesDir = join(rootPath, 'notes')
  }

  async rebuildFull(): Promise<void> {
    // Clear all tables
    this.db.prepare('DELETE FROM mindmap_edges').run()
    this.db.prepare('DELETE FROM mindmap_nodes').run()
    this.db.prepare('DELETE FROM mindmap_tags').run()
    this.db.prepare('DELETE FROM note_annotations').run()
    this.db.prepare('DELETE FROM note_tags').run()
    this.db.prepare('DELETE FROM doc_tags').run()
    this.db.prepare('DELETE FROM mindmaps').run()
    this.db.prepare('DELETE FROM annotations').run()
    this.db.prepare('DELETE FROM notes').run()
    this.db.prepare('DELETE FROM documents').run()
    this.db.prepare('DELETE FROM tags').run()
    this.db.prepare("DELETE FROM search_index").run()

    // Rebuild tags
    this.indexTags()

    // Rebuild documents
    for (const doc of this.docStore.listAll()) {
      this.indexDocument(doc)
    }

    // Rebuild annotations
    for (const ann of this.annStore.listAll()) {
      this.indexAnnotation(ann)
    }

    // Rebuild notes
    this.indexAllNotes()

    // Rebuild mindmaps
    for (const mm of this.mmStore.listAll()) {
      this.indexMindmap(mm)
    }

    // Write timestamp
    this.writeMetaTimestamp()
  }

  private indexTags(): void {
    if (!existsSync(this.tagsPath)) return
    const tags = JSON.parse(readFileSync(this.tagsPath, 'utf-8')) as Array<{ id: string; name: string; color: string | null }>
    const insert = this.db.prepare('INSERT OR REPLACE INTO tags (id, name, color) VALUES (?, ?, ?)')
    for (const tag of tags) {
      insert.run(tag.id, tag.name, tag.color)
    }
  }

  private indexDocument(doc: DocumentFileData): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(doc.id, doc.title, JSON.stringify(doc.authors), doc.path, doc.type, doc.hash, JSON.stringify(doc.metadata), doc.createdAt, doc.updatedAt)

    this.db.prepare(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`
    ).run(doc.title, doc.title, `document:${doc.id}`)

    // Index tag assignments
    if (doc.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO doc_tags (doc_id, tag_id) VALUES (?, ?)')
      for (const tagName of doc.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(doc.id, tag.id)
      }
    }
  }

  private indexAnnotation(ann: AnnotationFileData): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ann.id, ann.docId, ann.type, ann.page, JSON.stringify(ann.position), ann.content, ann.selectedText, ann.color, ann.createdAt, ann.updatedAt)
  }

  private indexAllNotes(): void {
    if (!existsSync(this.notesDir)) return
    const files = readdirSync(this.notesDir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.md')) continue
      this.indexNoteFile(file.name)
    }
  }

  private indexNoteFile(filename: string): void {
    const filePath = join(this.notesDir, filename)
    const raw = readFileSync(filePath, 'utf-8')
    const { data, content } = parseFrontmatter<NoteFileData>(raw)

    if (!data.id) return

    this.db.prepare(
      `INSERT OR REPLACE INTO notes (id, title, path, doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(data.id, data.title ?? filename, filename, data.docId ?? null, data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString())

    this.db.prepare(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`
    ).run(data.title ?? filename, content, `note:${data.id}`)

    // Index annotation links
    if (data.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT OR IGNORE INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of data.annotationIds) {
        insertLink.run(data.id, annId)
      }
    }

    // Index tag assignments
    if (data.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)')
      for (const tagName of data.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(data.id, tag.id)
      }
    }
  }

  private indexMindmap(mm: MindmapFileData): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(mm.id, mm.title, mm.docId, mm.layout, mm.createdAt, mm.updatedAt)

    for (const node of mm.nodes) {
      this.db.prepare(
        `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, annotation_id, title, content, color, position_x, position_y, sort_order, collapsed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(node.id, mm.id, node.parentId, node.annotationId, node.title, node.content, node.color, node.positionX, node.positionY, node.sortOrder, node.collapsed ? 1 : 0, mm.createdAt)
    }

    for (const edge of mm.edges) {
      this.db.prepare(
        `INSERT OR REPLACE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(edge.id, mm.id, edge.sourceId, edge.targetId, edge.label, edge.style)
    }

    // Index tag assignments
    if (mm.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO mindmap_tags (mindmap_id, tag_id) VALUES (?, ?)')
      for (const tagName of mm.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(mm.id, tag.id)
      }
    }
  }

  private writeMetaTimestamp(): void {
    writeFileSync(this.metaPath, JSON.stringify({ lastIndexTime: Date.now() }))
  }
}
```

- [ ] **Step 4: Update exports in index.ts**

Add to `packages/core/src/index.ts`:

```typescript
export { IndexService } from './indexing/service.js'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- indexing.test
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/indexing/ packages/core/test/indexing.test.ts packages/core/src/index.ts
git commit -m "feat(core): add IndexService for full SQLite rebuild from files

Scans .banjuan/data/ JSON files and notes/ .md files to rebuild all
SQLite tables including FTS5 search index and tag assignment joins."
```

---

### Task 10: FileWatcher

**Files:**
- Create: `packages/core/src/indexing/watcher.ts`
- Add tests to: `packages/core/test/indexing.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for FileWatcher**

Add to `packages/core/test/indexing.test.ts`:

```typescript
import { FileWatcher } from '../src/indexing/watcher.js'

describe('FileWatcher', () => {
  let tempDir: string
  let lib: Library
  let libPath: string

  beforeEach(() => {
    tempDir = createTempDir()
    libPath = join(tempDir, 'lib')
    lib = Library.init(libPath)
  })

  afterEach(async () => {
    await lib.close()
    cleanupTempDir(tempDir)
  })

  it('can start and stop without errors', async () => {
    const db = (lib as any).db
    const watcher = new FileWatcher(db, libPath)
    watcher.start()

    // Give it a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    watcher.stop()
  })

  it('detects new annotation JSON file', async () => {
    const db = (lib as any).db
    const watcher = new FileWatcher(db, libPath)
    watcher.start()

    // Manually write an annotation JSON (simulating sync)
    const annDir = join(libPath, '.banjuan', 'data', 'annotations', 'ab')
    mkdirSync(annDir, { recursive: true })
    const annData = {
      id: 'ab000000-test-file-watcher',
      docId: 'doc-id',
      type: 'highlight',
      page: 1,
      position: { type: 'pdf', page: 1, rects: [], text: '' },
      content: 'watched',
      selectedText: null,
      color: 'yellow',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writeFileSync(join(annDir, 'ab000000-test-file-watcher.json'), JSON.stringify(annData, null, 2))

    // Wait for debounce + processing
    await new Promise(resolve => setTimeout(resolve, 500))

    watcher.stop()

    // Check if annotation was indexed
    const row = db.prepare('SELECT id FROM annotations WHERE id = ?').get('ab000000-test-file-watcher')
    expect(row).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @banjuan/core test -- indexing.test
```

- [ ] **Step 3: Implement FileWatcher**

Create `packages/core/src/indexing/watcher.ts`:

```typescript
import type Database from 'better-sqlite3'
import { watch, type FSWatcher, readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { DocumentFileData, AnnotationFileData, MindmapFileData, NoteFileData } from '../types.js'

export class FileWatcher {
  private watchers: FSWatcher[] = []
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private docStore: JsonStore<DocumentFileData>
  private annStore: JsonStore<AnnotationFileData>
  private mmStore: JsonStore<MindmapFileData>

  constructor(private db: Database.Database, private rootPath: string) {
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore(join(banjuanDir, 'data', 'documents'))
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'))
    this.mmStore = new JsonStore(join(banjuanDir, 'data', 'mindmaps'))
  }

  start(): void {
    const dataDir = join(this.rootPath, '.banjuan', 'data')
    const notesDir = join(this.rootPath, 'notes')

    const watchDir = (dir: string) => {
      if (!existsSync(dir)) return
      try {
        const watcher = watch(dir, { recursive: true }, (_event, filename) => {
          if (filename) this.handleChange(dir, filename)
        })
        this.watchers.push(watcher)
      } catch {
        // recursive watch not supported on all platforms
      }
    }

    watchDir(dataDir)
    watchDir(notesDir)
  }

  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close()
    }
    this.watchers = []
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  private handleChange(baseDir: string, filename: string): void {
    const fullPath = join(baseDir, filename)
    const key = fullPath

    // Debounce: wait 200ms for rapid changes to settle
    const existing = this.debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key)
      this.processChange(baseDir, filename)
    }, 200))
  }

  private processChange(baseDir: string, filename: string): void {
    const fullPath = join(baseDir, filename)
    const isNotesDir = baseDir === join(this.rootPath, 'notes')

    if (isNotesDir && filename.endsWith('.md')) {
      this.reindexNote(filename)
    } else if (filename.endsWith('.json')) {
      if (filename.includes('documents')) {
        this.reindexDocumentFile(fullPath)
      } else if (filename.includes('annotations')) {
        this.reindexAnnotationFile(fullPath)
      } else if (filename.includes('mindmaps')) {
        this.reindexMindmapFile(fullPath)
      }
    }
  }

  private reindexDocumentFile(fullPath: string): void {
    if (!existsSync(fullPath)) return
    try {
      const doc = JSON.parse(readFileSync(fullPath, 'utf-8')) as DocumentFileData
      this.db.prepare(
        `INSERT OR REPLACE INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(doc.id, doc.title, JSON.stringify(doc.authors), doc.path, doc.type, doc.hash, JSON.stringify(doc.metadata), doc.createdAt, doc.updatedAt)
    } catch { /* ignore malformed files */ }
  }

  private reindexAnnotationFile(fullPath: string): void {
    if (!existsSync(fullPath)) return
    try {
      const ann = JSON.parse(readFileSync(fullPath, 'utf-8')) as AnnotationFileData
      this.db.prepare(
        `INSERT OR REPLACE INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(ann.id, ann.docId, ann.type, ann.page, JSON.stringify(ann.position), ann.content, ann.selectedText, ann.color, ann.createdAt, ann.updatedAt)
    } catch { /* ignore malformed files */ }
  }

  private reindexMindmapFile(fullPath: string): void {
    if (!existsSync(fullPath)) return
    try {
      const mm = JSON.parse(readFileSync(fullPath, 'utf-8')) as MindmapFileData
      this.db.prepare('INSERT OR REPLACE INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(mm.id, mm.title, mm.docId, mm.layout, mm.createdAt, mm.updatedAt)

      // Clear and re-insert nodes/edges for this mindmap
      this.db.prepare('DELETE FROM mindmap_edges WHERE mindmap_id = ?').run(mm.id)
      this.db.prepare('DELETE FROM mindmap_nodes WHERE mindmap_id = ?').run(mm.id)
      for (const node of mm.nodes) {
        this.db.prepare(
          `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, annotation_id, title, content, color, position_x, position_y, sort_order, collapsed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(node.id, mm.id, node.parentId, node.annotationId, node.title, node.content, node.color, node.positionX, node.positionY, node.sortOrder, node.collapsed ? 1 : 0, mm.createdAt)
      }
      for (const edge of mm.edges) {
        this.db.prepare('INSERT OR REPLACE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)').run(edge.id, mm.id, edge.sourceId, edge.targetId, edge.label, edge.style)
      }
    } catch { /* ignore malformed files */ }
  }

  private reindexNote(filename: string): void {
    const filePath = join(this.rootPath, 'notes', filename)
    if (!existsSync(filePath)) return
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const { data } = parseFrontmatter<NoteFileData>(raw)
      if (!data.id) return
      this.db.prepare(
        `INSERT OR REPLACE INTO notes (id, title, path, doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(data.id, data.title ?? filename, filename, data.docId ?? null, data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString())
    } catch { /* ignore malformed files */ }
  }
}
```

- [ ] **Step 4: Update exports**

Add to `packages/core/src/index.ts`:

```typescript
export { FileWatcher } from './indexing/watcher.js'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @banjuan/core test -- indexing.test
```

Expected: All PASS. The FileWatcher test may be flaky due to timing — adjust the sleep to 600ms if needed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/indexing/watcher.ts packages/core/test/indexing.test.ts packages/core/src/index.ts
git commit -m "feat(core): add FileWatcher for real-time index updates

Watches .banjuan/data/ and notes/ for file changes. Debounces rapid
changes and re-indexes affected entities into SQLite."
```

---

### Task 11: Integration — Run All Tests

**Files:**
- Modify: `packages/core/test/search.test.ts` (if needed)
- Modify: `packages/core/test/plugins.test.ts` (if needed)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 2: Fix any remaining test failures**

Common fixes needed:
- `search.test.ts`: Tests import documents by copying files. Update to use `createTestFile` inside library root, then import by relative path.
- `plugins.test.ts`: Constructor signatures changed — AnnotationService, MindmapService, TagService now take `rootPath`. These should already be handled in Task 3 stub changes, but verify.
- `graph.test.ts` (if exists): Same pattern — create files in library root.

For `packages/core/test/search.test.ts`, the typical fix:

Replace file import patterns from:
```typescript
const doc = await lib.documents.import('/path/to/external/file.pdf')
```
to:
```typescript
createTestFile(libPath, 'file.pdf', Buffer.from('unique content'))
const doc = await lib.documents.import('file.pdf')
```

- [ ] **Step 3: Verify all tests pass**

```bash
pnpm --filter @banjuan/core test
```

Expected: ALL tests pass (storage, documents, annotations, notes, mindmaps, tags, indexing, search, plugins, library, db).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A packages/core/test/
git commit -m "fix(core): update remaining tests for file-first storage"
```

- [ ] **Step 5: Run build to verify TypeScript compilation**

```bash
pnpm --filter @banjuan/core build
```

Fix any type errors. Common issues:
- Missing imports for new types
- Constructor signature mismatches

- [ ] **Step 6: Final commit if build fixes needed**

```bash
git add packages/core/src/
git commit -m "fix(core): resolve TypeScript compilation errors"
```
