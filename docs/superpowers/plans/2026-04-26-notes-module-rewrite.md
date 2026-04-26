# Notes Module Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the notes module with BlockNote block editor, bidirectional links, folder organization, customizable templates, reading mode, and Zettlr-inspired typography.

**Architecture:** Replace the Milkdown-based markdown note system with a BlockNote JSON-based block editor. Extend the core service layer with new services (FolderService, NoteLinkService, TemplateService) alongside the rewritten NoteService. Frontend gets a three-column layout (folder tree | editor | backlinks) with custom BlockNote blocks for annotation/document embeds and bidirectional links.

**Tech Stack:** BlockNote (`@blocknote/react`, `@blocknote/core`, `@blocknote/mantine`), React 19, SQLite (better-sqlite3), Vitest, Electron IPC.

---

## File Structure

### New Files — Core (`packages/core/src/`)

| File | Responsibility |
|------|---------------|
| `notes/service.ts` | **Rewrite** — NoteService with JSON content, folder support, link syncing |
| `notes/folder-service.ts` | FolderService — CRUD for nested folder tree |
| `notes/link-service.ts` | NoteLinkService — bidirectional link management |
| `notes/template-service.ts` | TemplateService — template CRUD + builtin seeding |
| `notes/migration.ts` | Migrate existing .md notes to .json format |
| `db/schema.ts` | **Modify** — add folders, note_links, note_templates tables |
| `types.ts` | **Modify** — add Folder, NoteLink, NoteTemplate types; update Note |
| `library.ts` | **Modify** — instantiate new services |
| `graph/service.ts` | **Modify** — add note-to-note edges from note_links |
| `indexing/service.ts` | **Modify** — handle .json note files |

### New Files — App Frontend (`packages/app/src/renderer/`)

| File | Responsibility |
|------|---------------|
| `components/notes/BlockEditor.tsx` | BlockNote editor wrapper with custom blocks |
| `components/notes/BlockEditor.css` | Zettlr-inspired typography theme |
| `components/notes/blocks/AnnotationEmbed.tsx` | Custom block: annotation quote embed |
| `components/notes/blocks/DocumentEmbed.tsx` | Custom block: document card embed |
| `components/notes/blocks/NoteLinkInline.tsx` | Inline node: `[[` bidirectional link |
| `components/notes/FolderTree.tsx` | Folder tree sidebar with drag-drop |
| `components/notes/BacklinksPanel.tsx` | Right sidebar: backlinks + related docs |
| `components/notes/TemplatePicker.tsx` | Modal: select template when creating note |
| `components/notes/TemplateManager.tsx` | Settings page: manage templates |
| `components/notes/LinkSearchPopup.tsx` | `[[` search popup for note linking |
| `components/notes/NoteList.tsx` | **Rewrite** — folder-aware note list |
| `views/NoteView.tsx` | **Rewrite** — three-column layout with reading mode |
| `components/viewers/NotesPanel.tsx` | **Modify** — enhanced document notes panel |

### Modified Files — Electron Bridge

| File | Changes |
|------|---------|
| `main/ipc.ts` | Add handlers for folders, noteLinks, templates, notes:move |
| `preload/index.ts` | Add API methods for new IPC channels |
| `electron.d.ts` | Add type declarations for new APIs |

### Test Files

| File | Coverage |
|------|----------|
| `packages/core/test/notes.test.ts` | **Rewrite** — JSON format, folder support |
| `packages/core/test/folders.test.ts` | FolderService CRUD and nesting |
| `packages/core/test/note-links.test.ts` | Bidirectional link sync |
| `packages/core/test/note-templates.test.ts` | Template CRUD + builtins |
| `packages/core/test/note-migration.test.ts` | Markdown-to-JSON migration |

---

## Task 1: Database Schema & Types

**Files:**
- Modify: `packages/core/src/db/schema.ts:3-105`
- Modify: `packages/core/src/types.ts:134-156,242-258,285-321,382-406`

- [ ] **Step 1: Write test for new schema tables**

Create `packages/core/test/schema.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('Schema — new tables', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  it('creates folders table', () => {
    const info = (lib as any).db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='folders'").get()
    expect(info).toBeTruthy()
  })

  it('creates note_links table', () => {
    const info = (lib as any).db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='note_links'").get()
    expect(info).toBeTruthy()
  })

  it('creates note_templates table', () => {
    const info = (lib as any).db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='note_templates'").get()
    expect(info).toBeTruthy()
  })

  it('notes table has folder_id and content_format columns', () => {
    const columns = (lib as any).db.prepare("PRAGMA table_info(notes)").all() as Array<{ name: string }>
    const names = columns.map(c => c.name)
    expect(names).toContain('folder_id')
    expect(names).toContain('content_format')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/schema.test.ts`
Expected: FAIL — tables don't exist, columns missing

- [ ] **Step 3: Add new tables and columns to schema**

Edit `packages/core/src/db/schema.ts`. Replace the `SCHEMA_SQL` string (lines 3-105) with updated version adding these tables after the existing `note_tags` table (after line 60):

```sql
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS note_links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    context TEXT,
    PRIMARY KEY (source_id, target_id),
    FOREIGN KEY (source_id) REFERENCES notes(id),
    FOREIGN KEY (target_id) REFERENCES notes(id)
);

CREATE TABLE IF NOT EXISTS note_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    is_builtin INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

Also update the `notes` table definition (lines 29-36) to add two new columns:

```sql
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    doc_id TEXT,
    folder_id TEXT,
    content_format TEXT DEFAULT 'json',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES folders(id)
);
```

- [ ] **Step 4: Add new TypeScript types**

Edit `packages/core/src/types.ts`. Add after `NoteListOptions` (after line 156):

```typescript
export interface Folder {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  children?: Folder[]
}

export interface FolderCreateInput {
  name: string
  parentId?: string
}

export interface NoteLink {
  sourceId: string
  targetId: string
  context: string
}

export interface NoteTemplate {
  id: string
  name: string
  description: string
  content: string
  isBuiltin: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface NoteTemplateCreateInput {
  name: string
  description?: string
  content: string
}
```

Update the `Note` interface (lines 134-142) to:

```typescript
export interface Note {
  id: string
  title: string
  path: string
  docId: string | null
  folderId: string | null
  content: string
  contentFormat: 'json' | 'markdown'
  createdAt: string
  updatedAt: string
}
```

Update `NoteCreateInput` (lines 144-149) to:

```typescript
export interface NoteCreateInput {
  title: string
  docId?: string
  folderId?: string
  annotationIds?: string[]
  content?: string
  templateId?: string
}
```

Update `NoteListOptions` (lines 151-156) to:

```typescript
export interface NoteListOptions {
  docId?: string
  folderId?: string
  tag?: string
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
}
```

Update `NoteFileData` (lines 313-321) to:

```typescript
export interface NoteFileData {
  id: string
  title: string
  docId: string | null
  folderId: string | null
  annotationIds: string[]
  tags: string[]
  contentFormat: 'json' | 'markdown'
  createdAt: string
  updatedAt: string
}
```

Update `GraphEdge` type (line 252) to include `'note-note'`:

```typescript
export interface GraphEdge {
  source: string
  target: string
  type: 'note-doc' | 'note-note' | 'annotation-link' | 'mindmap-doc'
}
```

Add new events to `BanjuanEventMap` (after line 390):

```typescript
  'folder:created': { folder: Folder }
  'folder:updated': { folder: Folder }
  'folder:deleted': { id: string }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/src/types.ts packages/core/test/schema.test.ts
git commit -m "feat(core): add schema for folders, note_links, note_templates and extend notes table"
```

---

## Task 2: FolderService

**Files:**
- Create: `packages/core/src/notes/folder-service.ts`
- Create: `packages/core/test/folders.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/test/folders.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('FolderService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  it('creates a root folder', async () => {
    const folder = await lib.folders.create({ name: 'Research' })
    expect(folder.id).toBeTruthy()
    expect(folder.name).toBe('Research')
    expect(folder.parentId).toBeNull()
  })

  it('creates nested folders', async () => {
    const parent = await lib.folders.create({ name: 'Papers' })
    const child = await lib.folders.create({ name: 'NLP', parentId: parent.id })
    expect(child.parentId).toBe(parent.id)
  })

  it('lists folders as a tree', async () => {
    const parent = await lib.folders.create({ name: 'Root' })
    await lib.folders.create({ name: 'Child', parentId: parent.id })
    const tree = await lib.folders.getTree()
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('Root')
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children![0].name).toBe('Child')
  })

  it('updates folder name', async () => {
    const folder = await lib.folders.create({ name: 'Old' })
    const updated = await lib.folders.update(folder.id, { name: 'New' })
    expect(updated.name).toBe('New')
  })

  it('moves folder to new parent', async () => {
    const a = await lib.folders.create({ name: 'A' })
    const b = await lib.folders.create({ name: 'B' })
    const child = await lib.folders.create({ name: 'C', parentId: a.id })
    const moved = await lib.folders.update(child.id, { parentId: b.id })
    expect(moved.parentId).toBe(b.id)
  })

  it('deletes folder and unlinks notes', async () => {
    const folder = await lib.folders.create({ name: 'Temp' })
    const note = await lib.notes.create({ title: 'In Folder', folderId: folder.id })
    await lib.folders.delete(folder.id)
    const fetched = await lib.folders.get(folder.id)
    expect(fetched).toBeNull()
    const updatedNote = await lib.notes.get(note.id)
    expect(updatedNote!.folderId).toBeNull()
  })

  it('emits folder:created event', async () => {
    let emitted: unknown = null
    lib.events.on('folder:created', (data) => { emitted = data })
    await lib.folders.create({ name: 'Events' })
    expect(emitted).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/folders.test.ts`
Expected: FAIL — `lib.folders` does not exist

- [ ] **Step 3: Implement FolderService**

Create `packages/core/src/notes/folder-service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { Folder, FolderCreateInput } from '../types.js'
import type { EventBus } from '../events/bus.js'

export class FolderService {
  constructor(
    private db: Database.Database,
    private events: EventBus,
  ) {}

  async create(input: FolderCreateInput): Promise<Folder> {
    const id = uuid()
    const now = new Date().toISOString()
    this.db.prepare(
      'INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, input.name, input.parentId ?? null, 0, now, now)
    const folder: Folder = { id, name: input.name, parentId: input.parentId ?? null, sortOrder: 0, createdAt: now, updatedAt: now }
    this.events.emit('folder:created', { folder })
    return folder
  }

  async get(id: string): Promise<Folder | null> {
    const row = this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return this.rowToFolder(row)
  }

  async getTree(): Promise<Folder[]> {
    const rows = this.db.prepare('SELECT * FROM folders ORDER BY sort_order, name').all() as Array<Record<string, unknown>>
    const folders = rows.map(r => this.rowToFolder(r))
    const map = new Map<string, Folder>()
    for (const f of folders) {
      f.children = []
      map.set(f.id, f)
    }
    const roots: Folder[] = []
    for (const f of folders) {
      if (f.parentId && map.has(f.parentId)) {
        map.get(f.parentId)!.children!.push(f)
      } else {
        roots.push(f)
      }
    }
    return roots
  }

  async update(id: string, updates: { name?: string; parentId?: string; sortOrder?: number }): Promise<Folder> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name) }
    if (updates.parentId !== undefined) { sets.push('parent_id = ?'); params.push(updates.parentId) }
    if (updates.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(updates.sortOrder) }
    params.push(id)
    this.db.prepare(`UPDATE folders SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    const folder = (await this.get(id))!
    this.events.emit('folder:updated', { folder })
    return folder
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(id)
    this.db.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ?').run(id)
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
    this.events.emit('folder:deleted', { id })
  }

  private rowToFolder(row: Record<string, unknown>): Folder {
    return {
      id: row.id as string,
      name: row.name as string,
      parentId: row.parent_id as string | null,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }
}
```

- [ ] **Step 4: Register FolderService in Library**

Edit `packages/core/src/library.ts`. Add import at line 8:

```typescript
import { FolderService } from './notes/folder-service.js'
```

Add property after line 25 (`readonly notes: NoteService`):

```typescript
readonly folders: FolderService
```

Add instantiation after line 41 (`this.notes = ...`):

```typescript
this.folders = new FolderService(db, this.events)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run test/folders.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notes/folder-service.ts packages/core/test/folders.test.ts packages/core/src/library.ts
git commit -m "feat(core): add FolderService with nested folder tree support"
```

---

## Task 3: NoteLinkService

**Files:**
- Create: `packages/core/src/notes/link-service.ts`
- Create: `packages/core/test/note-links.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/test/note-links.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('NoteLinkService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  it('syncs links from note content', async () => {
    const noteA = await lib.notes.create({ title: 'Note A' })
    const noteB = await lib.notes.create({ title: 'Note B' })
    await lib.noteLinks.sync(noteA.id, [{ targetId: noteB.id, context: 'related to B' }])
    const links = await lib.noteLinks.getForwardLinks(noteA.id)
    expect(links).toHaveLength(1)
    expect(links[0].targetId).toBe(noteB.id)
  })

  it('returns backlinks', async () => {
    const noteA = await lib.notes.create({ title: 'Note A' })
    const noteB = await lib.notes.create({ title: 'Note B' })
    await lib.noteLinks.sync(noteA.id, [{ targetId: noteB.id, context: 'see B' }])
    const backlinks = await lib.noteLinks.getBacklinks(noteB.id)
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].sourceId).toBe(noteA.id)
    expect(backlinks[0].context).toBe('see B')
  })

  it('sync removes old links and adds new ones', async () => {
    const noteA = await lib.notes.create({ title: 'A' })
    const noteB = await lib.notes.create({ title: 'B' })
    const noteC = await lib.notes.create({ title: 'C' })
    await lib.noteLinks.sync(noteA.id, [{ targetId: noteB.id, context: 'ctx' }])
    await lib.noteLinks.sync(noteA.id, [{ targetId: noteC.id, context: 'new ctx' }])
    const links = await lib.noteLinks.getForwardLinks(noteA.id)
    expect(links).toHaveLength(1)
    expect(links[0].targetId).toBe(noteC.id)
  })

  it('removeAllForNote cleans up on note deletion', async () => {
    const noteA = await lib.notes.create({ title: 'A' })
    const noteB = await lib.notes.create({ title: 'B' })
    await lib.noteLinks.sync(noteA.id, [{ targetId: noteB.id, context: '' }])
    await lib.noteLinks.removeAllForNote(noteA.id)
    expect(await lib.noteLinks.getForwardLinks(noteA.id)).toHaveLength(0)
    expect(await lib.noteLinks.getBacklinks(noteA.id)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/note-links.test.ts`
Expected: FAIL — `lib.noteLinks` does not exist

- [ ] **Step 3: Implement NoteLinkService**

Create `packages/core/src/notes/link-service.ts`:

```typescript
import type Database from 'better-sqlite3'
import type { NoteLink } from '../types.js'

export interface LinkSyncEntry {
  targetId: string
  context: string
}

export class NoteLinkService {
  constructor(private db: Database.Database) {}

  async sync(sourceId: string, links: LinkSyncEntry[]): Promise<void> {
    this.db.prepare('DELETE FROM note_links WHERE source_id = ?').run(sourceId)
    const insert = this.db.prepare('INSERT INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)')
    for (const link of links) {
      insert.run(sourceId, link.targetId, link.context)
    }
  }

  async getForwardLinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.prepare('SELECT * FROM note_links WHERE source_id = ?').all(noteId) as Array<Record<string, unknown>>
    return rows.map(r => this.rowToLink(r))
  }

  async getBacklinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.prepare('SELECT * FROM note_links WHERE target_id = ?').all(noteId) as Array<Record<string, unknown>>
    return rows.map(r => this.rowToLink(r))
  }

  async removeAllForNote(noteId: string): Promise<void> {
    this.db.prepare('DELETE FROM note_links WHERE source_id = ? OR target_id = ?').run(noteId, noteId)
  }

  private rowToLink(row: Record<string, unknown>): NoteLink {
    return {
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      context: (row.context as string) ?? '',
    }
  }
}
```

- [ ] **Step 4: Register NoteLinkService in Library**

Edit `packages/core/src/library.ts`. Add import:

```typescript
import { NoteLinkService } from './notes/link-service.js'
```

Add property after `readonly folders: FolderService`:

```typescript
readonly noteLinks: NoteLinkService
```

Add instantiation after `this.folders = ...`:

```typescript
this.noteLinks = new NoteLinkService(db)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run test/note-links.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notes/link-service.ts packages/core/test/note-links.test.ts packages/core/src/library.ts
git commit -m "feat(core): add NoteLinkService for bidirectional link management"
```

---

## Task 4: TemplateService

**Files:**
- Create: `packages/core/src/notes/template-service.ts`
- Create: `packages/core/test/note-templates.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/test/note-templates.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'

describe('TemplateService', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  it('seeds builtin templates on first call', async () => {
    const templates = await lib.templates.list()
    expect(templates.length).toBeGreaterThanOrEqual(3)
    expect(templates.some(t => t.isBuiltin)).toBe(true)
  })

  it('creates a custom template', async () => {
    const tpl = await lib.templates.create({
      name: 'Custom',
      description: 'My template',
      content: JSON.stringify([{ type: 'paragraph', content: 'Hello' }]),
    })
    expect(tpl.id).toBeTruthy()
    expect(tpl.isBuiltin).toBe(false)
  })

  it('updates a custom template', async () => {
    const tpl = await lib.templates.create({ name: 'V1', content: '[]' })
    const updated = await lib.templates.update(tpl.id, { name: 'V2' })
    expect(updated.name).toBe('V2')
  })

  it('deletes a custom template', async () => {
    const tpl = await lib.templates.create({ name: 'Temp', content: '[]' })
    await lib.templates.delete(tpl.id)
    const fetched = await lib.templates.get(tpl.id)
    expect(fetched).toBeNull()
  })

  it('refuses to delete builtin templates', async () => {
    const templates = await lib.templates.list()
    const builtin = templates.find(t => t.isBuiltin)!
    await expect(lib.templates.delete(builtin.id)).rejects.toThrow()
  })

  it('gets a template by id', async () => {
    const tpl = await lib.templates.create({ name: 'Get Test', content: '{"blocks":[]}' })
    const fetched = await lib.templates.get(tpl.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.name).toBe('Get Test')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/note-templates.test.ts`
Expected: FAIL — `lib.templates` does not exist

- [ ] **Step 3: Implement TemplateService**

Create `packages/core/src/notes/template-service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { NoteTemplate, NoteTemplateCreateInput } from '../types.js'

const BUILTIN_TEMPLATES: Array<{ name: string; description: string; content: string }> = [
  {
    name: '文献笔记',
    description: '用于记录论文或书籍的阅读笔记',
    content: JSON.stringify([
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '来源信息' }] },
      { id: uuid(), type: 'paragraph', content: [{ type: 'text', text: '标题：' }] },
      { id: uuid(), type: 'paragraph', content: [{ type: 'text', text: '作者：' }] },
      { id: uuid(), type: 'paragraph', content: [{ type: 'text', text: '年份：' }] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '摘要' }] },
      { id: uuid(), type: 'paragraph', content: [] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '关键发现' }] },
      { id: uuid(), type: 'paragraph', content: [] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '我的思考' }] },
      { id: uuid(), type: 'paragraph', content: [] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '相关文献' }] },
      { id: uuid(), type: 'paragraph', content: [] },
    ]),
  },
  {
    name: 'Zettelkasten 卡片',
    description: '原子化知识卡片，一张卡片一个观点',
    content: JSON.stringify([
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '核心观点' }] },
      { id: uuid(), type: 'paragraph', content: [] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '支撑论据' }] },
      { id: uuid(), type: 'paragraph', content: [] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '相关链接' }] },
      { id: uuid(), type: 'paragraph', content: [] },
    ]),
  },
  {
    name: '读书/会议笔记',
    description: '记录读书或会议要点和行动项',
    content: JSON.stringify([
      { id: uuid(), type: 'paragraph', content: [{ type: 'text', text: '日期：' }] },
      { id: uuid(), type: 'paragraph', content: [{ type: 'text', text: '主题：' }] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '要点' }] },
      { id: uuid(), type: 'bulletListItem', content: [] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '行动项' }] },
      { id: uuid(), type: 'checkListItem', props: { checked: false }, content: [] },
      { id: uuid(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '参考资料' }] },
      { id: uuid(), type: 'paragraph', content: [] },
    ]),
  },
]

export class TemplateService {
  private seeded = false

  constructor(private db: Database.Database) {}

  private ensureBuiltins(): void {
    if (this.seeded) return
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM note_templates WHERE is_builtin = 1').get() as { c: number }).c
    if (count === 0) {
      const now = new Date().toISOString()
      const insert = this.db.prepare(
        'INSERT INTO note_templates (id, name, description, content, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)'
      )
      BUILTIN_TEMPLATES.forEach((tpl, i) => {
        insert.run(uuid(), tpl.name, tpl.description, tpl.content, i, now, now)
      })
    }
    this.seeded = true
  }

  async list(): Promise<NoteTemplate[]> {
    this.ensureBuiltins()
    const rows = this.db.prepare('SELECT * FROM note_templates ORDER BY is_builtin DESC, sort_order, name').all() as Array<Record<string, unknown>>
    return rows.map(r => this.rowToTemplate(r))
  }

  async get(id: string): Promise<NoteTemplate | null> {
    const row = this.db.prepare('SELECT * FROM note_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return this.rowToTemplate(row)
  }

  async create(input: NoteTemplateCreateInput): Promise<NoteTemplate> {
    const id = uuid()
    const now = new Date().toISOString()
    this.db.prepare(
      'INSERT INTO note_templates (id, name, description, content, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)'
    ).run(id, input.name, input.description ?? '', input.content, 0, now, now)
    return (await this.get(id))!
  }

  async update(id: string, updates: { name?: string; description?: string; content?: string; sortOrder?: number }): Promise<NoteTemplate> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name) }
    if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description) }
    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
    if (updates.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(updates.sortOrder) }
    params.push(id)
    this.db.prepare(`UPDATE note_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return (await this.get(id))!
  }

  async delete(id: string): Promise<void> {
    const row = this.db.prepare('SELECT is_builtin FROM note_templates WHERE id = ?').get(id) as { is_builtin: number } | undefined
    if (!row) return
    if (row.is_builtin) throw new Error('Cannot delete builtin template')
    this.db.prepare('DELETE FROM note_templates WHERE id = ?').run(id)
  }

  private rowToTemplate(row: Record<string, unknown>): NoteTemplate {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      content: row.content as string,
      isBuiltin: (row.is_builtin as number) === 1,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }
}
```

- [ ] **Step 4: Register TemplateService in Library**

Edit `packages/core/src/library.ts`. Add import:

```typescript
import { TemplateService } from './notes/template-service.js'
```

Add property after `readonly noteLinks: NoteLinkService`:

```typescript
readonly templates: TemplateService
```

Add instantiation after `this.noteLinks = ...`:

```typescript
this.templates = new TemplateService(db)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run test/note-templates.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notes/template-service.ts packages/core/test/note-templates.test.ts packages/core/src/library.ts
git commit -m "feat(core): add TemplateService with builtin templates"
```

---

## Task 5: Rewrite NoteService for JSON format

**Files:**
- Modify: `packages/core/src/notes/service.ts` (full rewrite)
- Rewrite: `packages/core/test/notes.test.ts`

- [ ] **Step 1: Write updated tests**

Rewrite `packages/core/test/notes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { createTempDir, cleanupTempDir, createTestFile } from './helpers.js'
import { Library } from '../src/library.js'

describe('NoteService (JSON format)', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  describe('create', () => {
    it('writes .json file with meta and blocks', async () => {
      const content = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }])
      const note = await lib.notes.create({ title: 'Test Note', content })
      expect(note.id).toBeTruthy()
      expect(note.contentFormat).toBe('json')
      expect(note.path).toBe(`${note.id}.json`)

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)

      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.id).toBe(note.id)
      expect(raw.meta.title).toBe('Test Note')
      expect(raw.blocks).toEqual(JSON.parse(content))
    })

    it('creates note with folderId', async () => {
      const folder = await lib.folders.create({ name: 'Papers' })
      const note = await lib.notes.create({ title: 'In Folder', folderId: folder.id })
      expect(note.folderId).toBe(folder.id)
    })

    it('creates note with docId', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      const note = await lib.notes.create({ title: 'Doc Note', docId: doc.id })
      expect(note.docId).toBe(doc.id)
    })

    it('creates note from template', async () => {
      const templates = await lib.templates.list()
      const tpl = templates[0]
      const note = await lib.notes.create({ title: 'From Template', templateId: tpl.id })
      expect(note.content).toBe(tpl.content)
    })

    it('handles annotation links', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'text', startOffset: 0, endOffset: 5, text: 'conte' },
        selectedText: 'conte',
      })
      const note = await lib.notes.create({ title: 'Ann Note', docId: doc.id, annotationIds: [ann.id] })
      const linked = await lib.notes.getAnnotations(note.id)
      expect(linked).toHaveLength(1)
      expect(linked[0].id).toBe(ann.id)
    })

    it('emits note:created event', async () => {
      let emitted: unknown = null
      lib.events.on('note:created', (data) => { emitted = data })
      await lib.notes.create({ title: 'Event Test' })
      expect(emitted).not.toBeNull()
    })
  })

  describe('get', () => {
    it('loads blocks content from .json file', async () => {
      const content = JSON.stringify([{ type: 'paragraph', content: [] }])
      const created = await lib.notes.create({ title: 'Get Test', content })
      const note = await lib.notes.get(created.id)
      expect(note).not.toBeNull()
      expect(note!.content).toBe(content)
    })
  })

  describe('list', () => {
    it('returns all notes', async () => {
      await lib.notes.create({ title: 'A' })
      await lib.notes.create({ title: 'B' })
      expect(await lib.notes.list()).toHaveLength(2)
    })

    it('filters by docId', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc.txt', 'content')
      const doc = await lib.documents.import('doc.txt')
      await lib.notes.create({ title: 'Linked', docId: doc.id })
      await lib.notes.create({ title: 'Standalone' })
      const notes = await lib.notes.list({ docId: doc.id })
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('Linked')
    })

    it('filters by folderId', async () => {
      const folder = await lib.folders.create({ name: 'F' })
      await lib.notes.create({ title: 'In F', folderId: folder.id })
      await lib.notes.create({ title: 'Root' })
      const notes = await lib.notes.list({ folderId: folder.id })
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('In F')
    })
  })

  describe('update', () => {
    it('updates title and content in .json file', async () => {
      const note = await lib.notes.create({ title: 'Old', content: '[]' })
      const newContent = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'updated' }] }])
      const updated = await lib.notes.update(note.id, { title: 'New', content: newContent })
      expect(updated.title).toBe('New')
      expect(updated.content).toBe(newContent)

      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(raw.meta.title).toBe('New')
      expect(raw.blocks).toEqual(JSON.parse(newContent))
    })
  })

  describe('move', () => {
    it('moves note to a folder', async () => {
      const folder = await lib.folders.create({ name: 'Target' })
      const note = await lib.notes.create({ title: 'Movable' })
      const moved = await lib.notes.move(note.id, folder.id)
      expect(moved.folderId).toBe(folder.id)
    })

    it('moves note to root (null folderId)', async () => {
      const folder = await lib.folders.create({ name: 'F' })
      const note = await lib.notes.create({ title: 'N', folderId: folder.id })
      const moved = await lib.notes.move(note.id, null)
      expect(moved.folderId).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes .json file, DB record, and note_links', async () => {
      const note = await lib.notes.create({ title: 'Del', content: '[]' })
      const filePath = join(lib.rootPath, '.banjuan', 'notes', note.path)
      expect(existsSync(filePath)).toBe(true)
      await lib.notes.delete(note.id)
      expect(await lib.notes.get(note.id)).toBeNull()
      expect(existsSync(filePath)).toBe(false)
    })
  })

  describe('getAnnotations', () => {
    it('returns linked annotations', async () => {
      createTestFile(join(tempDir, 'lib'), 'doc2.txt', 'content2')
      const doc = await lib.documents.import('doc2.txt')
      const ann = await lib.annotations.create({
        docId: doc.id, type: 'highlight',
        position: { type: 'text', startOffset: 0, endOffset: 5, text: 'conte' },
        selectedText: 'conte',
      })
      const note = await lib.notes.create({ title: 'With Ann', docId: doc.id, annotationIds: [ann.id] })
      const linked = await lib.notes.getAnnotations(note.id)
      expect(linked).toHaveLength(1)
      expect(linked[0].id).toBe(ann.id)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/notes.test.ts`
Expected: FAIL — current service doesn't support JSON format, folderId, etc.

- [ ] **Step 3: Rewrite NoteService**

Replace `packages/core/src/notes/service.ts` entirely:

```typescript
import type Database from 'better-sqlite3'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Note, NoteCreateInput, NoteListOptions, Annotation, NoteFileData } from '../types.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import type { TemplateService } from './template-service.js'
import type { NoteLinkService } from './link-service.js'

interface NoteJsonFile {
  meta: NoteFileData
  blocks: unknown[]
}

export class NoteService {
  private notesDir: string
  private templateService: TemplateService | null = null
  private linkService: NoteLinkService | null = null

  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
  ) {
    this.notesDir = join(rootPath, '.banjuan', 'notes')
  }

  setTemplateService(svc: TemplateService): void { this.templateService = svc }
  setLinkService(svc: NoteLinkService): void { this.linkService = svc }

  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    mkdirSync(this.notesDir, { recursive: true })

    let blocks: unknown[] = []
    if (input.templateId && this.templateService) {
      const tpl = await this.templateService.get(input.templateId)
      if (tpl) blocks = JSON.parse(tpl.content)
    }
    if (input.content) {
      try { blocks = JSON.parse(input.content) } catch { blocks = [] }
    }

    const filename = `${id}.json`
    const fullPath = join(this.notesDir, filename)

    const meta: NoteFileData = {
      id,
      title: input.title,
      docId: input.docId ?? null,
      folderId: input.folderId ?? null,
      annotationIds: input.annotationIds ?? [],
      tags: [],
      contentFormat: 'json',
      createdAt: now,
      updatedAt: now,
    }

    const fileData: NoteJsonFile = { meta, blocks }
    writeFileSync(fullPath, JSON.stringify(fileData, null, 2))

    this.db.prepare(
      'INSERT INTO notes (id, title, path, doc_id, folder_id, content_format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.title, filename, input.docId ?? null, input.folderId ?? null, 'json', now, now)

    const contentText = this.blocksToText(blocks)
    this.search.index({ id, title: input.title, content: contentText, type: 'note' })

    if (input.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of input.annotationIds) { insertLink.run(id, annId) }
    }

    const note: Note = {
      id, title: input.title, path: filename, docId: input.docId ?? null,
      folderId: input.folderId ?? null, content: JSON.stringify(blocks),
      contentFormat: 'json', createdAt: now, updatedAt: now,
    }
    this.events.emit('note:created', { note })
    return note
  }

  async list(options?: NoteListOptions): Promise<Note[]> {
    let sql = 'SELECT * FROM notes'
    const params: unknown[] = []
    const conditions: string[] = []
    if (options?.docId) { conditions.push('doc_id = ?'); params.push(options.docId) }
    if (options?.folderId) { conditions.push('folder_id = ?'); params.push(options.folderId) }
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
      if (note.contentFormat === 'json') {
        const parsed = JSON.parse(raw) as NoteJsonFile
        note.content = JSON.stringify(parsed.blocks)
      } else {
        const { parseFrontmatter } = await import('../storage/frontmatter.js')
        const { content } = parseFrontmatter(raw)
        note.content = content
      }
    }
    return note
  }

  async update(id: string, updates: { title?: string; content?: string }): Promise<Note> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    params.push(id)
    this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown>
    const filePath = join(this.notesDir, row.path as string)

    if (existsSync(filePath) && (row.content_format as string) === 'json') {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as NoteJsonFile
      if (updates.title !== undefined) raw.meta.title = updates.title
      raw.meta.updatedAt = now
      if (updates.content !== undefined) {
        try { raw.blocks = JSON.parse(updates.content) } catch { raw.blocks = [] }
      }
      writeFileSync(filePath, JSON.stringify(raw, null, 2))
    }

    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  async move(id: string, folderId: string | null): Promise<Note> {
    const now = new Date().toISOString()
    this.db.prepare('UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?').run(folderId, now, id)

    const filePath = join(this.notesDir, `${id}.json`)
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as NoteJsonFile
      raw.meta.folderId = folderId
      raw.meta.updatedAt = now
      writeFileSync(filePath, JSON.stringify(raw, null, 2))
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
    if (this.linkService) { await this.linkService.removeAllForNote(id) }
    this.db.prepare('DELETE FROM note_annotations WHERE note_id = ?').run(id)
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    this.events.emit('note:deleted', { id })
  }

  async getAnnotations(noteId: string): Promise<Annotation[]> {
    const rows = this.db
      .prepare('SELECT a.* FROM annotations a JOIN note_annotations na ON a.id = na.annotation_id WHERE na.note_id = ?')
      .all(noteId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: row.id as string, docId: row.doc_id as string,
      type: row.type as Annotation['type'], page: row.page as number | null,
      position: JSON.parse(row.position as string),
      content: row.content as string | null, selectedText: row.selected_text as string | null,
      color: row.color as string, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }))
  }

  private blocksToText(blocks: unknown[]): string {
    const texts: string[] = []
    const extract = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return
      if ('text' in (obj as Record<string, unknown>)) texts.push((obj as { text: string }).text)
      if ('content' in (obj as Record<string, unknown>)) {
        const content = (obj as { content: unknown }).content
        if (Array.isArray(content)) content.forEach(extract)
      }
      if ('children' in (obj as Record<string, unknown>)) {
        const children = (obj as { children: unknown }).children
        if (Array.isArray(children)) children.forEach(extract)
      }
    }
    blocks.forEach(extract)
    return texts.join(' ')
  }

  private rowToNote(row: Record<string, unknown>): Note {
    return {
      id: row.id as string,
      title: row.title as string,
      path: row.path as string,
      docId: row.doc_id as string | null,
      folderId: row.folder_id as string | null,
      content: '',
      contentFormat: (row.content_format as 'json' | 'markdown') ?? 'json',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }
}
```

- [ ] **Step 4: Update Library to wire services together**

Edit `packages/core/src/library.ts`. After all service instantiation, add wiring:

```typescript
this.notes.setTemplateService(this.templates)
this.notes.setLinkService(this.noteLinks)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run test/notes.test.ts`
Expected: PASS

- [ ] **Step 6: Run all core tests to check for regressions**

Run: `cd packages/core && npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/notes/service.ts packages/core/test/notes.test.ts packages/core/src/library.ts
git commit -m "feat(core): rewrite NoteService for JSON block format with folder and template support"
```

---

## Task 6: Note Migration (Markdown to JSON)

**Files:**
- Create: `packages/core/src/notes/migration.ts`
- Create: `packages/core/test/note-migration.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/test/note-migration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createTempDir, cleanupTempDir } from './helpers.js'
import { Library } from '../src/library.js'
import { serializeFrontmatter } from '../src/storage/frontmatter.js'
import { migrateNotesToJson } from '../src/notes/migration.js'

describe('Note Migration', () => {
  let tempDir: string
  let lib: Library

  beforeEach(() => {
    tempDir = createTempDir()
    lib = Library.init(join(tempDir, 'lib'))
  })

  afterEach(() => { lib.close(); cleanupTempDir(tempDir) })

  it('migrates .md files to .json format', async () => {
    const notesDir = join(lib.rootPath, '.banjuan', 'notes')
    const mdContent = serializeFrontmatter(
      { id: 'test-id', title: 'Old Note', docId: null, annotationIds: [], tags: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      '# Hello\n\nWorld'
    )
    writeFileSync(join(notesDir, 'Old Note.md'), mdContent)

    const result = await migrateNotesToJson(notesDir)
    expect(result.migrated).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(existsSync(join(notesDir, 'test-id.json'))).toBe(true)
    expect(existsSync(join(notesDir, 'backup', 'Old Note.md'))).toBe(true)
  })

  it('skips already-migrated notes', async () => {
    const notesDir = join(lib.rootPath, '.banjuan', 'notes')
    writeFileSync(join(notesDir, 'abc.json'), '{"meta":{},"blocks":[]}')

    const result = await migrateNotesToJson(notesDir)
    expect(result.migrated).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/note-migration.test.ts`
Expected: FAIL — function doesn't exist

- [ ] **Step 3: Implement migration**

Create `packages/core/src/notes/migration.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { NoteFileData } from '../types.js'

interface MigrationResult {
  migrated: number
  errors: string[]
}

function markdownToBlocks(markdown: string): unknown[] {
  const blocks: unknown[] = []
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      blocks.push({ type: 'heading', props: { level: 3 }, content: [{ type: 'text', text: line.slice(4) }] })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: line.slice(3) }] })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: line.slice(2) }] })
    } else if (line.startsWith('- ')) {
      blocks.push({ type: 'bulletListItem', content: [{ type: 'text', text: line.slice(2) }] })
    } else if (/^\d+\. /.test(line)) {
      blocks.push({ type: 'numberedListItem', content: [{ type: 'text', text: line.replace(/^\d+\. /, '') }] })
    } else if (line.startsWith('> ')) {
      blocks.push({ type: 'paragraph', content: [{ type: 'text', text: line.slice(2), styles: { italic: true } }] })
    } else if (line.startsWith('---')) {
      // skip horizontal rules
    } else if (line.trim() !== '') {
      blocks.push({ type: 'paragraph', content: [{ type: 'text', text: line }] })
    }

    i++
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'paragraph', content: [] })
  }

  return blocks
}

export async function migrateNotesToJson(notesDir: string): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, errors: [] }

  if (!existsSync(notesDir)) return result

  const files = readdirSync(notesDir, { withFileTypes: true })
  const mdFiles = files.filter(f => f.isFile() && f.name.endsWith('.md'))

  if (mdFiles.length === 0) return result

  const backupDir = join(notesDir, 'backup')
  mkdirSync(backupDir, { recursive: true })

  for (const file of mdFiles) {
    try {
      const filePath = join(notesDir, file.name)
      const raw = readFileSync(filePath, 'utf-8')
      const { data, content } = parseFrontmatter<NoteFileData>(raw)

      if (!data.id) {
        result.errors.push(`${file.name}: missing id in frontmatter`)
        continue
      }

      const blocks = markdownToBlocks(content)
      const jsonData = {
        meta: {
          id: data.id,
          title: data.title ?? file.name.replace('.md', ''),
          docId: data.docId ?? null,
          folderId: (data as any).folderId ?? null,
          annotationIds: data.annotationIds ?? [],
          tags: data.tags ?? [],
          contentFormat: 'json' as const,
          createdAt: data.createdAt ?? new Date().toISOString(),
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        },
        blocks,
      }

      const jsonPath = join(notesDir, `${data.id}.json`)
      writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2))
      renameSync(filePath, join(backupDir, file.name))
      result.migrated++
    } catch (err) {
      result.errors.push(`${file.name}: ${(err as Error).message}`)
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run test/note-migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/notes/migration.ts packages/core/test/note-migration.test.ts
git commit -m "feat(core): add markdown-to-JSON note migration"
```

---

## Task 7: Update GraphService and IndexService

**Files:**
- Modify: `packages/core/src/graph/service.ts:18-25`
- Modify: `packages/core/src/indexing/service.ts:96-136`

- [ ] **Step 1: Update GraphService to include note-to-note edges**

Edit `packages/core/src/graph/service.ts`. After the notes loop (after line 25), add:

```typescript
    const noteLinks = this.db.prepare('SELECT source_id, target_id FROM note_links').all() as Array<{ source_id: string; target_id: string }>
    for (const link of noteLinks) {
      if (nodeIds.has(link.source_id) && nodeIds.has(link.target_id)) {
        edges.push({ source: link.source_id, target: link.target_id, type: 'note-note' })
      }
    }
```

- [ ] **Step 2: Update IndexService to handle .json note files**

Edit `packages/core/src/indexing/service.ts`. Update `indexAllNotes` method (lines 96-103):

```typescript
  private indexAllNotes(): void {
    if (!existsSync(this.notesDir)) return
    const files = readdirSync(this.notesDir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile()) continue
      if (file.name.endsWith('.json')) {
        this.indexNoteJsonFile(file.name)
      } else if (file.name.endsWith('.md')) {
        this.indexNoteFile(file.name)
      }
    }
  }
```

Add new method after `indexNoteFile`:

```typescript
  private indexNoteJsonFile(filename: string): void {
    const filePath = join(this.notesDir, filename)
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as { meta: NoteFileData; blocks: unknown[] }
    const meta = raw.meta

    if (!meta.id) return

    this.db.prepare(
      'INSERT OR REPLACE INTO notes (id, title, path, doc_id, folder_id, content_format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(meta.id, meta.title ?? filename, filename, meta.docId ?? null, meta.folderId ?? null, 'json', meta.createdAt ?? new Date().toISOString(), meta.updatedAt ?? new Date().toISOString())

    const contentText = this.blocksToText(raw.blocks)
    this.db.prepare(
      'INSERT INTO search_index (rowid, title, content, type) VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)'
    ).run(meta.title ?? filename, contentText, `note:${meta.id}`)

    if (meta.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT OR IGNORE INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of meta.annotationIds) { insertLink.run(meta.id, annId) }
    }

    if (meta.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)')
      for (const tagName of meta.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(meta.id, tag.id)
      }
    }
  }

  private blocksToText(blocks: unknown[]): string {
    const texts: string[] = []
    const extract = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return
      if ('text' in (obj as Record<string, unknown>)) texts.push((obj as { text: string }).text)
      if ('content' in (obj as Record<string, unknown>)) {
        const c = (obj as { content: unknown }).content
        if (Array.isArray(c)) c.forEach(extract)
      }
      if ('children' in (obj as Record<string, unknown>)) {
        const ch = (obj as { children: unknown }).children
        if (Array.isArray(ch)) ch.forEach(extract)
      }
    }
    blocks.forEach(extract)
    return texts.join(' ')
  }
```

- [ ] **Step 3: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/graph/service.ts packages/core/src/indexing/service.ts
git commit -m "feat(core): update GraphService and IndexService for JSON notes and note-links"
```

---

## Task 8: IPC Handlers & Electron Bridge

**Files:**
- Modify: `packages/app/src/main/ipc.ts:137-165`
- Modify: `packages/app/src/preload/index.ts:42-52`
- Modify: `packages/app/electron.d.ts:37-44`

- [ ] **Step 1: Add IPC handlers for folders, noteLinks, templates, and notes:move**

Edit `packages/app/src/main/ipc.ts`. Update existing notes handlers (lines 137-165) and add new handlers after them:

Replace `notes:create` handler (lines 137-141) with:

```typescript
  ipcMain.handle('notes:create', async (event, input: {
    title: string; docId?: string; folderId?: string; annotationIds?: string[]; content?: string; templateId?: string
  }) => {
    return getLib(event).notes.create(input)
  })
```

Replace `notes:update` handler (lines 153-157) with:

```typescript
  ipcMain.handle('notes:update', async (event, id: string, updates: {
    title?: string; content?: string
  }) => {
    return getLib(event).notes.update(id, updates)
  })
```

Add new handlers after `notes:getAnnotations` (after line 165):

```typescript
  ipcMain.handle('notes:move', async (event, id: string, folderId: string | null) => {
    return getLib(event).notes.move(id, folderId)
  })

  // Folders
  ipcMain.handle('folders:create', async (event, input: { name: string; parentId?: string }) => {
    return getLib(event).folders.create(input)
  })

  ipcMain.handle('folders:getTree', async (event) => {
    return getLib(event).folders.getTree()
  })

  ipcMain.handle('folders:update', async (event, id: string, updates: {
    name?: string; parentId?: string; sortOrder?: number
  }) => {
    return getLib(event).folders.update(id, updates)
  })

  ipcMain.handle('folders:delete', async (event, id: string) => {
    return getLib(event).folders.delete(id)
  })

  // Note Links
  ipcMain.handle('noteLinks:getBacklinks', async (event, noteId: string) => {
    return getLib(event).noteLinks.getBacklinks(noteId)
  })

  ipcMain.handle('noteLinks:sync', async (event, noteId: string, links: Array<{ targetId: string; context: string }>) => {
    return getLib(event).noteLinks.sync(noteId, links)
  })

  // Templates
  ipcMain.handle('templates:list', async (event) => {
    return getLib(event).templates.list()
  })

  ipcMain.handle('templates:get', async (event, id: string) => {
    return getLib(event).templates.get(id)
  })

  ipcMain.handle('templates:create', async (event, input: { name: string; description?: string; content: string }) => {
    return getLib(event).templates.create(input)
  })

  ipcMain.handle('templates:update', async (event, id: string, updates: {
    name?: string; description?: string; content?: string; sortOrder?: number
  }) => {
    return getLib(event).templates.update(id, updates)
  })

  ipcMain.handle('templates:delete', async (event, id: string) => {
    return getLib(event).templates.delete(id)
  })
```

- [ ] **Step 2: Update preload API**

Edit `packages/app/src/preload/index.ts`. Replace `notes` section (lines 42-52) with:

```typescript
  notes: {
    create: (input: { title: string; docId?: string; folderId?: string; annotationIds?: string[]; content?: string; templateId?: string }) =>
      ipcRenderer.invoke('notes:create', input),
    list: (options?: { docId?: string; folderId?: string; tag?: string; sort?: string; order?: string }) =>
      ipcRenderer.invoke('notes:list', options),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    update: (id: string, updates: { title?: string; content?: string }) =>
      ipcRenderer.invoke('notes:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    getAnnotations: (noteId: string) => ipcRenderer.invoke('notes:getAnnotations', noteId),
    move: (id: string, folderId: string | null) => ipcRenderer.invoke('notes:move', id, folderId),
  },
  folders: {
    create: (input: { name: string; parentId?: string }) => ipcRenderer.invoke('folders:create', input),
    getTree: () => ipcRenderer.invoke('folders:getTree'),
    update: (id: string, updates: { name?: string; parentId?: string; sortOrder?: number }) =>
      ipcRenderer.invoke('folders:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('folders:delete', id),
  },
  noteLinks: {
    getBacklinks: (noteId: string) => ipcRenderer.invoke('noteLinks:getBacklinks', noteId),
    sync: (noteId: string, links: Array<{ targetId: string; context: string }>) =>
      ipcRenderer.invoke('noteLinks:sync', noteId, links),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    get: (id: string) => ipcRenderer.invoke('templates:get', id),
    create: (input: { name: string; description?: string; content: string }) =>
      ipcRenderer.invoke('templates:create', input),
    update: (id: string, updates: { name?: string; description?: string; content?: string; sortOrder?: number }) =>
      ipcRenderer.invoke('templates:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('templates:delete', id),
  },
```

- [ ] **Step 3: Update electron.d.ts**

Edit `packages/app/electron.d.ts`. Replace the `notes` section (lines 37-44) and add new sections:

```typescript
  notes: {
    create: (input: { title: string; docId?: string; folderId?: string; annotationIds?: string[]; content?: string; templateId?: string }) => Promise<any>
    list: (options?: { docId?: string; folderId?: string; tag?: string; sort?: string; order?: string }) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: { title?: string; content?: string }) => Promise<any>
    delete: (id: string) => Promise<void>
    getAnnotations: (noteId: string) => Promise<any[]>
    move: (id: string, folderId: string | null) => Promise<any>
  }
  folders: {
    create: (input: { name: string; parentId?: string }) => Promise<any>
    getTree: () => Promise<any[]>
    update: (id: string, updates: { name?: string; parentId?: string; sortOrder?: number }) => Promise<any>
    delete: (id: string) => Promise<void>
  }
  noteLinks: {
    getBacklinks: (noteId: string) => Promise<any[]>
    sync: (noteId: string, links: Array<{ targetId: string; context: string }>) => Promise<void>
  }
  templates: {
    list: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (input: { name: string; description?: string; content: string }) => Promise<any>
    update: (id: string, updates: { name?: string; description?: string; content?: string; sortOrder?: number }) => Promise<any>
    delete: (id: string) => Promise<void>
  }
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/main/ipc.ts packages/app/src/preload/index.ts packages/app/electron.d.ts
git commit -m "feat(app): add IPC handlers for folders, noteLinks, templates, and notes:move"
```

---

## Task 9: Install BlockNote & Create Typography Theme

**Files:**
- Modify: `packages/app/package.json`
- Create: `packages/app/src/renderer/components/notes/BlockEditor.css`

- [ ] **Step 1: Install BlockNote dependencies**

Run:

```bash
cd packages/app && pnpm add @blocknote/core @blocknote/react @blocknote/mantine @mantine/core
```

- [ ] **Step 2: Remove Milkdown dependencies**

Run:

```bash
cd packages/app && pnpm remove @milkdown/kit @milkdown/plugin-listener @milkdown/theme-nord
```

- [ ] **Step 3: Create Zettlr-inspired typography CSS**

Create `packages/app/src/renderer/components/notes/BlockEditor.css`:

```css
.bn-editor {
  font-family: 'Inter', 'PingFang SC', 'Noto Sans SC', -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.75;
  color: #2e3440;
  max-width: 720px;
  margin: 0 auto;
  padding: 32px;
}

.bn-editor [data-content-type="heading"][data-level="1"] {
  font-size: 28px;
  line-height: 1.3;
  font-weight: 700;
  margin-top: 32px;
  margin-bottom: 12px;
}

.bn-editor [data-content-type="heading"][data-level="2"] {
  font-size: 22px;
  line-height: 1.35;
  font-weight: 600;
  margin-top: 28px;
  margin-bottom: 10px;
}

.bn-editor [data-content-type="heading"][data-level="3"] {
  font-size: 18px;
  line-height: 1.4;
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 8px;
}

.bn-editor [data-content-type="paragraph"] {
  margin-bottom: 12px;
}

.bn-editor [data-content-type="bulletListItem"],
.bn-editor [data-content-type="numberedListItem"] {
  margin-bottom: 4px;
}

.bn-editor [data-content-type="checkListItem"] {
  margin-bottom: 4px;
}

.bn-editor [data-content-type="checkListItem"][data-checked="true"] {
  text-decoration: line-through;
  opacity: 0.6;
}

.bn-editor code {
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  font-size: 13px;
  background: #f0f2f5;
  color: #bf616a;
  padding: 2px 6px;
  border-radius: 4px;
}

.bn-editor [data-content-type="codeBlock"] {
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: #f0f2f5;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

.bn-editor blockquote,
.bn-editor [data-content-type="paragraph"][data-is-quote="true"] {
  border-left: 3px solid #d8dee9;
  background: #f8f9fb;
  padding: 8px 12px;
  border-radius: 0 4px 4px 0;
  margin: 12px 0;
}

.bn-editor hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 24px 0;
}

.bn-editor a,
.bn-editor .note-link {
  color: #5e81ac;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 150ms;
}

.bn-editor a:hover,
.bn-editor .note-link:hover {
  border-bottom-color: #5e81ac;
}

/* Annotation embed block */
.annotation-embed {
  border-left: 3px solid #ebcb8b;
  background: #fffdf5;
  border-radius: 0 8px 8px 0;
  padding: 12px 16px;
  margin: 12px 0;
}

.annotation-embed .embed-source {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.annotation-embed .embed-quote {
  font-style: italic;
  border-left: 2px solid #d8dee9;
  padding-left: 12px;
  margin-bottom: 8px;
}

.annotation-embed .embed-jump {
  font-size: 12px;
  color: #5e81ac;
  cursor: pointer;
  text-align: right;
}

/* Document embed block */
.document-embed {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
  cursor: pointer;
  transition: box-shadow 200ms;
}

.document-embed:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.document-embed .embed-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.document-embed .embed-meta {
  font-size: 13px;
  color: #6b7280;
}

/* Reading mode */
.bn-editor.reading-mode {
  max-width: 680px;
}

.bn-editor.reading-mode [data-drag-handle],
.bn-editor.reading-mode .bn-side-menu,
.bn-editor.reading-mode .bn-formatting-toolbar {
  display: none !important;
}

/* Link preview popup */
.link-preview-popup {
  position: fixed;
  z-index: 1000;
  width: 320px;
  max-height: 240px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 16px;
  overflow: hidden;
  animation: fadeIn 150ms ease;
}

.link-preview-popup .preview-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
}

.link-preview-popup .preview-content {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .bn-editor {
    color: #d8dee9;
  }

  .bn-editor code {
    background: #3b4252;
    color: #bf616a;
  }

  .bn-editor [data-content-type="codeBlock"] {
    background: #3b4252;
    border-color: #4c566a;
  }

  .bn-editor blockquote,
  .bn-editor [data-content-type="paragraph"][data-is-quote="true"] {
    border-left-color: #4c566a;
    background: #353b48;
  }

  .bn-editor a,
  .bn-editor .note-link {
    color: #88c0d0;
  }

  .annotation-embed {
    background: #3a3730;
  }

  .document-embed {
    border-color: #4c566a;
  }

  .document-embed:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .link-preview-popup {
    background: #3b4252;
    border-color: #4c566a;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .link-preview-popup,
  .document-embed,
  .bn-editor a,
  .bn-editor .note-link {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/package.json packages/app/src/renderer/components/notes/BlockEditor.css pnpm-lock.yaml
git commit -m "feat(app): install BlockNote, remove Milkdown, add Zettlr typography theme"
```

---

## Task 10: BlockNote Editor Component

**Files:**
- Create: `packages/app/src/renderer/components/notes/BlockEditor.tsx`
- Delete: `packages/app/src/renderer/components/notes/NoteEditor.tsx` (replaced)

- [ ] **Step 1: Create BlockEditor component**

Create `packages/app/src/renderer/components/notes/BlockEditor.tsx`:

```tsx
import React, { useMemo, useCallback } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'
import '@blocknote/mantine/style.css'
import './BlockEditor.css'

interface Props {
  initialContent: string
  onChange: (json: string) => void
  readOnly?: boolean
}

export default function BlockEditor({ initialContent, onChange, readOnly }: Props) {
  const parsedContent = useMemo(() => {
    if (!initialContent) return undefined
    try {
      const blocks = JSON.parse(initialContent)
      return Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined
    } catch {
      return undefined
    }
  }, [initialContent])

  const editor = useCreateBlockNote({
    initialContent: parsedContent,
  })

  const handleChange = useCallback(() => {
    const blocks = editor.document
    onChange(JSON.stringify(blocks))
  }, [editor, onChange])

  return (
    <div className={readOnly ? 'reading-mode' : ''}>
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme="light"
      />
    </div>
  )
}
```

- [ ] **Step 2: Delete old NoteEditor**

Run:

```bash
rm packages/app/src/renderer/components/notes/NoteEditor.tsx
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/notes/BlockEditor.tsx
git rm packages/app/src/renderer/components/notes/NoteEditor.tsx
git commit -m "feat(app): create BlockEditor component, replace Milkdown NoteEditor"
```

---

## Task 11: Custom Blocks — AnnotationEmbed & DocumentEmbed

**Files:**
- Create: `packages/app/src/renderer/components/notes/blocks/AnnotationEmbed.tsx`
- Create: `packages/app/src/renderer/components/notes/blocks/DocumentEmbed.tsx`

- [ ] **Step 1: Create AnnotationEmbed block**

Create `packages/app/src/renderer/components/notes/blocks/AnnotationEmbed.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

export const AnnotationEmbed = createReactBlockSpec(
  {
    type: 'annotationEmbed',
    propSchema: {
      docId: { default: '' },
      annotationId: { default: '' },
      quote: { default: '' },
      comment: { default: '' },
      docTitle: { default: '' },
      page: { default: 0 },
    },
    content: 'none',
  },
  {
    render: (props) => {
      const { docId, annotationId, quote, comment, docTitle, page } = props.block.props

      const handleJump = async () => {
        // Navigate to document at annotation position — implemented when wired into TabManager
      }

      return (
        <div className="annotation-embed" contentEditable={false}>
          <div className="embed-source">
            📄 {docTitle || 'Document'} {page ? `p.${page}` : ''}
          </div>
          {quote && (
            <div className="embed-quote">"{quote}"</div>
          )}
          {comment && (
            <div style={{ marginBottom: 8 }}>{comment}</div>
          )}
          <div className="embed-jump" onClick={handleJump}>
            跳转到原文 →
          </div>
        </div>
      )
    },
  }
)
```

- [ ] **Step 2: Create DocumentEmbed block**

Create `packages/app/src/renderer/components/notes/blocks/DocumentEmbed.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

export const DocumentEmbed = createReactBlockSpec(
  {
    type: 'documentEmbed',
    propSchema: {
      docId: { default: '' },
      docTitle: { default: '' },
      authors: { default: '' },
      pageCount: { default: 0 },
    },
    content: 'none',
  },
  {
    render: (props) => {
      const { docId, docTitle, authors, pageCount } = props.block.props

      const handleOpen = () => {
        // Open document in new tab — implemented when wired into TabManager
      }

      return (
        <div className="document-embed" onClick={handleOpen} contentEditable={false}>
          <div className="embed-title">📄 {docTitle || 'Untitled Document'}</div>
          <div className="embed-meta">
            {authors && <span>{authors}</span>}
            {pageCount > 0 && <span> · {pageCount} 页</span>}
            <span style={{ marginLeft: 'auto', color: '#5e81ac' }}> 打开文档 →</span>
          </div>
        </div>
      )
    },
  }
)
```

- [ ] **Step 3: Register custom blocks in BlockEditor**

Edit `packages/app/src/renderer/components/notes/BlockEditor.tsx`. Update to include custom blocks:

Replace the imports and editor creation with:

```tsx
import React, { useMemo, useCallback } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { AnnotationEmbed } from './blocks/AnnotationEmbed.js'
import { DocumentEmbed } from './blocks/DocumentEmbed.js'
import '@blocknote/mantine/style.css'
import './BlockEditor.css'

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
  },
})

interface Props {
  initialContent: string
  onChange: (json: string) => void
  readOnly?: boolean
}

export default function BlockEditor({ initialContent, onChange, readOnly }: Props) {
  const parsedContent = useMemo(() => {
    if (!initialContent) return undefined
    try {
      const blocks = JSON.parse(initialContent)
      return Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined
    } catch {
      return undefined
    }
  }, [initialContent])

  const editor = useCreateBlockNote({
    schema,
    initialContent: parsedContent,
  })

  const handleChange = useCallback(() => {
    const blocks = editor.document
    onChange(JSON.stringify(blocks))
  }, [editor, onChange])

  return (
    <div className={readOnly ? 'reading-mode' : ''}>
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme="light"
      />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/components/notes/blocks/AnnotationEmbed.tsx packages/app/src/renderer/components/notes/blocks/DocumentEmbed.tsx packages/app/src/renderer/components/notes/BlockEditor.tsx
git commit -m "feat(app): add AnnotationEmbed and DocumentEmbed custom blocks"
```

---

## Task 12: Bidirectional Link — LinkSearchPopup & Inline Node

**Files:**
- Create: `packages/app/src/renderer/components/notes/LinkSearchPopup.tsx`

- [ ] **Step 1: Create LinkSearchPopup**

Create `packages/app/src/renderer/components/notes/LinkSearchPopup.tsx`:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'

interface NoteResult {
  id: string
  title: string
}

interface Props {
  query: string
  position: { top: number; left: number }
  onSelect: (note: NoteResult) => void
  onCreate: (title: string) => void
  onClose: () => void
}

export default function LinkSearchPopup({ query, position, onSelect, onCreate, onClose }: Props) {
  const [results, setResults] = useState<NoteResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const search = async () => {
      const notes = await window.electronAPI.notes.list()
      const filtered = notes.filter((n: NoteResult) =>
        n.title.toLowerCase().includes(query.toLowerCase())
      )
      setResults(filtered.slice(0, 10))
      setSelectedIndex(0)
    }
    search()
  }, [query])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex < results.length) {
          onSelect(results[selectedIndex])
        } else {
          onCreate(query)
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [results, selectedIndex, query, onSelect, onCreate, onClose])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 300,
        maxHeight: 320,
        overflow: 'auto',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 1000,
        fontSize: 13,
      }}
    >
      {results.map((note, i) => (
        <div
          key={note.id}
          onClick={() => onSelect(note)}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            background: i === selectedIndex ? '#e8f0fe' : 'transparent',
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          📄 {note.title}
        </div>
      ))}
      <div
        onClick={() => onCreate(query)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          borderTop: results.length > 0 ? '1px solid #e5e7eb' : 'none',
          background: selectedIndex === results.length ? '#e8f0fe' : 'transparent',
          color: '#5e81ac',
        }}
        onMouseEnter={() => setSelectedIndex(results.length)}
      >
        + 创建新笔记: "{query}"
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/notes/LinkSearchPopup.tsx
git commit -m "feat(app): add LinkSearchPopup for bidirectional note linking"
```

---

## Task 13: FolderTree Component

**Files:**
- Create: `packages/app/src/renderer/components/notes/FolderTree.tsx`

- [ ] **Step 1: Create FolderTree component**

Create `packages/app/src/renderer/components/notes/FolderTree.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import { useT } from '../../i18n/index.js'

interface Folder {
  id: string
  name: string
  parentId: string | null
  children?: Folder[]
}

interface NoteInfo {
  id: string
  title: string
  folderId: string | null
}

interface Props {
  onSelectFolder: (folderId: string | null) => void
  onOpenNote: (note: NoteInfo) => void
  selectedFolderId: string | null
}

function FolderItem({ folder, depth, selectedId, onSelect, onRename, onDelete }: {
  folder: Folder
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState(false)
  const hasChildren = folder.children && folder.children.length > 0

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu(true)
  }

  return (
    <div>
      <div
        onClick={() => onSelect(folder.id)}
        onContextMenu={handleContextMenu}
        style={{
          padding: '4px 8px',
          paddingLeft: 8 + depth * 16,
          cursor: 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: selectedId === folder.id ? 'var(--hover)' : 'transparent',
          borderRadius: 4,
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          style={{ width: 16, textAlign: 'center', opacity: hasChildren ? 1 : 0 }}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <span>📁</span>
        <span style={{ flex: 1 }}>{folder.name}</span>
      </div>
      {contextMenu && (
        <div style={{
          position: 'absolute', background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 100, fontSize: 12,
        }}>
          <div style={{ padding: '6px 12px', cursor: 'pointer' }}
            onClick={() => { const name = prompt('Rename:', folder.name); if (name) onRename(folder.id, name); setContextMenu(false) }}>
            重命名
          </div>
          <div style={{ padding: '6px 12px', cursor: 'pointer', color: '#f38ba8' }}
            onClick={() => { onDelete(folder.id); setContextMenu(false) }}>
            删除
          </div>
        </div>
      )}
      {expanded && folder.children?.map(child => (
        <FolderItem key={child.id} folder={child} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
      ))}
    </div>
  )
}

export default function FolderTree({ onSelectFolder, onOpenNote, selectedFolderId }: Props) {
  const t = useT()
  const [folders, setFolders] = useState<Folder[]>([])
  const [filter, setFilter] = useState<'all' | 'recent' | 'folder'>('all')
  const [notes, setNotes] = useState<NoteInfo[]>([])

  const loadFolders = useCallback(async () => {
    const tree = await window.electronAPI.folders.getTree()
    setFolders(tree)
  }, [])

  const loadNotes = useCallback(async () => {
    const opts: Record<string, unknown> = {}
    if (filter === 'folder' && selectedFolderId) {
      opts.folderId = selectedFolderId
    }
    if (filter === 'recent') {
      opts.sort = 'updated_at'
      opts.order = 'desc'
    }
    const list = await window.electronAPI.notes.list(opts as any)
    setNotes(list)
  }, [filter, selectedFolderId])

  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreateFolder = async () => {
    const name = prompt(t('prompt.folderName') || 'Folder name:')
    if (!name) return
    await window.electronAPI.folders.create({ name, parentId: selectedFolderId ?? undefined })
    await loadFolders()
  }

  const handleRenameFolder = async (id: string, name: string) => {
    await window.electronAPI.folders.update(id, { name })
    await loadFolders()
  }

  const handleDeleteFolder = async (id: string) => {
    await window.electronAPI.folders.delete(id)
    await loadFolders()
    await loadNotes()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 8px 4px', flexShrink: 0 }}>
        <button onClick={() => { setFilter('all'); onSelectFolder(null) }}
          style={{ fontSize: 11, fontWeight: filter === 'all' ? 600 : 400 }}>
          {t('library.allNotes') || '全部'}
        </button>
        <button onClick={() => setFilter('recent')}
          style={{ fontSize: 11, fontWeight: filter === 'recent' ? 600 : 400 }}>
          {t('library.recentNotes') || '最近'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {folders.map(folder => (
          <FolderItem key={folder.id} folder={folder} depth={0}
            selectedId={selectedFolderId}
            onSelect={(id) => { setFilter('folder'); onSelectFolder(id) }}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder} />
        ))}

        <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {notes.map(note => (
            <div key={note.id} onClick={() => onOpenNote(note)}
              style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              📄 {note.title}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={handleCreateFolder} style={{ fontSize: 11, flex: 1 }}>+ 文件夹</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/notes/FolderTree.tsx
git commit -m "feat(app): add FolderTree component with nested folders and note list"
```

---

## Task 14: BacklinksPanel Component

**Files:**
- Create: `packages/app/src/renderer/components/notes/BacklinksPanel.tsx`

- [ ] **Step 1: Create BacklinksPanel**

Create `packages/app/src/renderer/components/notes/BacklinksPanel.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import { useT } from '../../i18n/index.js'

interface Backlink {
  sourceId: string
  targetId: string
  context: string
}

interface NoteInfo {
  id: string
  title: string
}

interface Props {
  noteId: string
  docId: string | null
  onOpenNote: (note: NoteInfo) => void
}

export default function BacklinksPanel({ noteId, docId, onOpenNote }: Props) {
  const t = useT()
  const [backlinks, setBacklinks] = useState<Array<Backlink & { sourceTitle: string }>>([])
  const [linkedDoc, setLinkedDoc] = useState<{ id: string; title: string } | null>(null)
  const [annotations, setAnnotations] = useState<Array<{ id: string; content: string | null; selectedText: string | null }>>([])

  useEffect(() => {
    const load = async () => {
      const links = await window.electronAPI.noteLinks.getBacklinks(noteId)
      const enriched = await Promise.all(
        links.map(async (link: Backlink) => {
          const note = await window.electronAPI.notes.get(link.sourceId)
          return { ...link, sourceTitle: note?.title ?? 'Untitled' }
        })
      )
      setBacklinks(enriched)

      if (docId) {
        const doc = await window.electronAPI.documents.get(docId)
        if (doc) setLinkedDoc({ id: doc.id, title: doc.title })
      }

      const anns = await window.electronAPI.notes.getAnnotations(noteId)
      setAnnotations(anns)
    }
    load()
  }, [noteId, docId])

  return (
    <div style={{ padding: 12, fontSize: 13, overflow: 'auto', height: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
          反向引用 ({backlinks.length})
        </h4>
        {backlinks.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>暂无引用</div>
        )}
        {backlinks.map((link, i) => (
          <div key={i}
            onClick={() => onOpenNote({ id: link.sourceId, title: link.sourceTitle })}
            style={{
              padding: '8px 10px', marginBottom: 4, borderRadius: 6,
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontWeight: 500 }}>{link.sourceTitle}</div>
            {link.context && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                "{link.context}"
              </div>
            )}
          </div>
        ))}
      </div>

      {linkedDoc && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            关联文档
          </h4>
          <div style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
            📄 {linkedDoc.title}
          </div>
        </div>
      )}

      {annotations.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            关联标注 ({annotations.length})
          </h4>
          {annotations.map(ann => (
            <div key={ann.id}
              style={{ padding: '6px 10px', marginBottom: 4, borderRadius: 4, fontSize: 12, borderLeft: '3px solid #ebcb8b' }}>
              {ann.selectedText || ann.content || '(empty)'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/notes/BacklinksPanel.tsx
git commit -m "feat(app): add BacklinksPanel with backlinks, linked docs, and annotations"
```

---

## Task 15: TemplatePicker & TemplateManager

**Files:**
- Create: `packages/app/src/renderer/components/notes/TemplatePicker.tsx`
- Create: `packages/app/src/renderer/components/notes/TemplateManager.tsx`

- [ ] **Step 1: Create TemplatePicker**

Create `packages/app/src/renderer/components/notes/TemplatePicker.tsx`:

```tsx
import React, { useState, useEffect } from 'react'

interface Template {
  id: string
  name: string
  description: string
  isBuiltin: boolean
}

interface Props {
  onSelect: (templateId: string | null) => void
  onClose: () => void
}

export default function TemplatePicker({ onSelect, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])

  useEffect(() => {
    window.electronAPI.templates.list().then(setTemplates)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 24, width: 400, maxHeight: 480,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>选择模板</h3>

        <div
          onClick={() => onSelect(null)}
          style={{
            padding: '12px 16px', marginBottom: 8, borderRadius: 8,
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div style={{ fontWeight: 500 }}>空白笔记</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>从空白开始</div>
        </div>

        {templates.map(tpl => (
          <div key={tpl.id}
            onClick={() => onSelect(tpl.id)}
            style={{
              padding: '12px 16px', marginBottom: 8, borderRadius: 8,
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontWeight: 500 }}>
              {tpl.name}
              {tpl.isBuiltin && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 8 }}>内置</span>}
            </div>
            {tpl.description && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{tpl.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create TemplateManager**

Create `packages/app/src/renderer/components/notes/TemplateManager.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import BlockEditor from './BlockEditor.js'

interface Template {
  id: string
  name: string
  description: string
  content: string
  isBuiltin: boolean
}

interface Props {
  onClose: () => void
}

export default function TemplateManager({ onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)

  const load = useCallback(async () => {
    const list = await window.electronAPI.templates.list()
    setTemplates(list)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const name = prompt('模板名称:')
    if (!name) return
    const tpl = await window.electronAPI.templates.create({ name, content: '[]' })
    await load()
    setEditing(tpl)
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.templates.delete(id)
    if (editing?.id === id) setEditing(null)
    await load()
  }

  const handleSaveContent = async (content: string) => {
    if (!editing) return
    await window.electronAPI.templates.update(editing.id, { content })
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 240, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>模板管理</h3>
          <button onClick={onClose} style={{ fontSize: 12 }}>关闭</button>
        </div>
        {templates.map(tpl => (
          <div key={tpl.id}
            onClick={() => setEditing(tpl)}
            style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 13,
              background: editing?.id === tpl.id ? 'var(--hover)' : 'transparent',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
            <span>{tpl.name} {tpl.isBuiltin && '(内置)'}</span>
            {!tpl.isBuiltin && (
              <button onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id) }}
                style={{ fontSize: 10, color: '#f38ba8' }}>删除</button>
            )}
          </div>
        ))}
        <div style={{ padding: 8 }}>
          <button onClick={handleCreate} style={{ width: '100%', fontSize: 12 }}>+ 新建模板</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {editing ? (
          <BlockEditor
            key={editing.id}
            initialContent={editing.content}
            onChange={handleSaveContent}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            选择一个模板进行编辑
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/notes/TemplatePicker.tsx packages/app/src/renderer/components/notes/TemplateManager.tsx
git commit -m "feat(app): add TemplatePicker modal and TemplateManager settings page"
```

---

## Task 16: Rewrite NoteView — Three-Column Layout with Reading Mode

**Files:**
- Rewrite: `packages/app/src/renderer/views/NoteView.tsx`

- [ ] **Step 1: Rewrite NoteView**

Replace `packages/app/src/renderer/views/NoteView.tsx` entirely:

```tsx
import React, { useEffect, useState, useCallback, useRef } from 'react'
import BlockEditor from '../components/notes/BlockEditor.js'
import FolderTree from '../components/notes/FolderTree.js'
import BacklinksPanel from '../components/notes/BacklinksPanel.js'
import TemplatePicker from '../components/notes/TemplatePicker.js'
import { useT } from '../i18n/index.js'

interface NoteInfo {
  id: string
  title: string
  docId?: string | null
  folderId?: string | null
}

interface Props {
  note: NoteInfo
  onBack: () => void
  onOpenNote: (note: NoteInfo) => void
}

export default function NoteView({ note, onBack, onOpenNote }: Props) {
  const t = useT()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState<string | null>(null)
  const [docId, setDocId] = useState<string | null>(note.docId ?? null)
  const [saving, setSaving] = useState(false)
  const [readingMode, setReadingMode] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(note.folderId ?? null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electronAPI.notes.get(note.id).then((full: any) => {
      if (full) {
        setContent(full.content)
        setDocId(full.docId)
      }
    })
  }, [note.id])

  const saveContent = useCallback((json: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await window.electronAPI.notes.update(note.id, { content: json })
      setSaving(false)
    }, 800)
  }, [note.id])

  const saveTitle = useCallback(async () => {
    if (title !== note.title) {
      await window.electronAPI.notes.update(note.id, { title })
    }
  }, [note.id, title, note.title])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        setReadingMode(r => !r)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const handleCreateNote = async () => {
    setShowTemplatePicker(true)
  }

  const handleTemplateSelect = async (templateId: string | null) => {
    setShowTemplatePicker(false)
    const titleInput = prompt(t('prompt.noteTitle') || 'Note title:')
    if (!titleInput) return
    const newNote = await window.electronAPI.notes.create({
      title: titleInput,
      folderId: selectedFolderId ?? undefined,
      templateId: templateId ?? undefined,
    })
    onOpenNote(newNote)
  }

  if (content === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      {t('common.loading')}
    </div>
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left Sidebar — Folder Tree */}
      {leftSidebarOpen && (
        <div style={{ width: 240, borderRight: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
          <FolderTree
            onSelectFolder={setSelectedFolderId}
            onOpenNote={onOpenNote}
            selectedFolderId={selectedFolderId}
          />
        </div>
      )}

      {/* Center — Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <button onClick={() => setLeftSidebarOpen(v => !v)} style={{ fontSize: 12 }}>☰</button>
          <button onClick={onBack} style={{ fontSize: 12 }}>{t('common.back')}</button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            style={{
              flex: 1, fontWeight: 600, fontSize: 16,
              background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none',
            }}
            readOnly={readingMode}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {saving ? t('note.saving') : t('note.saved')}
          </span>
          <button onClick={() => setReadingMode(r => !r)}
            style={{ fontSize: 12, fontWeight: readingMode ? 600 : 400 }}>
            {readingMode ? '编辑' : '阅读'}
          </button>
          <button onClick={() => setRightSidebarOpen(v => !v)} style={{ fontSize: 12 }}>≡</button>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <BlockEditor
            key={note.id}
            initialContent={content}
            onChange={saveContent}
            readOnly={readingMode}
          />
        </div>
      </div>

      {/* Right Sidebar — Backlinks */}
      {rightSidebarOpen && (
        <div style={{ width: 260, borderLeft: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
          <BacklinksPanel noteId={note.id} docId={docId} onOpenNote={onOpenNote} />
        </div>
      )}

      {showTemplatePicker && (
        <TemplatePicker
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update TabManager to pass onOpenNote to NoteView**

Edit `packages/app/src/renderer/components/TabManager.tsx`. Update the NoteView rendering (lines 94-99) to:

```tsx
            {tab.type === 'note' && tabData.get(tab.id) && (
              <NoteView
                note={tabData.get(tab.id)}
                onBack={() => closeTab(tab.id)}
                onOpenNote={openNote}
              />
            )}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/views/NoteView.tsx packages/app/src/renderer/components/TabManager.tsx
git commit -m "feat(app): rewrite NoteView with three-column layout and reading mode"
```

---

## Task 17: Rewrite NoteList for Folder-Aware Navigation

**Files:**
- Rewrite: `packages/app/src/renderer/components/notes/NoteList.tsx`

- [ ] **Step 1: Rewrite NoteList**

Replace `packages/app/src/renderer/components/notes/NoteList.tsx` entirely:

```tsx
import React, { useEffect, useState, useCallback } from 'react'
import { useI18n } from '../../i18n/index.js'
import TemplatePicker from './TemplatePicker.js'

interface Note {
  id: string
  title: string
  docId: string | null
  folderId: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  onOpenNote: (note: Note) => void
}

export default function NoteList({ onOpenNote }: Props) {
  const { t, locale } = useI18n()
  const [notes, setNotes] = useState<Note[]>([])
  const [showPicker, setShowPicker] = useState(false)

  const loadNotes = useCallback(async () => {
    const list = await window.electronAPI.notes.list({ sort: 'updated_at', order: 'desc' })
    setNotes(list)
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreate = async (templateId: string | null) => {
    setShowPicker(false)
    const title = prompt(t('prompt.noteTitle'))
    if (!title) return
    const note = await window.electronAPI.notes.create({
      title,
      templateId: templateId ?? undefined,
    })
    await loadNotes()
    onOpenNote(note)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await window.electronAPI.notes.delete(id)
    await loadNotes()
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
      }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>{t('library.notes')}</h3>
        <button onClick={() => setShowPicker(true)} style={{ fontSize: 12 }}>{t('common.new')}</button>
      </div>
      {notes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('library.emptyNotes')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              onClick={() => onOpenNote(note)}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                background: 'var(--surface)', border: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{note.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatDate(note.updatedAt || note.createdAt)}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                style={{ fontSize: 11, color: '#f38ba8', borderColor: '#f38ba8' }}
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}
      {showPicker && (
        <TemplatePicker onSelect={handleCreate} onClose={() => setShowPicker(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/notes/NoteList.tsx
git commit -m "feat(app): rewrite NoteList with template picker integration"
```

---

## Task 18: Enhanced NotesPanel for Document Viewer

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/NotesPanel.tsx`

- [ ] **Step 1: Enhance NotesPanel**

Replace `packages/app/src/renderer/components/viewers/NotesPanel.tsx` entirely:

```tsx
import React, { useEffect, useState, useCallback } from 'react'
import { useT } from '../../i18n/index.js'
import TemplatePicker from '../notes/TemplatePicker.js'

interface NoteInfo {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface Props {
  docId: string
  onOpenNote: (note: NoteInfo) => void
  onCreateNote: () => void
}

export default function NotesPanel({ docId, onOpenNote, onCreateNote }: Props) {
  const t = useT()
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)

  const loadNotes = useCallback(async () => {
    const result = await window.electronAPI.notes.list({ docId })
    setNotes(result as NoteInfo[])
    setLoading(false)
  }, [docId])

  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreateFromTemplate = async (templateId: string | null) => {
    setShowPicker(false)
    const title = prompt(t('prompt.noteTitle') || 'Note title:')
    if (!title) return
    const note = await window.electronAPI.notes.create({
      title,
      docId,
      templateId: templateId ?? undefined,
    })
    await loadNotes()
    onOpenNote(note)
  }

  if (loading) return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {notes.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>{t('pdf.noNotes')}</div>
        )}
        {notes.map(note => (
          <div
            key={note.id}
            onClick={() => onOpenNote(note)}
            style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontWeight: 500 }}>{note.title}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={() => setShowPicker(true)}
          style={{
            width: '100%', padding: '6px 0', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)',
          }}
        >
          {t('pdf.newNote')}
        </button>
      </div>
      {showPicker && (
        <TemplatePicker onSelect={handleCreateFromTemplate} onClose={() => setShowPicker(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/NotesPanel.tsx
git commit -m "feat(app): enhance NotesPanel with template picker for document notes"
```

---

## Task 19: Integration — Run Migration on Library Open

**Files:**
- Modify: `packages/app/src/main/ipc.ts:32-40`
- Modify: `packages/core/src/library.ts`

- [ ] **Step 1: Add migration to Library open flow**

Edit `packages/core/src/library.ts`. Add import at the top:

```typescript
import { migrateNotesToJson } from './notes/migration.js'
```

Add a static method after `open`:

```typescript
  static async migrateNotes(rootPath: string): Promise<{ migrated: number; errors: string[] }> {
    const notesDir = join(rootPath, '.banjuan', 'notes')
    return migrateNotesToJson(notesDir)
  }
```

- [ ] **Step 2: Call migration in IPC library:open handler**

Edit `packages/app/src/main/ipc.ts`. In the `library:open` handler (lines 32-40), add migration call before index rebuild:

```typescript
  ipcMain.handle('library:open', async (event, path: string) => {
    const lib = Library.open(path)
    libraries.set(event.sender.id, lib)
    await Library.migrateNotes(path)
    const syncResult = await lib.syncWithDisk()
    await lib.plugins.loadAll()
    const indexService = lib.createIndexService()
    await indexService.rebuildFull()
    return { rootPath: lib.rootPath, name: lib.name, imported: syncResult.imported, removed: syncResult.removed }
  })
```

- [ ] **Step 3: Run all tests**

Run: `cd packages/core && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/library.ts packages/app/src/main/ipc.ts
git commit -m "feat: run note migration on library open"
```

---

## Task 20: Export core types & Build Verification

**Files:**
- Modify: `packages/core/src/index.ts` (if exists, or wherever exports are)

- [ ] **Step 1: Ensure new services are exported from core package**

Check `packages/core/src/index.ts` and add exports for new services:

```typescript
export { FolderService } from './notes/folder-service.js'
export { NoteLinkService } from './notes/link-service.js'
export { TemplateService } from './notes/template-service.js'
export { migrateNotesToJson } from './notes/migration.js'
```

Also export new types from `types.ts` (they should already be exported if using `export interface`).

- [ ] **Step 2: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Build the app to verify no compilation errors**

Run: `cd packages/app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Start dev server and test**

Run: `cd packages/app && pnpm dev`

Verify in browser:
1. Open/create a library
2. Create a new note with template picker
3. Edit with BlockNote editor (slash commands, drag blocks)
4. Toggle reading mode (Cmd+E)
5. Create a folder and move a note into it
6. Backlinks panel displays on the right
7. Create a note from document viewer

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export new note services from package"
```
