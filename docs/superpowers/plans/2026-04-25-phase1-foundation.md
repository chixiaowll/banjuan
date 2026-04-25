# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the monorepo, implement @banjuan/core with Library, DB, Documents, Tags, and Search modules, and create a basic Electron + React shell that can open a library and display imported documents.

**Architecture:** Core+shell pattern — `@banjuan/core` is a pure Node.js library with zero UI dependencies. The Electron app imports core in its main process and exposes it to the renderer via IPC. All business logic lives in core; the app is a thin UI layer.

**Tech Stack:** pnpm workspace, TypeScript, better-sqlite3, Vitest, Electron 35, React 19, Vite

---

## File Structure

```
banjuan/
├── package.json                          # Workspace root
├── pnpm-workspace.yaml                   # Workspace config
├── tsconfig.json                         # Base TS config
├── tsconfig.base.json                    # Shared compiler options
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API re-exports
│   │   │   ├── types.ts                  # All shared types
│   │   │   ├── library.ts                # Library class (entry point)
│   │   │   ├── db/
│   │   │   │   ├── connection.ts         # SQLite connection wrapper
│   │   │   │   └── schema.ts             # Table creation + migrations
│   │   │   ├── documents/
│   │   │   │   ├── service.ts            # DocumentService CRUD
│   │   │   │   └── metadata.ts           # Metadata extraction per type
│   │   │   ├── annotations/
│   │   │   │   └── service.ts            # AnnotationService CRUD
│   │   │   ├── notes/
│   │   │   │   └── service.ts            # NoteService CRUD
│   │   │   ├── tags/
│   │   │   │   └── service.ts            # TagService CRUD
│   │   │   └── search/
│   │   │       └── service.ts            # SearchService (FTS5)
│   │   └── test/
│   │       ├── helpers.ts                # Test utilities (temp dirs, fixtures)
│   │       ├── db.test.ts
│   │       ├── library.test.ts
│   │       ├── documents.test.ts
│   │       ├── annotations.test.ts
│   │       ├── notes.test.ts
│   │       ├── tags.test.ts
│   │       └── search.test.ts
│   └── app/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts                # Vite for renderer
│       ├── electron-builder.json
│       ├── src/
│       │   ├── main/
│       │   │   ├── index.ts              # Electron main process
│       │   │   └── ipc.ts               # IPC handlers (bridge to core)
│       │   ├── preload/
│       │   │   └── index.ts              # Context bridge
│       │   └── renderer/
│       │       ├── index.html
│       │       ├── index.tsx              # React entry
│       │       ├── App.tsx               # Root with router
│       │       ├── global.css
│       │       ├── components/
│       │       │   ├── Sidebar.tsx        # Left nav
│       │       │   ├── DocumentList.tsx   # Document grid/list
│       │       │   ├── DocumentCard.tsx   # Single document card
│       │       │   ├── ImportButton.tsx   # Import file trigger
│       │       │   └── TagBadge.tsx       # Tag display chip
│       │       ├── views/
│       │       │   ├── WelcomeView.tsx    # No library open
│       │       │   └── LibraryView.tsx    # Main library view
│       │       └── hooks/
│       │           └── useIpc.ts          # Typed IPC hooks
│       └── electron.d.ts                 # Window.electronAPI types
```

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `.gitignore`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`

- [ ] **Step 1: Create workspace root**

```json
// package.json
{
  "name": "banjuan",
  "private": true,
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "dev": "pnpm --filter @banjuan/app dev"
  },
  "engines": {
    "node": ">=20"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

```json
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/app" }
  ]
}
```

```gitignore
# .gitignore
node_modules/
dist/
*.tsbuildinfo
.DS_Store
.superpowers/
```

- [ ] **Step 2: Create @banjuan/core package**

```json
// packages/core/package.json
{
  "name": "@banjuan/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

```json
// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

```typescript
// packages/core/src/index.ts
export {}
```

- [ ] **Step 3: Install dependencies and verify**

Run: `cd /Users/chixiao/Documents/work/research/newproject && pnpm install`
Expected: Lockfile created, dependencies installed.

Run: `pnpm --filter @banjuan/core test`
Expected: "No test files found" (vitest runs, exits cleanly).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json .gitignore packages/core/ pnpm-lock.yaml
git commit -m "feat: monorepo scaffolding with @banjuan/core package"
```

---

## Task 2: Shared Types

**Files:**
- Create: `packages/core/src/types.ts`

- [ ] **Step 1: Define all core types**

```typescript
// packages/core/src/types.ts

// --- Document types ---

export type DocumentType = 'pdf' | 'epub' | 'txt' | 'md' | 'image' | 'video' | 'html'

export interface Document {
  id: string
  title: string
  authors: string[]
  path: string
  type: DocumentType
  hash: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface DocumentCreateInput {
  filePath: string
  title?: string
  tags?: string[]
}

export interface DocumentListOptions {
  tag?: string
  type?: DocumentType
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
}

// --- Annotation types ---

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'ink'

export interface PdfPosition {
  type: 'pdf'
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
  text: string
}

export interface EpubPosition {
  type: 'epub'
  cfi: string
  text: string
}

export interface TextPosition {
  type: 'text'
  startOffset: number
  endOffset: number
  text: string
}

export interface ImagePosition {
  type: 'image'
  rect: { x: number; y: number; w: number; h: number }
  path?: Array<{ x: number; y: number }>
}

export interface VideoPosition {
  type: 'video'
  timestamp: number
  duration?: number
  thumbnail?: string
}

export interface InkPosition {
  type: 'ink'
  page?: number
  strokes: Array<{
    points: Array<{ x: number; y: number; pressure?: number; timestamp?: number }>
    color: string
    width: number
  }>
  bounds: { x: number; y: number; w: number; h: number }
}

export type AnnotationPosition =
  | PdfPosition
  | EpubPosition
  | TextPosition
  | ImagePosition
  | VideoPosition
  | InkPosition

export interface Annotation {
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

export interface AnnotationCreateInput {
  docId: string
  type: AnnotationType
  page?: number
  position: AnnotationPosition
  content?: string
  selectedText?: string
  color?: string
}

export interface AnnotationListOptions {
  docId: string
  page?: number
  type?: AnnotationType
  color?: string
}

// --- Note types ---

export interface Note {
  id: string
  title: string
  path: string
  docId: string | null
  content: string
  createdAt: string
  updatedAt: string
}

export interface NoteCreateInput {
  title: string
  docId?: string
  annotationIds?: string[]
  content?: string
}

export interface NoteListOptions {
  docId?: string
  tag?: string
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
}

// --- Tag types ---

export interface Tag {
  id: string
  name: string
  color: string | null
}

export type TagTarget = 'document' | 'note'

// --- Search types ---

export interface SearchResult {
  type: 'document' | 'note' | 'annotation'
  id: string
  title: string
  snippet: string
  score: number
}

export interface SearchOptions {
  type?: 'document' | 'note' | 'annotation'
  limit?: number
}

// --- Library config ---

export interface LibraryConfig {
  name: string
  version: string
  createdAt: string
}
```

- [ ] **Step 2: Export from index**

```typescript
// packages/core/src/index.ts
export * from './types.js'
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @banjuan/core build`
Expected: Compiles without errors, `dist/` created.

- [ ] **Step 4: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): add shared type definitions"
```

---

## Task 3: Database Module

**Files:**
- Create: `packages/core/src/db/connection.ts`, `packages/core/src/db/schema.ts`, `packages/core/test/helpers.ts`, `packages/core/test/db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/helpers.ts
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'banjuan-test-'))
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
```

```typescript
// packages/core/test/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { createConnection } from '../src/db/connection.js'
import { initSchema } from '../src/db/schema.js'

describe('Database', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
    mkdirSync(join(tempDir, '.banjuan'), { recursive: true })
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  it('creates a SQLite connection', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    expect(db).toBeDefined()
    db.close()
  })

  it('initializes schema with all tables', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('documents')
    expect(tableNames).toContain('annotations')
    expect(tableNames).toContain('notes')
    expect(tableNames).toContain('note_annotations')
    expect(tableNames).toContain('tags')
    expect(tableNames).toContain('doc_tags')
    expect(tableNames).toContain('note_tags')

    db.close()
  })

  it('initializes FTS5 search index', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('search_index')

    db.close()
  })

  it('is idempotent — running initSchema twice does not error', () => {
    const dbPath = join(tempDir, '.banjuan', 'db.sqlite')
    const db = createConnection(dbPath)
    initSchema(db)
    initSchema(db)

    const count = db
      .prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'")
      .get() as { c: number }
    expect(count.c).toBeGreaterThan(0)

    db.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement connection and schema**

```typescript
// packages/core/src/db/connection.ts
import Database from 'better-sqlite3'

export function createConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
```

```typescript
// packages/core/src/db/schema.ts
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
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
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
    doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_annotations (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, annotation_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

CREATE TABLE IF NOT EXISTS doc_tags (
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (doc_id, tag_id)
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    title, content, type,
    tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    layout TEXT DEFAULT 'tree',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
    annotation_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
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
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
    label TEXT,
    style TEXT
);
`

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core test`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/db/ packages/core/test/
git commit -m "feat(core): SQLite connection and schema initialization"
```

---

## Task 4: Library Module

**Files:**
- Create: `packages/core/src/library.ts`, `packages/core/test/library.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/library.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('Library', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  describe('init', () => {
    it('creates .banjuan directory structure', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)

      expect(existsSync(join(libPath, '.banjuan', 'db.sqlite'))).toBe(true)
      expect(existsSync(join(libPath, '.banjuan', 'config.json'))).toBe(true)
      expect(existsSync(join(libPath, 'documents'))).toBe(true)
      expect(existsSync(join(libPath, 'notes'))).toBe(true)

      lib.close()
    })

    it('throws if directory already has .banjuan', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)
      lib.close()

      expect(() => Library.init(libPath)).toThrow('already exists')
    })
  })

  describe('open', () => {
    it('opens an existing library', () => {
      const libPath = join(tempDir, 'my-library')
      const lib1 = Library.init(libPath)
      lib1.close()

      const lib2 = Library.open(libPath)
      expect(lib2).toBeDefined()
      lib2.close()
    })

    it('throws if .banjuan does not exist', () => {
      const libPath = join(tempDir, 'empty')
      expect(() => Library.open(libPath)).toThrow('not a library')
    })
  })

  describe('properties', () => {
    it('exposes rootPath and service accessors', () => {
      const libPath = join(tempDir, 'my-library')
      const lib = Library.init(libPath)

      expect(lib.rootPath).toBe(libPath)
      expect(lib.documents).toBeDefined()
      expect(lib.annotations).toBeDefined()
      expect(lib.notes).toBeDefined()
      expect(lib.tags).toBeDefined()
      expect(lib.search).toBeDefined()

      lib.close()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core test`
Expected: FAIL — `Library` not found.

- [ ] **Step 3: Implement Library class**

```typescript
// packages/core/src/library.ts
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { createConnection } from './db/connection.js'
import { initSchema } from './db/schema.js'
import { DocumentService } from './documents/service.js'
import { AnnotationService } from './annotations/service.js'
import { NoteService } from './notes/service.js'
import { TagService } from './tags/service.js'
import { SearchService } from './search/service.js'
import type { LibraryConfig } from './types.js'

export class Library {
  readonly rootPath: string
  readonly documents: DocumentService
  readonly annotations: AnnotationService
  readonly notes: NoteService
  readonly tags: TagService
  readonly search: SearchService
  private db: Database.Database

  private constructor(rootPath: string, db: Database.Database) {
    this.rootPath = rootPath
    this.db = db
    this.documents = new DocumentService(db, rootPath)
    this.annotations = new AnnotationService(db)
    this.notes = new NoteService(db, rootPath)
    this.tags = new TagService(db)
    this.search = new SearchService(db)
  }

  static init(rootPath: string): Library {
    const banjuanDir = join(rootPath, '.banjuan')
    if (existsSync(banjuanDir)) {
      throw new Error(`Library already exists at ${rootPath}`)
    }

    mkdirSync(banjuanDir, { recursive: true })
    mkdirSync(join(rootPath, 'documents'), { recursive: true })
    mkdirSync(join(rootPath, 'notes'), { recursive: true })

    const config: LibraryConfig = {
      name: 'My Library',
      version: '1',
      createdAt: new Date().toISOString(),
    }
    writeFileSync(join(banjuanDir, 'config.json'), JSON.stringify(config, null, 2))

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

  close(): void {
    this.db.close()
  }
}
```

Create stub services so Library compiles:

```typescript
// packages/core/src/documents/service.ts
import type Database from 'better-sqlite3'

export class DocumentService {
  constructor(private db: Database.Database, private rootPath: string) {}
}
```

```typescript
// packages/core/src/annotations/service.ts
import type Database from 'better-sqlite3'

export class AnnotationService {
  constructor(private db: Database.Database) {}
}
```

```typescript
// packages/core/src/notes/service.ts
import type Database from 'better-sqlite3'

export class NoteService {
  constructor(private db: Database.Database, private rootPath: string) {}
}
```

```typescript
// packages/core/src/tags/service.ts
import type Database from 'better-sqlite3'

export class TagService {
  constructor(private db: Database.Database) {}
}
```

```typescript
// packages/core/src/search/service.ts
import type Database from 'better-sqlite3'

export class SearchService {
  constructor(private db: Database.Database) {}
}
```

Update index exports:

```typescript
// packages/core/src/index.ts
export * from './types.js'
export { Library } from './library.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core test`
Expected: All tests PASS (db.test.ts + library.test.ts).

- [ ] **Step 5: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/ packages/core/test/
git commit -m "feat(core): Library class with init/open and stub services"
```

---

## Task 5: Document Service

**Files:**
- Create: `packages/core/src/documents/metadata.ts`, `packages/core/test/documents.test.ts`
- Modify: `packages/core/src/documents/service.ts`

- [ ] **Step 1: Create a test PDF fixture**

We need a minimal test file. Create a tiny text file as fixture (PDF metadata extraction will be tested separately with real PDFs later — for now use a .txt file):

```typescript
// packages/core/test/documents.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, existsSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('DocumentService', () => {
  let tempDir: string
  let lib: Library
  let fixtureFile: string

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))

    fixtureFile = join(tempDir, 'test-doc.txt')
    writeFileSync(fixtureFile, 'Hello, this is test content for the document.')
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  describe('import', () => {
    it('copies file to documents/ and returns a Document', async () => {
      const doc = await lib.documents.import(fixtureFile)

      expect(doc.id).toBeTruthy()
      expect(doc.title).toBe('test-doc')
      expect(doc.type).toBe('txt')
      expect(doc.path).toBeTruthy()
      expect(existsSync(join(lib.rootPath, 'documents', doc.path))).toBe(true)
    })

    it('deduplicates by hash', async () => {
      const doc1 = await lib.documents.import(fixtureFile)
      await expect(lib.documents.import(fixtureFile)).rejects.toThrow('already imported')
    })

    it('allows custom title', async () => {
      const doc = await lib.documents.import(fixtureFile, { title: 'My Custom Title' })
      expect(doc.title).toBe('My Custom Title')
    })
  })

  describe('list', () => {
    it('returns all documents', async () => {
      await lib.documents.import(fixtureFile)
      const docs = await lib.documents.list()

      expect(docs).toHaveLength(1)
      expect(docs[0].title).toBe('test-doc')
    })

    it('returns empty array when no documents', async () => {
      const docs = await lib.documents.list()
      expect(docs).toEqual([])
    })

    it('sorts by created_at desc by default', async () => {
      await lib.documents.import(fixtureFile)

      const file2 = join(tempDir, 'second.txt')
      writeFileSync(file2, 'second file content that is different')
      const doc2 = await lib.documents.import(file2)

      const docs = await lib.documents.list()
      expect(docs[0].id).toBe(doc2.id)
    })
  })

  describe('get', () => {
    it('returns a document by id', async () => {
      const imported = await lib.documents.import(fixtureFile)
      const doc = await lib.documents.get(imported.id)

      expect(doc).not.toBeNull()
      expect(doc!.id).toBe(imported.id)
    })

    it('returns null for unknown id', async () => {
      const doc = await lib.documents.get('nonexistent')
      expect(doc).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes from DB and filesystem', async () => {
      const doc = await lib.documents.import(fixtureFile)
      const filePath = join(lib.rootPath, 'documents', doc.path)
      expect(existsSync(filePath)).toBe(true)

      await lib.documents.delete(doc.id)

      expect(await lib.documents.get(doc.id)).toBeNull()
      expect(existsSync(filePath)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core test -- test/documents.test.ts`
Expected: FAIL — `import` method not found.

- [ ] **Step 3: Implement metadata extraction**

```typescript
// packages/core/src/documents/metadata.ts
import { basename, extname } from 'node:path'
import type { DocumentType } from '../types.js'

const EXT_TO_TYPE: Record<string, DocumentType> = {
  '.pdf': 'pdf',
  '.epub': 'epub',
  '.txt': 'txt',
  '.md': 'md',
  '.markdown': 'md',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.webm': 'video',
  '.html': 'html',
  '.htm': 'html',
}

export function detectDocumentType(filePath: string): DocumentType {
  const ext = extname(filePath).toLowerCase()
  const type = EXT_TO_TYPE[ext]
  if (!type) {
    throw new Error(`Unsupported file type: ${ext}`)
  }
  return type
}

export function extractTitle(filePath: string): string {
  const name = basename(filePath)
  const ext = extname(name)
  return name.slice(0, name.length - ext.length)
}
```

- [ ] **Step 4: Implement DocumentService**

```typescript
// packages/core/src/documents/service.ts
import type Database from 'better-sqlite3'
import { copyFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { v4 as uuid } from 'uuid'
import type { Document, DocumentCreateInput, DocumentListOptions } from '../types.js'
import { detectDocumentType, extractTitle } from './metadata.js'

export class DocumentService {
  constructor(
    private db: Database.Database,
    private rootPath: string,
  ) {}

  async import(
    filePath: string,
    options?: { title?: string; tags?: string[] },
  ): Promise<Document> {
    const content = readFileSync(filePath)
    const hash = createHash('sha256').update(content).digest('hex')

    const existing = this.db
      .prepare('SELECT id FROM documents WHERE hash = ?')
      .get(hash) as { id: string } | undefined
    if (existing) {
      throw new Error(`File already imported (id: ${existing.id})`)
    }

    const type = detectDocumentType(filePath)
    const title = options?.title ?? extractTitle(filePath)
    const id = uuid()
    const fileName = `${id}-${basename(filePath)}`
    const relativePath = fileName

    copyFileSync(filePath, join(this.rootPath, 'documents', fileName))

    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, '[]', ?, ?, ?, '{}', ?, ?)`,
      )
      .run(id, title, relativePath, type, hash, now, now)

    return {
      id,
      title,
      authors: [],
      path: relativePath,
      type,
      hash,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
  }

  async list(options?: DocumentListOptions): Promise<Document[]> {
    let sql = 'SELECT * FROM documents'
    const params: unknown[] = []

    if (options?.tag) {
      sql +=
        ' WHERE id IN (SELECT doc_id FROM doc_tags JOIN tags ON tags.id = doc_tags.tag_id WHERE tags.name = ?)'
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

    const filePath = join(this.rootPath, 'documents', doc.path)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
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

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core test -- test/documents.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/documents/ packages/core/test/documents.test.ts
git commit -m "feat(core): DocumentService with import, list, get, delete"
```

---

## Task 6: Tag Service

**Files:**
- Create: `packages/core/test/tags.test.ts`
- Modify: `packages/core/src/tags/service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/tags.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('TagService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('creates a tag', async () => {
      const tag = await lib.tags.create({ name: 'machine-learning', color: 'blue' })
      expect(tag.id).toBeTruthy()
      expect(tag.name).toBe('machine-learning')
      expect(tag.color).toBe('blue')
    })

    it('throws on duplicate name', async () => {
      await lib.tags.create({ name: 'test' })
      await expect(lib.tags.create({ name: 'test' })).rejects.toThrow()
    })
  })

  describe('list', () => {
    it('returns all tags', async () => {
      await lib.tags.create({ name: 'a' })
      await lib.tags.create({ name: 'b' })
      const tags = await lib.tags.list()
      expect(tags).toHaveLength(2)
    })
  })

  describe('assign and query', () => {
    it('assigns tags to a document', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)

      await lib.tags.create({ name: 'AI' })
      await lib.tags.assign(doc.id, 'document', ['AI'])

      const docs = await lib.documents.list({ tag: 'AI' })
      expect(docs).toHaveLength(1)
      expect(docs[0].id).toBe(doc.id)
    })

    it('removes a tag assignment', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)

      await lib.tags.create({ name: 'AI' })
      await lib.tags.assign(doc.id, 'document', ['AI'])
      await lib.tags.unassign(doc.id, 'document', 'AI')

      const docs = await lib.documents.list({ tag: 'AI' })
      expect(docs).toHaveLength(0)
    })

    it('lists tags for a document', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)

      await lib.tags.create({ name: 'AI' })
      await lib.tags.create({ name: 'NLP' })
      await lib.tags.assign(doc.id, 'document', ['AI', 'NLP'])

      const tags = await lib.tags.forTarget(doc.id, 'document')
      expect(tags).toHaveLength(2)
      expect(tags.map((t) => t.name).sort()).toEqual(['AI', 'NLP'])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core test -- test/tags.test.ts`
Expected: FAIL — methods not found.

- [ ] **Step 3: Implement TagService**

```typescript
// packages/core/src/tags/service.ts
import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { Tag, TagTarget } from '../types.js'

export class TagService {
  constructor(private db: Database.Database) {}

  async create(input: { name: string; color?: string }): Promise<Tag> {
    const id = uuid()
    this.db
      .prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)')
      .run(id, input.name, input.color ?? null)
    return { id, name: input.name, color: input.color ?? null }
  }

  async list(): Promise<Tag[]> {
    return this.db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
  }

  async assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void> {
    const table = targetType === 'document' ? 'doc_tags' : 'note_tags'
    const idCol = targetType === 'document' ? 'doc_id' : 'note_id'

    const insertTag = this.db.prepare(
      `INSERT OR IGNORE INTO ${table} (${idCol}, tag_id) VALUES (?, ?)`,
    )

    const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')

    const assignAll = this.db.transaction(() => {
      for (const name of tagNames) {
        const tag = findTag.get(name) as { id: string } | undefined
        if (tag) {
          insertTag.run(targetId, tag.id)
        }
      }
    })

    assignAll()
  }

  async unassign(targetId: string, targetType: TagTarget, tagName: string): Promise<void> {
    const table = targetType === 'document' ? 'doc_tags' : 'note_tags'
    const idCol = targetType === 'document' ? 'doc_id' : 'note_id'

    const tag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as
      | { id: string }
      | undefined
    if (tag) {
      this.db.prepare(`DELETE FROM ${table} WHERE ${idCol} = ? AND tag_id = ?`).run(targetId, tag.id)
    }
  }

  async forTarget(targetId: string, targetType: TagTarget): Promise<Tag[]> {
    const table = targetType === 'document' ? 'doc_tags' : 'note_tags'
    const idCol = targetType === 'document' ? 'doc_id' : 'note_id'

    return this.db
      .prepare(`SELECT tags.* FROM tags JOIN ${table} ON tags.id = ${table}.tag_id WHERE ${table}.${idCol} = ?`)
      .all(targetId) as Tag[]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core test -- test/tags.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/tags/ packages/core/test/tags.test.ts
git commit -m "feat(core): TagService with create, assign, unassign, list"
```

---

## Task 7: Annotation Service

**Files:**
- Create: `packages/core/test/annotations.test.ts`
- Modify: `packages/core/src/annotations/service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/annotations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'
import type { AnnotationCreateInput, PdfPosition } from '../src/types.js'

describe('AnnotationService', () => {
  let tempDir: string
  let lib: Library
  let docId: string

  beforeEach(async () => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))

    const file = join(tempDir, 'test.txt')
    writeFileSync(file, 'test content')
    const doc = await lib.documents.import(file)
    docId = doc.id
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  const makeInput = (overrides?: Partial<AnnotationCreateInput>): AnnotationCreateInput => ({
    docId,
    type: 'highlight',
    page: 1,
    position: {
      type: 'pdf',
      page: 1,
      rects: [{ x: 10, y: 20, w: 100, h: 14 }],
      text: 'highlighted text',
    } satisfies PdfPosition,
    selectedText: 'highlighted text',
    color: 'yellow',
    ...overrides,
  })

  describe('create', () => {
    it('creates an annotation', async () => {
      const ann = await lib.annotations.create(makeInput())
      expect(ann.id).toBeTruthy()
      expect(ann.docId).toBe(docId)
      expect(ann.type).toBe('highlight')
      expect(ann.position.type).toBe('pdf')
    })
  })

  describe('list', () => {
    it('lists annotations for a document', async () => {
      await lib.annotations.create(makeInput({ page: 1 }))
      await lib.annotations.create(makeInput({ page: 2 }))

      const anns = await lib.annotations.list({ docId })
      expect(anns).toHaveLength(2)
    })

    it('filters by page', async () => {
      await lib.annotations.create(makeInput({ page: 1 }))
      await lib.annotations.create(makeInput({ page: 2 }))

      const anns = await lib.annotations.list({ docId, page: 1 })
      expect(anns).toHaveLength(1)
      expect(anns[0].page).toBe(1)
    })
  })

  describe('update', () => {
    it('updates color', async () => {
      const ann = await lib.annotations.create(makeInput())
      const updated = await lib.annotations.update(ann.id, { color: 'red' })

      expect(updated.color).toBe('red')
    })

    it('updates content', async () => {
      const ann = await lib.annotations.create(makeInput())
      const updated = await lib.annotations.update(ann.id, { content: 'my note' })

      expect(updated.content).toBe('my note')
    })
  })

  describe('delete', () => {
    it('removes an annotation', async () => {
      const ann = await lib.annotations.create(makeInput())
      await lib.annotations.delete(ann.id)

      const anns = await lib.annotations.list({ docId })
      expect(anns).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core test -- test/annotations.test.ts`
Expected: FAIL — `create` method not found.

- [ ] **Step 3: Implement AnnotationService**

```typescript
// packages/core/src/annotations/service.ts
import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { Annotation, AnnotationCreateInput, AnnotationListOptions } from '../types.js'

export class AnnotationService {
  constructor(private db: Database.Database) {}

  async create(input: AnnotationCreateInput): Promise<Annotation> {
    const id = uuid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.docId,
        input.type,
        input.page ?? null,
        JSON.stringify(input.position),
        input.content ?? null,
        input.selectedText ?? null,
        input.color ?? 'yellow',
        now,
        now,
      )

    return {
      id,
      docId: input.docId,
      type: input.type,
      page: input.page ?? null,
      position: input.position,
      content: input.content ?? null,
      selectedText: input.selectedText ?? null,
      color: input.color ?? 'yellow',
      createdAt: now,
      updatedAt: now,
    }
  }

  async list(options: AnnotationListOptions): Promise<Annotation[]> {
    let sql = 'SELECT * FROM annotations WHERE doc_id = ?'
    const params: unknown[] = [options.docId]

    if (options.page !== undefined) {
      sql += ' AND page = ?'
      params.push(options.page)
    }
    if (options.type) {
      sql += ' AND type = ?'
      params.push(options.type)
    }
    if (options.color) {
      sql += ' AND color = ?'
      params.push(options.color)
    }

    sql += ' ORDER BY created_at ASC'

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map(rowToAnnotation)
  }

  async get(id: string): Promise<Annotation | null> {
    const row = this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? rowToAnnotation(row) : null
  }

  async update(
    id: string,
    updates: { content?: string; color?: string },
  ): Promise<Annotation> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (updates.content !== undefined) {
      sets.push('content = ?')
      params.push(updates.content)
    }
    if (updates.color !== undefined) {
      sets.push('color = ?')
      params.push(updates.color)
    }

    params.push(id)
    this.db.prepare(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    return (await this.get(id))!
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM annotations WHERE id = ?').run(id)
  }
}

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: row.id as string,
    docId: row.doc_id as string,
    type: row.type as Annotation['type'],
    page: row.page as number | null,
    position: JSON.parse(row.position as string),
    content: row.content as string | null,
    selectedText: row.selected_text as string | null,
    color: row.color as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core test -- test/annotations.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/annotations/ packages/core/test/annotations.test.ts
git commit -m "feat(core): AnnotationService with create, list, update, delete"
```

---

## Task 8: Note Service

**Files:**
- Create: `packages/core/test/notes.test.ts`
- Modify: `packages/core/src/notes/service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/notes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('NoteService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  describe('create', () => {
    it('creates a note with markdown file', async () => {
      const note = await lib.notes.create({
        title: 'My Note',
        content: '# Hello\n\nThis is a note.',
      })

      expect(note.id).toBeTruthy()
      expect(note.title).toBe('My Note')
      expect(note.path).toContain('.md')

      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, 'utf-8')).toBe('# Hello\n\nThis is a note.')
    })

    it('creates a note linked to a document', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)

      const note = await lib.notes.create({
        title: 'Doc Note',
        docId: doc.id,
        content: 'Notes about the doc',
      })

      expect(note.docId).toBe(doc.id)
    })

    it('links annotations to the note', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)

      const ann = await lib.annotations.create({
        docId: doc.id,
        type: 'highlight',
        position: { type: 'text', startOffset: 0, endOffset: 5, text: 'conte' },
        selectedText: 'conte',
      })

      const note = await lib.notes.create({
        title: 'Note with ann',
        docId: doc.id,
        annotationIds: [ann.id],
        content: 'refs annotation',
      })

      const linkedAnns = await lib.notes.getAnnotations(note.id)
      expect(linkedAnns).toHaveLength(1)
      expect(linkedAnns[0].id).toBe(ann.id)
    })
  })

  describe('list', () => {
    it('returns all notes', async () => {
      await lib.notes.create({ title: 'A', content: 'a' })
      await lib.notes.create({ title: 'B', content: 'b' })

      const notes = await lib.notes.list()
      expect(notes).toHaveLength(2)
    })

    it('filters by docId', async () => {
      const file = join(tempDir, 'doc.txt')
      writeFileSync(file, 'content')
      const doc = await lib.documents.import(file)

      await lib.notes.create({ title: 'Linked', docId: doc.id, content: '' })
      await lib.notes.create({ title: 'Standalone', content: '' })

      const notes = await lib.notes.list({ docId: doc.id })
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('Linked')
    })
  })

  describe('get', () => {
    it('returns note with content loaded from file', async () => {
      const created = await lib.notes.create({ title: 'Test', content: '# Test content' })
      const note = await lib.notes.get(created.id)

      expect(note).not.toBeNull()
      expect(note!.content).toBe('# Test content')
    })
  })

  describe('update', () => {
    it('updates content on disk and title in DB', async () => {
      const note = await lib.notes.create({ title: 'Old', content: 'old content' })
      const updated = await lib.notes.update(note.id, {
        title: 'New',
        content: 'new content',
      })

      expect(updated.title).toBe('New')
      expect(updated.content).toBe('new content')

      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(readFileSync(filePath, 'utf-8')).toBe('new content')
    })
  })

  describe('delete', () => {
    it('removes from DB and filesystem', async () => {
      const note = await lib.notes.create({ title: 'Del', content: 'bye' })
      const filePath = join(lib.rootPath, 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)

      await lib.notes.delete(note.id)

      expect(await lib.notes.get(note.id)).toBeNull()
      expect(existsSync(filePath)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core test -- test/notes.test.ts`
Expected: FAIL — `create` method not found.

- [ ] **Step 3: Implement NoteService**

```typescript
// packages/core/src/notes/service.ts
import type Database from 'better-sqlite3'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Note, NoteCreateInput, NoteListOptions, Annotation } from '../types.js'

export class NoteService {
  constructor(
    private db: Database.Database,
    private rootPath: string,
  ) {}

  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    const slug = input.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '')
    const relativePath = `${slug}-${id.slice(0, 8)}.md`
    const fullPath = join(this.rootPath, 'notes', relativePath)

    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, input.content ?? '')

    this.db
      .prepare(
        `INSERT INTO notes (id, title, path, doc_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.title, relativePath, input.docId ?? null, now, now)

    if (input.annotationIds?.length) {
      const insertLink = this.db.prepare(
        'INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)',
      )
      for (const annId of input.annotationIds) {
        insertLink.run(id, annId)
      }
    }

    return {
      id,
      title: input.title,
      path: relativePath,
      docId: input.docId ?? null,
      content: input.content ?? '',
      createdAt: now,
      updatedAt: now,
    }
  }

  async list(options?: NoteListOptions): Promise<Note[]> {
    let sql = 'SELECT * FROM notes'
    const params: unknown[] = []
    const conditions: string[] = []

    if (options?.docId) {
      conditions.push('doc_id = ?')
      params.push(options.docId)
    }

    if (options?.tag) {
      conditions.push(
        'id IN (SELECT note_id FROM note_tags JOIN tags ON tags.id = note_tags.tag_id WHERE tags.name = ?)',
      )
      params.push(options.tag)
    }

    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map((row) => this.rowToNote(row))
  }

  async get(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    if (!row) return null

    const note = this.rowToNote(row)
    const filePath = join(this.rootPath, 'notes', note.path)
    if (existsSync(filePath)) {
      note.content = readFileSync(filePath, 'utf-8')
    }
    return note
  }

  async update(
    id: string,
    updates: { title?: string; content?: string },
  ): Promise<Note> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (updates.title !== undefined) {
      sets.push('title = ?')
      params.push(updates.title)
    }

    params.push(id)
    this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    if (updates.content !== undefined) {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as { path: string }
      const filePath = join(this.rootPath, 'notes', row.path)
      writeFileSync(filePath, updates.content)
    }

    return (await this.get(id))!
  }

  async delete(id: string): Promise<void> {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as
      | { path: string }
      | undefined
    if (!row) return

    const filePath = join(this.rootPath, 'notes', row.path)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  async getAnnotations(noteId: string): Promise<Annotation[]> {
    const rows = this.db
      .prepare(
        `SELECT a.* FROM annotations a
         JOIN note_annotations na ON a.id = na.annotation_id
         WHERE na.note_id = ?`,
      )
      .all(noteId) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: row.id as string,
      docId: row.doc_id as string,
      type: row.type as Annotation['type'],
      page: row.page as number | null,
      position: JSON.parse(row.position as string),
      content: row.content as string | null,
      selectedText: row.selected_text as string | null,
      color: row.color as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }))
  }

  private rowToNote(row: Record<string, unknown>): Note {
    return {
      id: row.id as string,
      title: row.title as string,
      path: row.path as string,
      docId: row.doc_id as string | null,
      content: '',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core test -- test/notes.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/notes/ packages/core/test/notes.test.ts
git commit -m "feat(core): NoteService with create, list, get, update, delete, annotation links"
```

---

## Task 9: Search Service (FTS5)

**Files:**
- Create: `packages/core/test/search.test.ts`
- Modify: `packages/core/src/search/service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('SearchService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(async () => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))

    const file1 = join(tempDir, 'transformers.txt')
    writeFileSync(file1, 'Attention is all you need paper about transformers')
    await lib.documents.import(file1)

    const file2 = join(tempDir, 'cnn.txt')
    writeFileSync(file2, 'Convolutional neural networks for image recognition')
    await lib.documents.import(file2)

    await lib.notes.create({
      title: 'Transformer Notes',
      content: 'The transformer architecture uses self-attention mechanisms',
    })
  })

  afterEach(() => {
    lib.close()
    cleanupTempDir(tempDir)
  })

  it('indexes documents on import', async () => {
    const results = await lib.search.query('transformers')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].type).toBe('document')
  })

  it('indexes notes on creation', async () => {
    const results = await lib.search.query('self-attention')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.type === 'note')).toBe(true)
  })

  it('filters by type', async () => {
    const results = await lib.search.query('transformer', { type: 'note' })
    expect(results.every((r) => r.type === 'note')).toBe(true)
  })

  it('returns empty for no match', async () => {
    const results = await lib.search.query('quantum computing')
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @banjuan/core test -- test/search.test.ts`
Expected: FAIL — `query` method not found or no results.

- [ ] **Step 3: Implement SearchService**

```typescript
// packages/core/src/search/service.ts
import type Database from 'better-sqlite3'
import type { SearchResult, SearchOptions } from '../types.js'

export class SearchService {
  constructor(private db: Database.Database) {}

  index(entry: { id: string; title: string; content: string; type: string }): void {
    this.db
      .prepare(
        `INSERT INTO search_index (rowid, title, content, type)
         VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
      )
      .run(entry.title, entry.content, `${entry.type}:${entry.id}`)
  }

  removeById(id: string): void {
    this.db
      .prepare("DELETE FROM search_index WHERE type LIKE '%:' || ?")
      .run(id)
  }

  async query(queryStr: string, options?: SearchOptions): Promise<SearchResult[]> {
    let sql = `
      SELECT title, content, type, rank
      FROM search_index
      WHERE search_index MATCH ?
    `
    const params: unknown[] = [queryStr]

    if (options?.type) {
      sql += " AND type LIKE ? || ':%'"
      params.push(options.type)
    }

    sql += ' ORDER BY rank LIMIT ?'
    params.push(options?.limit ?? 50)

    const rows = this.db.prepare(sql).all(...params) as Array<{
      title: string
      content: string
      type: string
      rank: number
    }>

    return rows.map((row) => {
      const [type, id] = row.type.split(':')
      return {
        type: type as SearchResult['type'],
        id,
        title: row.title,
        snippet: row.content.slice(0, 200),
        score: -row.rank,
      }
    })
  }
}
```

Now wire search indexing into DocumentService and NoteService. Add to `DocumentService.import` after the INSERT:

Add to `packages/core/src/documents/service.ts` — add a `searchService` parameter and call it:

The cleanest approach: Library passes the search service to Document and Note services. Update the constructors:

```typescript
// packages/core/src/documents/service.ts — update constructor and import method
// Add to constructor:
//   private search: SearchService
// In import(), after the DB insert, add:
//   this.search.index({ id, title, content: title, type: 'document' })
// In delete(), add:
//   this.search.removeById(id)
```

```typescript
// packages/core/src/notes/service.ts — update constructor and create method
// Add to constructor:
//   private search: SearchService
// In create(), after the DB insert, add:
//   this.search.index({ id, title: input.title, content: input.content ?? '', type: 'note' })
// In delete(), add:
//   this.search.removeById(id)
```

Update `Library` constructor to pass search service:

```typescript
// In packages/core/src/library.ts, update constructor:
this.search = new SearchService(db)
this.documents = new DocumentService(db, rootPath, this.search)
this.notes = new NoteService(db, rootPath, this.search)
```

Update DocumentService constructor signature:

```typescript
// packages/core/src/documents/service.ts
import { SearchService } from '../search/service.js'

export class DocumentService {
  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
  ) {}

  // In import(), after the db insert line, add:
  // this.search.index({ id, title, content: title, type: 'document' })

  // In delete(), before the db delete line, add:
  // this.search.removeById(id)
}
```

Update NoteService constructor signature:

```typescript
// packages/core/src/notes/service.ts
import { SearchService } from '../search/service.js'

export class NoteService {
  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
  ) {}

  // In create(), after the db insert, add:
  // this.search.index({ id, title: input.title, content: input.content ?? '', type: 'note' })

  // In delete(), before the db delete, add:
  // this.search.removeById(id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @banjuan/core test`
Expected: All tests PASS (search + previous tests still green).

- [ ] **Step 5: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/core/src/ packages/core/test/search.test.ts
git commit -m "feat(core): SearchService with FTS5 indexing and query"
```

---

## Task 10: Run All Core Tests

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @banjuan/core test`
Expected: All tests pass — db, library, documents, annotations, notes, tags, search.

- [ ] **Step 2: Build core**

Run: `pnpm --filter @banjuan/core build`
Expected: Compiles with no errors.

- [ ] **Step 3: Commit any fixes**

If any tests fail, fix them and commit.

---

## Task 11: Electron + React App Shell

**Files:**
- Create: `packages/app/package.json`, `packages/app/tsconfig.json`, `packages/app/vite.config.ts`, `packages/app/electron-builder.json`, `packages/app/src/main/index.ts`, `packages/app/src/main/ipc.ts`, `packages/app/src/preload/index.ts`, `packages/app/src/renderer/index.html`, `packages/app/src/renderer/index.tsx`, `packages/app/src/renderer/App.tsx`, `packages/app/src/renderer/global.css`, `packages/app/electron.d.ts`

- [ ] **Step 1: Create app package.json**

```json
// packages/app/package.json
{
  "name": "@banjuan/app",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "start": "electron dist/main/index.js"
  },
  "dependencies": {
    "@banjuan/core": "workspace:*",
    "electron-store": "^10.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "electron": "^35.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.3.0",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.0"
  }
}
```

```json
// packages/app/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src", "electron.d.ts"]
}
```

- [ ] **Step 2: Create Vite config with Electron plugin**

```typescript
// packages/app/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  root: 'src/renderer',
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: '../../dist/main',
            rollupOptions: {
              external: ['electron', 'better-sqlite3'],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: '../../dist/preload',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: '../../dist/renderer',
  },
})
```

- [ ] **Step 3: Create Electron main process**

```typescript
// packages/app/src/main/index.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc.js'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
```

```typescript
// packages/app/src/main/ipc.ts
import { ipcMain, dialog } from 'electron'
import { Library } from '@banjuan/core'

let library: Library | null = null

export function registerIpcHandlers() {
  ipcMain.handle('library:init', async (_event, path: string) => {
    library = Library.init(path)
    return { rootPath: library.rootPath }
  })

  ipcMain.handle('library:open', async (_event, path: string) => {
    library = Library.open(path)
    return { rootPath: library.rootPath }
  })

  ipcMain.handle('library:isOpen', () => {
    return library !== null
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('documents:import', async (_event, filePath: string) => {
    if (!library) throw new Error('No library open')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: ['pdf', 'epub', 'txt', 'md', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'html'] },
      ],
    })
    if (result.canceled) return null
    return library.documents.import(result.filePaths[0])
  })

  ipcMain.handle('documents:importFile', async (_event, filePath: string) => {
    if (!library) throw new Error('No library open')
    return library.documents.import(filePath)
  })

  ipcMain.handle('documents:list', async (_event, options?: Record<string, unknown>) => {
    if (!library) throw new Error('No library open')
    return library.documents.list(options as any)
  })

  ipcMain.handle('documents:get', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.documents.get(id)
  })

  ipcMain.handle('documents:delete', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.documents.delete(id)
  })

  ipcMain.handle('tags:list', async () => {
    if (!library) throw new Error('No library open')
    return library.tags.list()
  })

  ipcMain.handle('tags:create', async (_event, input: { name: string; color?: string }) => {
    if (!library) throw new Error('No library open')
    return library.tags.create(input)
  })

  ipcMain.handle('tags:forTarget', async (_event, targetId: string, targetType: string) => {
    if (!library) throw new Error('No library open')
    return library.tags.forTarget(targetId, targetType as any)
  })
}
```

- [ ] **Step 4: Create preload script**

```typescript
// packages/app/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  library: {
    init: (path: string) => ipcRenderer.invoke('library:init', path),
    open: (path: string) => ipcRenderer.invoke('library:open', path),
    isOpen: () => ipcRenderer.invoke('library:isOpen'),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },
  documents: {
    import: () => ipcRenderer.invoke('documents:import'),
    importFile: (path: string) => ipcRenderer.invoke('documents:importFile', path),
    list: (options?: Record<string, unknown>) => ipcRenderer.invoke('documents:list', options),
    get: (id: string) => ipcRenderer.invoke('documents:get', id),
    delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (input: { name: string; color?: string }) => ipcRenderer.invoke('tags:create', input),
    forTarget: (id: string, type: string) => ipcRenderer.invoke('tags:forTarget', id, type),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
```

```typescript
// packages/app/electron.d.ts
type ElectronAPI = typeof import('./src/preload/index.ts')['api']

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
```

- [ ] **Step 5: Create renderer (React)**

```html
<!-- packages/app/src/renderer/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>半卷闲书</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

```typescript
// packages/app/src/renderer/index.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.js'
import './global.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

```typescript
// packages/app/src/renderer/App.tsx
import React, { useState } from 'react'
import WelcomeView from './views/WelcomeView.js'
import LibraryView from './views/LibraryView.js'

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)

  if (!libraryPath) {
    return <WelcomeView onOpen={setLibraryPath} />
  }

  return <LibraryView rootPath={libraryPath} />
}
```

```css
/* packages/app/src/renderer/global.css */
:root {
  --bg: #1e1e2e;
  --surface: #292940;
  --text: #cdd6f4;
  --text-muted: #6c7086;
  --accent: #89b4fa;
  --border: #45475a;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

button {
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
}

button:hover {
  background: var(--border);
}

button.primary {
  background: var(--accent);
  color: var(--bg);
  border: none;
}

button.primary:hover {
  opacity: 0.9;
}
```

- [ ] **Step 6: Create WelcomeView and LibraryView**

```typescript
// packages/app/src/renderer/views/WelcomeView.tsx
import React from 'react'

interface Props {
  onOpen: (path: string) => void
}

export default function WelcomeView({ onOpen }: Props) {
  const handleCreate = async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (!dir) return
    const result = await window.electronAPI.library.init(dir)
    onOpen(result.rootPath)
  }

  const handleOpen = async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (!dir) return
    try {
      const result = await window.electronAPI.library.open(dir)
      onOpen(result.rootPath)
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '16px',
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>半卷闲书</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>腹有诗书气自华</p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="primary" onClick={handleCreate}>创建书房</button>
        <button onClick={handleOpen}>打开书房</button>
      </div>
    </div>
  )
}
```

```typescript
// packages/app/src/renderer/views/LibraryView.tsx
import React, { useEffect, useState } from 'react'
import type { Document } from '@banjuan/core'

interface Props {
  rootPath: string
}

export default function LibraryView({ rootPath }: Props) {
  const [documents, setDocuments] = useState<Document[]>([])

  const loadDocuments = async () => {
    const docs = await window.electronAPI.documents.list()
    setDocuments(docs)
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  const handleImport = async () => {
    const result = await window.electronAPI.documents.import()
    if (result) {
      await loadDocuments()
    }
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.documents.delete(id)
    await loadDocuments()
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <div style={{
        width: '240px',
        borderRight: '1px solid var(--border)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <h2 style={{ fontSize: '16px', marginBottom: '8px' }}>半卷闲书</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{rootPath}</p>
        <button className="primary" onClick={handleImport} style={{ marginTop: '16px' }}>
          导入文档
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        <h2 style={{ marginBottom: '16px' }}>文档库</h2>
        {documents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>还没有文档，点击"导入文档"开始</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  background: 'var(--surface)',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '8px' }}>
                  {doc.type.toUpperCase()}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  style={{ marginTop: '8px', fontSize: '12px', color: '#f38ba8', borderColor: '#f38ba8' }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Install dependencies and verify**

Run: `cd /Users/chixiao/Documents/work/research/newproject && pnpm install`
Expected: All dependencies installed.

Run: `pnpm --filter @banjuan/app dev`
Expected: Vite + Electron starts, window opens showing "半卷闲书" welcome screen.

- [ ] **Step 8: Manual test**

1. Click "创建书房" → select a directory → library initializes
2. Click "导入文档" → select a .txt or .pdf file → document appears in grid
3. Click "删除" on a document → it disappears

- [ ] **Step 9: Commit**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add packages/app/
git commit -m "feat(app): Electron + React shell with library and document management UI"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run all core tests**

Run: `pnpm --filter @banjuan/core test`
Expected: All tests pass.

- [ ] **Step 2: Build all packages**

Run: `pnpm -r build`
Expected: All packages compile.

- [ ] **Step 3: Start app**

Run: `pnpm --filter @banjuan/app dev`
Expected: App opens, full create→import→list→delete flow works.

- [ ] **Step 4: Verify portability**

Copy the created library directory to another location. Open it with the app. All documents and data should be intact.

- [ ] **Step 5: Commit final state**

```bash
cd /Users/chixiao/Documents/work/research/newproject
git add -A
git commit -m "feat: Phase 1 complete — foundation, core library, and Electron shell"
```

---

## What Phase 1 Delivers

After completing this plan:
- **@banjuan/core** — fully tested Node.js library with Library, Documents, Annotations, Notes, Tags, and Search services
- **@banjuan/app** — Electron + React desktop app that can create/open libraries, import documents, and display them
- **Portable** — library is a self-contained directory, copy it anywhere
- **Foundation for Phase 2+** — readers, annotation UI, and note editor plug into this shell

## Next Plans

- **Phase 2 plan**: Readers/Viewers (PDF.js, epub.js, text, image, video)
- **Phase 3 plan**: Annotation UI (highlight, ink, image region, video timestamp)
- **Phase 4 plan**: Note editor (Milkdown, annotation references, bidirectional links)
- **Phase 5 plan**: Mindmap notes (D3.js tree layout, drag from annotations)
