# Unified Note Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify mindmaps and notes into a single `notes` table with a `type` field, eliminating the parallel mindmaps CRUD system while preserving mindmap node/edge operations.

**Architecture:** The `notes` table gains `type` ('markdown' | 'mindmap') and `type_meta` columns. NoteService handles all CRUD for both types. MindmapService retains only node/edge operations. Mindmap files move from `.banjuan/mindmaps/` → `.banjuan/notes/` as `{id}.json` with `{meta, nodes, edges}` format. Since `Library.open()` deletes and recreates db.sqlite from files every time, no DB migration script is needed — only `initSchema()` and the file-scanning logic need updates.

**Tech Stack:** TypeScript, better-sqlite3, Electron IPC, React

**Key Insight:** The DB is ephemeral (rebuilt from JSON files on every `Library.open()`). The source of truth is the filesystem. This means:
- Schema changes go into `initSchema()` in `schema.ts`
- File format changes happen via a one-time file migration in `Library.open()`
- No DB migration scripts needed

---

## File Structure

### Phase 1: Core Data Layer

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/core/src/types.ts` | Add `NoteType`, extend `Note`/`NoteCreateInput`/`NoteListOptions`, simplify `TagTarget` |
| Modify | `packages/core/src/db/schema.ts` | Add `type` + `type_meta` columns to notes table, drop mindmaps table |
| Modify | `packages/core/src/notes/service.ts` | Support `type`/`typeMeta` in CRUD, handle mindmap file format, scan mindmap files in `syncDisk()` |
| Modify | `packages/core/src/mindmaps/service.ts` | Remove CRUD/directory methods, keep only node/edge ops, change `mindmapsDir` → `notesDir` |
| Modify | `packages/core/src/library.ts` | Wire `mindmaps` service with `notesDir`, add file migration, remove `data/mindmaps` dir creation |
| Modify | `packages/core/src/graph/service.ts` | Query unified `notes` table instead of separate `mindmaps` table |
| Modify | `packages/core/src/tags/service.ts` | Remove mindmap-specific tag handling, use `note_tags` for all note types |
| Modify | `packages/core/src/index.ts` | No changes needed (exports stay the same) |

### Phase 2: IPC Layer

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/app/src/main/ipc.ts` | Route mindmap CRUD IPCs to `notes` service, update `notes:create`/`notes:list` signatures |
| Modify | `packages/app/src/preload/index.ts` | Update `notes` API signatures, add type/typeMeta params |
| Modify | `packages/app/electron.d.ts` | Update type definitions for new note API shapes |

### Phase 3: Frontend

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/app/src/renderer/components/TabManager.tsx` | Merge `openMindmap` into `openNote`, route by `noteType` |
| Modify | `packages/app/src/renderer/views/LibraryView.tsx` | Remove parallel mindmap state, unify into notes list |
| Modify | `packages/app/src/renderer/views/MindmapView.tsx` | Accept `note` object instead of `mindmap` |
| Modify | `packages/app/src/renderer/components/notes/BacklinksPanel.tsx` | Simplify — no separate `findNodesByNoteId` query needed |

---

## Phase 1: Core Data Layer

### Task 1: Update Type Definitions

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add NoteType and extend Note interface**

In `packages/core/src/types.ts`, add `NoteType` before the `Note` interface (around line 134):

```typescript
export type NoteType = 'markdown' | 'mindmap'
```

Update the `Note` interface to include `type` and `typeMeta`:

```typescript
export interface Note {
  id: string
  title: string
  type: NoteType
  path: string
  docId: string | null
  folderId: string | null
  content: string
  contentFormat: 'json' | 'markdown'
  typeMeta: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Extend NoteCreateInput and NoteListOptions**

Update `NoteCreateInput`:

```typescript
export interface NoteCreateInput {
  title: string
  type?: NoteType
  docId?: string
  folderId?: string
  folder?: string
  annotationIds?: string[]
  content?: string
  templateId?: string
  layout?: string
  theme?: string
}
```

Update `NoteListOptions`:

```typescript
export interface NoteListOptions {
  type?: NoteType
  docId?: string
  folderId?: string
  tag?: string
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
}
```

- [ ] **Step 3: Update NoteFileData to include type fields**

```typescript
export interface NoteFileData {
  id: string
  title: string
  type: NoteType
  docId: string | null
  folderId: string | null
  annotationIds: string[]
  tags: string[]
  contentFormat: 'json' | 'markdown'
  typeMeta: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 4: Simplify TagTarget and GraphNode types**

Change `TagTarget` to remove 'mindmap' (mindmaps are now notes):

```typescript
export type TagTarget = 'document' | 'note'
```

Update `GraphNode`:

```typescript
export interface GraphNode {
  id: string
  label: string
  type: 'document' | 'note'
  noteType?: NoteType
  docType?: DocumentType
}
```

Update `GraphEdge` — remove 'mindmap-doc', it's now 'note-doc':

```typescript
export interface GraphEdge {
  source: string
  target: string
  type: 'note-doc' | 'note-note' | 'annotation-link'
}
```

- [ ] **Step 5: Verify types compile**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit -p packages/core/tsconfig.json 2>&1 | head -30`

Expected: Type errors in files that reference `Mindmap`/`MindmapCreateInput` or old `Note` shape — this is expected and will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add NoteType and extend Note interface for unified note model"
```

---

### Task 2: Update DB Schema

**Files:**
- Modify: `packages/core/src/db/schema.ts`

- [ ] **Step 1: Add type and type_meta columns to notes table**

In `packages/core/src/db/schema.ts`, update the `notes` CREATE TABLE in the `SCHEMA_SQL` string (lines 29-39):

```sql
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'markdown',
    path TEXT NOT NULL,
    doc_id TEXT,
    folder_id TEXT,
    content_format TEXT DEFAULT 'json',
    type_meta TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES folders(id)
);
```

- [ ] **Step 2: Remove mindmaps CREATE TABLE and mindmap_tags table**

Remove from `SCHEMA_SQL`:

```sql
CREATE TABLE IF NOT EXISTS mindmap_tags (
    mindmap_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (mindmap_id, tag_id)
);
```

And remove:

```sql
CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '',
    doc_id TEXT,
    layout TEXT DEFAULT 'mindmap',
    theme TEXT DEFAULT 'classic',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

- [ ] **Step 3: Update mindmap_nodes foreign key reference**

Change the `mindmap_nodes` CREATE TABLE to reference `notes`:

```sql
CREATE TABLE IF NOT EXISTS mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    parent_id TEXT,
    node_type TEXT DEFAULT 'text',
    annotation_id TEXT,
    note_id TEXT,
    doc_id TEXT,
    hyperlink TEXT,
    image_url TEXT,
    tag_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT,
    notes TEXT,
    shape TEXT,
    style_overrides TEXT,
    position_x REAL,
    position_y REAL,
    sort_order INTEGER DEFAULT 0,
    collapsed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (mindmap_id) REFERENCES notes(id)
);
```

Similarly for `mindmap_edges`:

```sql
CREATE TABLE IF NOT EXISTS mindmap_edges (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT,
    style TEXT,
    FOREIGN KEY (mindmap_id) REFERENCES notes(id)
);
```

- [ ] **Step 4: Remove mindmap migration code from initSchema**

Remove the migration code that adds columns to `mindmaps` table (lines 173-181):

```typescript
// Remove this block:
  // Migrate mindmaps: add theme column if missing
  const mmColumns = db.pragma('table_info(mindmaps)') as Array<{ name: string }>
  const mmColNames = new Set(mmColumns.map(c => c.name))
  if (!mmColNames.has('theme')) {
    db.exec("ALTER TABLE mindmaps ADD COLUMN theme TEXT DEFAULT 'classic'")
  }
  if (!mmColNames.has('path')) {
    db.exec("ALTER TABLE mindmaps ADD COLUMN path TEXT NOT NULL DEFAULT ''")
  }
```

Keep the `mindmap_nodes` migration code (adding new columns) as it's still relevant.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/schema.ts
git commit -m "feat(core): update DB schema for unified note model - notes table gains type/type_meta"
```

---

### Task 3: Extend NoteService for Mindmap Type

**Files:**
- Modify: `packages/core/src/notes/service.ts`

- [ ] **Step 1: Update NoteJsonFile type and add MindmapNoteJsonFile**

At the top of `packages/core/src/notes/service.ts`, update the interface and add a new one:

```typescript
interface NoteJsonFile {
  meta: NoteFileData
  blocks: unknown[]
}

interface MindmapNoteJsonFile {
  meta: NoteFileData
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}
```

Update the import to include `NoteType`:

```typescript
import type { Note, NoteCreateInput, NoteListOptions, Annotation, NoteFileData, NoteType } from '../types.js'
```

- [ ] **Step 2: Update create() to support type parameter**

Replace the `create` method with type-aware version:

```typescript
  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    const noteType: NoteType = input.type ?? 'markdown'

    const folder = input.folder ?? ''
    const targetDir = folder ? join(this.notesDir, folder) : this.notesDir
    mkdirSync(targetDir, { recursive: true })

    const filename = `${id}.json`
    const relPath = folder ? `${folder}/${filename}` : filename
    const fullPath = join(this.notesDir, relPath)

    const typeMeta: Record<string, unknown> | null = noteType === 'mindmap'
      ? { layout: input.layout ?? 'mindmap', theme: input.theme ?? 'classic' }
      : null

    const meta: NoteFileData = {
      id, title: input.title, type: noteType, docId: input.docId ?? null,
      folderId: null, annotationIds: input.annotationIds ?? [],
      tags: [], contentFormat: 'json', typeMeta, createdAt: now, updatedAt: now,
    }

    if (noteType === 'mindmap') {
      const fileData: MindmapNoteJsonFile = { meta, nodes: [], edges: [] }
      writeFileSync(fullPath, JSON.stringify(fileData, null, 2))
    } else {
      let blocks: unknown[] = []
      if (input.templateId && this.templateService) {
        const tpl = await this.templateService.get(input.templateId)
        if (tpl) blocks = JSON.parse(tpl.content)
      }
      if (input.content) {
        try { blocks = JSON.parse(input.content) } catch { blocks = [] }
      }
      writeFileSync(fullPath, JSON.stringify({ meta, blocks } as NoteJsonFile, null, 2))
    }

    this.db.prepare(
      'INSERT INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.title, noteType, relPath, input.docId ?? null, null, 'json', typeMeta ? JSON.stringify(typeMeta) : null, now, now)

    if (noteType === 'markdown') {
      this.search.index({ id, title: input.title, content: '', type: 'note' })
    }

    if (input.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of input.annotationIds) { insertLink.run(id, annId) }
    }

    const note: Note = {
      id, title: input.title, type: noteType, path: relPath, docId: input.docId ?? null,
      folderId: null, content: noteType === 'mindmap' ? JSON.stringify({ nodes: [], edges: [] }) : '[]',
      contentFormat: 'json', typeMeta, createdAt: now, updatedAt: now,
    }
    this.events.emit('note:created', { note })
    return note
  }
```

- [ ] **Step 3: Update list() to support type filter**

Replace the `list` method:

```typescript
  async list(options?: NoteListOptions): Promise<Note[]> {
    let sql = 'SELECT * FROM notes'
    const params: unknown[] = []
    const conditions: string[] = []
    if (options?.type) { conditions.push('type = ?'); params.push(options.type) }
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
    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(r => this.rowToNote(r))
  }
```

- [ ] **Step 4: Update get() to handle mindmap content format**

Replace the `get` method:

```typescript
  async get(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const note = this.rowToNote(row)
    const filePath = join(this.notesDir, note.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      if (note.type === 'mindmap') {
        const parsed = JSON.parse(raw) as MindmapNoteJsonFile
        note.content = JSON.stringify({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] })
      } else if (note.contentFormat === 'json') {
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
```

- [ ] **Step 5: Update update() to handle typeMeta**

Add `typeMeta` support to the `update` method signature and body:

```typescript
  async update(id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }): Promise<Note> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    if (updates.typeMeta !== undefined) { sets.push('type_meta = ?'); params.push(JSON.stringify(updates.typeMeta)) }
    params.push(id)
    this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown>
    const filePath = join(this.notesDir, row.path as string)
    const noteType = row.type as NoteType

    if (existsSync(filePath)) {
      if (noteType === 'mindmap') {
        const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as MindmapNoteJsonFile
        if (updates.title !== undefined) raw.meta.title = updates.title
        if (updates.typeMeta !== undefined) raw.meta.typeMeta = updates.typeMeta
        raw.meta.updatedAt = now
        writeFileSync(filePath, JSON.stringify(raw, null, 2))
      } else if ((row.content_format as string) === 'json') {
        const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as NoteJsonFile
        if (updates.title !== undefined) raw.meta.title = updates.title
        raw.meta.updatedAt = now
        if (updates.content !== undefined) {
          try { raw.blocks = JSON.parse(updates.content) } catch { raw.blocks = [] }
        }
        writeFileSync(filePath, JSON.stringify(raw, null, 2))
      }
    }

    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }
```

- [ ] **Step 6: Update rowToNote() to include type and typeMeta**

```typescript
  private rowToNote(row: Record<string, unknown>): Note {
    let typeMeta: Record<string, unknown> | null = null
    if (row.type_meta) {
      try { typeMeta = JSON.parse(row.type_meta as string) } catch { /* ignore */ }
    }
    return {
      id: row.id as string, title: row.title as string,
      type: (row.type as NoteType) ?? 'markdown',
      path: row.path as string,
      docId: row.doc_id as string | null, folderId: row.folder_id as string | null,
      content: '', contentFormat: (row.content_format as 'json' | 'markdown') ?? 'json',
      typeMeta,
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }
  }
```

- [ ] **Step 7: Update syncDisk() to scan mindmap files too**

The existing `syncDisk()` scans `.banjuan/notes/` for `*.json` files. After migration, mindmap files will also live there. Update the INSERT in `syncDisk()` to include `type` and `type_meta`:

```typescript
  async syncDisk(): Promise<void> {
    if (!existsSync(this.notesDir)) return
    const knownPaths = new Set(
      (this.db.prepare('SELECT path FROM notes').all() as Array<{ path: string }>).map(r => r.path)
    )
    const scan = (dir: string, prefix: string) => {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scan(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
        } else if (entry.name.endsWith('.json')) {
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
          if (!knownPaths.has(relPath)) {
            try {
              const raw = JSON.parse(readFileSync(join(dir, entry.name), 'utf-8'))
              const m = raw.meta as NoteFileData
              const noteType = m.type ?? 'markdown'
              const typeMeta = m.typeMeta ? JSON.stringify(m.typeMeta) : null
              this.db.prepare(
                'INSERT OR IGNORE INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).run(m.id, m.title, noteType, relPath, m.docId ?? null, null, m.contentFormat ?? 'json', typeMeta, m.createdAt, m.updatedAt)

              if (noteType === 'mindmap' && raw.nodes) {
                this.importMindmapNodesFromFile(m.id, raw.nodes, raw.edges ?? [])
              }
            } catch { /* skip malformed files */ }
          }
        }
      }
    }
    scan(this.notesDir, '')
  }
```

- [ ] **Step 8: Add helper method to import mindmap nodes/edges from file data**

Add this private method to `NoteService`:

```typescript
  importMindmapNodesFromFile(noteId: string, nodes: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>>): void {
    const insertNode = this.db.prepare(
      `INSERT OR IGNORE INTO mindmap_nodes (id, mindmap_id, parent_id, node_type, annotation_id, note_id, doc_id, hyperlink, image_url, tag_id, title, content, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertEdge = this.db.prepare(
      'INSERT OR IGNORE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const n of nodes) {
      insertNode.run(
        n.id, noteId, n.parentId ?? null, n.nodeType ?? 'text',
        n.annotationId ?? null, n.noteId ?? null, n.docId ?? null,
        n.hyperlink ?? null, n.imageUrl ?? null, n.tagId ?? null,
        n.title, n.content ?? null, n.color ?? null,
        n.notes ?? null, n.shape ?? null, n.styleOverrides ?? null,
        n.positionX ?? null, n.positionY ?? null,
        n.sortOrder ?? 0, n.collapsed ? 1 : 0, n.createdAt ?? new Date().toISOString()
      )
    }
    for (const e of edges) {
      insertEdge.run(e.id, noteId, e.sourceId, e.targetId, e.label ?? null, e.style ?? null)
    }
  }
```

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/notes/service.ts
git commit -m "feat(core): extend NoteService for unified note model with mindmap type support"
```

---

### Task 4: Slim Down MindmapService

**Files:**
- Modify: `packages/core/src/mindmaps/service.ts`

- [ ] **Step 1: Remove all CRUD and directory methods**

Rewrite `packages/core/src/mindmaps/service.ts` to keep only node/edge operations. Remove:
- `readFileData` (private) — needs reimplementation for new file location
- `writeFileData` (private) — needs reimplementation
- `deleteFile` (private)
- `listDirs`
- `createDir`
- `renameDir`
- `move`
- `create`
- `list`
- `get`
- `update`
- `delete`

The constructor changes to use `notesDir` instead of `mindmapsDir`:

```typescript
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { v4 as uuid } from 'uuid'
import type {
  MindmapNode, MindmapNodeCreateInput,
  MindmapEdge, MindmapEdgeCreateInput, MindmapNodeType,
} from '../types.js'
import type { EventBus } from '../events/bus.js'

interface NodeRow {
  id: string; mindmap_id: string; parent_id: string | null
  node_type: string; annotation_id: string | null
  note_id: string | null; doc_id: string | null
  hyperlink: string | null; image_url: string | null; tag_id: string | null
  title: string; content: string | null; color: string | null
  notes: string | null; shape: string | null; style_overrides: string | null
  position_x: number | null; position_y: number | null
  sort_order: number; collapsed: number; created_at: string
}

interface EdgeRow {
  id: string; mindmap_id: string; source_id: string; target_id: string
  label: string | null; style: string | null
}

function rowToNode(row: NodeRow): MindmapNode {
  return {
    id: row.id, mindmapId: row.mindmap_id, parentId: row.parent_id,
    nodeType: (row.node_type ?? 'text') as MindmapNodeType,
    annotationId: row.annotation_id, noteId: row.note_id, docId: row.doc_id,
    hyperlink: row.hyperlink, imageUrl: row.image_url, tagId: row.tag_id,
    title: row.title, content: row.content, color: row.color,
    notes: row.notes, shape: row.shape, styleOverrides: row.style_overrides,
    positionX: row.position_x, positionY: row.position_y,
    sortOrder: row.sort_order, collapsed: row.collapsed === 1,
    createdAt: row.created_at,
  }
}

function rowToEdge(row: EdgeRow): MindmapEdge {
  return { id: row.id, mindmapId: row.mindmap_id, sourceId: row.source_id, targetId: row.target_id, label: row.label, style: row.style }
}

export class MindmapService {
  private notesDir: string

  constructor(private db: Database.Database, rootPath: string, private events: EventBus) {
    this.notesDir = join(rootPath, '.banjuan', 'notes')
  }

  // --- File operations (mindmap files live in notesDir now) ---

  private readFileData(noteId: string): { meta: any; nodes: any[]; edges: any[] } | null {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(noteId) as { path: string } | undefined
    if (!row?.path) return null
    const fullPath = join(this.notesDir, row.path)
    if (!existsSync(fullPath)) return null
    try { return JSON.parse(readFileSync(fullPath, 'utf-8')) } catch { return null }
  }

  private writeFileDataById(noteId: string, fileData: any): void {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(noteId) as { path: string } | undefined
    if (row?.path) {
      writeFileSync(join(this.notesDir, row.path), JSON.stringify(fileData, null, 2))
    }
  }

  // --- Nodes ---

  async addNode(noteId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
    const id = uuid()
    const now = new Date().toISOString()
    const parentId = input.parentId ?? null

    const maxRow = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?')
      .get(noteId, parentId) as { max_sort: number }
    const sortOrder = maxRow.max_sort + 1

    const nodeData = {
      id, parentId, nodeType: input.nodeType ?? 'text' as MindmapNodeType,
      annotationId: input.annotationId ?? null,
      noteId: input.noteId ?? null, docId: input.docId ?? null,
      hyperlink: input.hyperlink ?? null, imageUrl: input.imageUrl ?? null,
      tagId: input.tagId ?? null,
      title: input.title, content: input.content ?? null, color: input.color ?? null,
      notes: input.notes ?? null, shape: input.shape ?? null,
      styleOverrides: input.styleOverrides ?? null,
      positionX: input.positionX ?? null, positionY: input.positionY ?? null,
      sortOrder, collapsed: false,
    }

    const fileData = this.readFileData(noteId)
    if (fileData) {
      fileData.nodes.push(nodeData)
      fileData.meta.updatedAt = now
      this.writeFileDataById(noteId, fileData)
    }

    this.db.prepare(
      `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, node_type, annotation_id, note_id, doc_id, hyperlink, image_url, tag_id, title, content, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(id, noteId, parentId, nodeData.nodeType, nodeData.annotationId, nodeData.noteId, nodeData.docId, nodeData.hyperlink, nodeData.imageUrl, nodeData.tagId, input.title, nodeData.content, nodeData.color, nodeData.notes, nodeData.shape, nodeData.styleOverrides, nodeData.positionX, nodeData.positionY, sortOrder, now)

    const node: MindmapNode = { ...nodeData, mindmapId: noteId, createdAt: now }
    this.events.emit('mindmap:node:added', { node })
    return node
  }

  async getNodes(noteId: string): Promise<MindmapNode[]> {
    return (this.db.prepare('SELECT * FROM mindmap_nodes WHERE mindmap_id = ? ORDER BY sort_order').all(noteId) as NodeRow[]).map(rowToNode)
  }

  async findNodesByNoteId(noteId: string): Promise<Array<MindmapNode & { mindmapTitle: string }>> {
    const contentPattern = `%"noteId":"${noteId}"%`
    const rows = this.db.prepare(`
      SELECT n.*, m.title as mindmap_title
      FROM mindmap_nodes n
      JOIN notes m ON m.id = n.mindmap_id
      WHERE n.note_id = ? OR n.content LIKE ?
    `).all(noteId, contentPattern) as (NodeRow & { mindmap_title: string })[]
    return rows.map(row => ({ ...rowToNode(row), mindmapTitle: row.mindmap_title }))
  }

  async updateNode(id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'notes' | 'shape' | 'styleOverrides' | 'nodeType' | 'noteId' | 'docId' | 'hyperlink' | 'imageUrl' | 'tagId' | 'parentId' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>): Promise<MindmapNode> {
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined
    if (!nodeRow) throw new Error(`Node not found: ${id}`)

    const fileData = this.readFileData(nodeRow.mindmap_id)
    if (fileData) {
      const nodeInFile = fileData.nodes.find((n: any) => n.id === id)
      if (nodeInFile) {
        if (updates.title !== undefined) nodeInFile.title = updates.title
        if (updates.content !== undefined) nodeInFile.content = updates.content
        if (updates.color !== undefined) nodeInFile.color = updates.color
        if (updates.notes !== undefined) nodeInFile.notes = updates.notes
        if (updates.shape !== undefined) nodeInFile.shape = updates.shape
        if (updates.styleOverrides !== undefined) nodeInFile.styleOverrides = updates.styleOverrides
        if (updates.nodeType !== undefined) nodeInFile.nodeType = updates.nodeType
        if (updates.noteId !== undefined) nodeInFile.noteId = updates.noteId
        if (updates.docId !== undefined) nodeInFile.docId = updates.docId
        if (updates.hyperlink !== undefined) nodeInFile.hyperlink = updates.hyperlink
        if (updates.imageUrl !== undefined) nodeInFile.imageUrl = updates.imageUrl
        if (updates.tagId !== undefined) nodeInFile.tagId = updates.tagId
        if (updates.parentId !== undefined) nodeInFile.parentId = updates.parentId
        if (updates.positionX !== undefined) nodeInFile.positionX = updates.positionX
        if (updates.positionY !== undefined) nodeInFile.positionY = updates.positionY
        if (updates.collapsed !== undefined) nodeInFile.collapsed = updates.collapsed
        if (updates.sortOrder !== undefined) nodeInFile.sortOrder = updates.sortOrder
      }
      fileData.meta.updatedAt = new Date().toISOString()
      this.writeFileDataById(nodeRow.mindmap_id, fileData)
    }

    const fields: string[] = []
    const values: unknown[] = []
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color) }
    if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes) }
    if (updates.shape !== undefined) { fields.push('shape = ?'); values.push(updates.shape) }
    if (updates.styleOverrides !== undefined) { fields.push('style_overrides = ?'); values.push(updates.styleOverrides) }
    if (updates.nodeType !== undefined) { fields.push('node_type = ?'); values.push(updates.nodeType) }
    if (updates.noteId !== undefined) { fields.push('note_id = ?'); values.push(updates.noteId) }
    if (updates.docId !== undefined) { fields.push('doc_id = ?'); values.push(updates.docId) }
    if (updates.hyperlink !== undefined) { fields.push('hyperlink = ?'); values.push(updates.hyperlink) }
    if (updates.imageUrl !== undefined) { fields.push('image_url = ?'); values.push(updates.imageUrl) }
    if (updates.tagId !== undefined) { fields.push('tag_id = ?'); values.push(updates.tagId) }
    if (updates.parentId !== undefined) { fields.push('parent_id = ?'); values.push(updates.parentId) }
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
      const fileData = this.readFileData(nodeRow.mindmap_id)
      if (fileData) {
        const childIds = this.collectChildIds(id, fileData.nodes)
        const removeIds = new Set([id, ...childIds])
        fileData.nodes = fileData.nodes.filter((n: any) => !removeIds.has(n.id))
        fileData.edges = fileData.edges.filter((e: any) => !removeIds.has(e.sourceId) && !removeIds.has(e.targetId))
        fileData.meta.updatedAt = new Date().toISOString()
        this.writeFileDataById(nodeRow.mindmap_id, fileData)
      }

      const allIds = this.collectDescendantIds(id)
      allIds.push(id)
      const placeholders = allIds.map(() => '?').join(', ')
      this.db.prepare(`DELETE FROM mindmap_edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`).run(...allIds, ...allIds)
      this.db.prepare(`DELETE FROM mindmap_nodes WHERE id IN (${placeholders})`).run(...allIds)
      this.events.emit('mindmap:node:removed', { id, mindmapId: nodeRow.mindmap_id })
    } else {
      this.db.prepare('DELETE FROM mindmap_nodes WHERE id = ?').run(id)
    }
  }

  private collectDescendantIds(parentId: string): string[] {
    const children = this.db.prepare('SELECT id FROM mindmap_nodes WHERE parent_id = ?').all(parentId) as { id: string }[]
    const result: string[] = []
    for (const child of children) {
      result.push(child.id)
      result.push(...this.collectDescendantIds(child.id))
    }
    return result
  }

  private collectChildIds(parentId: string, nodes: any[]): string[] {
    const children = nodes.filter((n: any) => n.parentId === parentId)
    const result: string[] = []
    for (const child of children) {
      result.push(child.id)
      result.push(...this.collectChildIds(child.id, nodes))
    }
    return result
  }

  // --- Edges ---

  async addEdge(noteId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge> {
    const id = uuid()

    const edgeData = {
      id, sourceId: input.sourceId, targetId: input.targetId,
      label: input.label ?? null, style: null,
    }

    const fileData = this.readFileData(noteId)
    if (fileData) {
      fileData.edges.push(edgeData)
      fileData.meta.updatedAt = new Date().toISOString()
      this.writeFileDataById(noteId, fileData)
    }

    this.db.prepare('INSERT INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)').run(id, noteId, input.sourceId, input.targetId, input.label ?? null, null)

    const edge: MindmapEdge = { ...edgeData, mindmapId: noteId }
    this.events.emit('mindmap:edge:added', { edge })
    return edge
  }

  async getEdges(noteId: string): Promise<MindmapEdge[]> {
    return (this.db.prepare('SELECT * FROM mindmap_edges WHERE mindmap_id = ?').all(noteId) as EdgeRow[]).map(rowToEdge)
  }

  async removeEdge(id: string): Promise<void> {
    const edgeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_edges WHERE id = ?').get(id) as { mindmap_id: string } | undefined

    if (edgeRow) {
      const fileData = this.readFileData(edgeRow.mindmap_id)
      if (fileData) {
        fileData.edges = fileData.edges.filter((e: any) => e.id !== id)
        fileData.meta.updatedAt = new Date().toISOString()
        this.writeFileDataById(edgeRow.mindmap_id, fileData)
      }
    }

    this.db.prepare('DELETE FROM mindmap_edges WHERE id = ?').run(id)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/mindmaps/service.ts
git commit -m "refactor(core): slim MindmapService to node/edge operations only"
```

---

### Task 5: Update Library Class and Add File Migration

**Files:**
- Modify: `packages/core/src/library.ts`

- [ ] **Step 1: Update Library constructor — MindmapService now uses notesDir**

The `MindmapService` constructor signature changed to accept `rootPath` (it reads `notesDir` internally). No constructor change needed in Library since we're passing the same `rootPath`. But we need to wire the note import:

Add to the constructor after existing service wiring:

```typescript
    this.notes.setMindmapNodeImporter(
      (noteId, nodes, edges) => {
        // Import mindmap nodes/edges into DB during syncDisk
      }
    )
```

Actually, since NoteService now has `importMindmapNodesFromFile` as a public method, and syncDisk calls it directly, no extra wiring is needed. The `MindmapService` just needs `rootPath` which it already receives.

- [ ] **Step 2: Remove `data/mindmaps` directory creation from Library.init()**

In the `Library.init()` method, remove:

```typescript
    mkdirSync(join(banjuanDir, 'data', 'mindmaps'), { recursive: true })
```

- [ ] **Step 3: Add file migration in Library.open()**

Add a static method to migrate existing mindmap files from `.banjuan/data/mindmaps/` and `.banjuan/mindmaps/` to `.banjuan/notes/`:

```typescript
  private static migrateExistingMindmapFiles(rootPath: string): void {
    const banjuanDir = join(rootPath, '.banjuan')
    const notesDir = join(banjuanDir, 'notes')
    const oldDirs = [
      join(banjuanDir, 'mindmaps'),
      join(banjuanDir, 'data', 'mindmaps'),
    ]

    for (const oldDir of oldDirs) {
      if (!existsSync(oldDir)) continue
      const scan = (dir: string, prefix: string) => {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const srcPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            scan(srcPath, prefix ? `${prefix}/${entry.name}` : entry.name)
          } else if (entry.name.endsWith('.json')) {
            try {
              const raw = JSON.parse(readFileSync(srcPath, 'utf-8'))
              // Convert old MindmapFileData format to new unified format
              const meta = {
                id: raw.id,
                title: raw.title,
                type: 'mindmap' as const,
                docId: raw.docId ?? null,
                folderId: null,
                annotationIds: [],
                tags: raw.tags ?? [],
                contentFormat: 'json' as const,
                typeMeta: { layout: raw.layout ?? 'mindmap', theme: raw.theme ?? 'classic' },
                createdAt: raw.createdAt,
                updatedAt: raw.updatedAt,
              }
              const newFileData = {
                meta,
                nodes: raw.nodes ?? [],
                edges: raw.edges ?? [],
              }
              const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
              const destPath = join(notesDir, relPath)
              // Only migrate if dest doesn't exist
              if (!existsSync(destPath)) {
                mkdirSync(dirname(destPath), { recursive: true })
                writeFileSync(destPath, JSON.stringify(newFileData, null, 2))
              }
            } catch { /* skip malformed files */ }
          }
        }
      }
      scan(oldDir, '')
    }
  }
```

Add the import for `dirname` (already imported).

- [ ] **Step 4: Call migration in Library.open()**

In `Library.open()`, add the migration call before creating the Library instance (around line 112):

```typescript
  static open(rootPath: string): Library {
    const banjuanDir = join(rootPath, '.banjuan')
    if (!existsSync(banjuanDir)) {
      throw new Error(`${rootPath} is not a library — .banjuan directory not found`)
    }

    // Migrate old mindmap files to unified notes directory
    Library.migrateExistingMindmapFiles(rootPath)

    const dbPath = join(banjuanDir, 'db.sqlite')
    if (existsSync(dbPath)) {
      unlinkSync(dbPath)
    }
    const walPath = dbPath + '-wal'
    const shmPath = dbPath + '-shm'
    if (existsSync(walPath)) unlinkSync(walPath)
    if (existsSync(shmPath)) unlinkSync(shmPath)

    const db = createConnection(dbPath)
    initSchema(db)

    return new Library(rootPath, db)
  }
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/library.ts
git commit -m "feat(core): add mindmap file migration and update Library for unified model"
```

---

### Task 6: Update GraphService

**Files:**
- Modify: `packages/core/src/graph/service.ts`

- [ ] **Step 1: Rewrite getData() to use unified notes table**

Replace the entire `getData` method:

```typescript
  async getData(): Promise<GraphData> {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeIds = new Set<string>()

    const docs = this.db.prepare('SELECT id, title, type FROM documents').all() as Array<{ id: string; title: string; type: string }>
    for (const doc of docs) {
      nodes.push({ id: doc.id, label: doc.title, type: 'document', docType: doc.type as any })
      nodeIds.add(doc.id)
    }

    const notes = this.db.prepare('SELECT id, title, type, doc_id FROM notes').all() as Array<{ id: string; title: string; type: string; doc_id: string | null }>
    for (const note of notes) {
      nodes.push({ id: note.id, label: note.title, type: 'note', noteType: note.type as any })
      nodeIds.add(note.id)
      if (note.doc_id && nodeIds.has(note.doc_id)) {
        edges.push({ source: note.id, target: note.doc_id, type: 'note-doc' })
      }
    }

    const noteLinks = this.db.prepare('SELECT source_id, target_id FROM note_links').all() as Array<{ source_id: string; target_id: string }>
    for (const link of noteLinks) {
      if (nodeIds.has(link.source_id) && nodeIds.has(link.target_id)) {
        edges.push({ source: link.source_id, target: link.target_id, type: 'note-note' })
      }
    }

    const annLinks = this.db.prepare(`
      SELECT DISTINCT n.id as note_id, a.doc_id
      FROM note_annotations na
      JOIN notes n ON n.id = na.note_id
      JOIN annotations a ON a.id = na.annotation_id
      WHERE n.doc_id IS NULL OR n.doc_id != a.doc_id
    `).all() as Array<{ note_id: string; doc_id: string }>
    for (const link of annLinks) {
      if (nodeIds.has(link.note_id) && nodeIds.has(link.doc_id)) {
        edges.push({ source: link.note_id, target: link.doc_id, type: 'annotation-link' })
      }
    }

    return { nodes, edges }
  }
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/graph/service.ts
git commit -m "refactor(core): update GraphService to use unified notes table"
```

---

### Task 7: Update TagService

**Files:**
- Modify: `packages/core/src/tags/service.ts`

- [ ] **Step 1: Remove mindmap-specific tag handling**

Remove the `mindmapStore` property and its initialization. Remove all `else if (targetType === 'mindmap')` branches.

Update the constructor:

```typescript
  constructor(private db: Database.Database, private rootPath: string, private events: EventBus) {
    this.tagsFilePath = join(rootPath, '.banjuan', 'tags.json')
    this.docStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'))
  }
```

Remove `MindmapFileData` from the import.

Update `tableMap` in `assign()`, `unassign()`, and `forTarget()` to remove the `mindmap` key:

```typescript
    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
    }
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tags/service.ts
git commit -m "refactor(core): remove mindmap-specific tag handling from TagService"
```

---

### Task 8: Update NoteService.delete() to clean up mindmap data

**Files:**
- Modify: `packages/core/src/notes/service.ts`

- [ ] **Step 1: Add mindmap cleanup to delete()**

Update the `delete` method to also remove mindmap nodes and edges:

```typescript
  async delete(id: string): Promise<void> {
    const row = this.db.prepare('SELECT path, type FROM notes WHERE id = ?').get(id) as { path: string; type: string } | undefined
    if (!row) return
    const filePath = join(this.notesDir, row.path)
    if (existsSync(filePath)) { unlinkSync(filePath) }
    this.search.removeById(id)
    if (this.linkService) { await this.linkService.removeAllForNote(id) }
    this.db.prepare('DELETE FROM note_annotations WHERE note_id = ?').run(id)
    if (row.type === 'mindmap') {
      this.db.prepare('DELETE FROM mindmap_edges WHERE mindmap_id = ?').run(id)
      this.db.prepare('DELETE FROM mindmap_nodes WHERE mindmap_id = ?').run(id)
    }
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id)
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    this.events.emit('note:deleted', { id })
  }
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/notes/service.ts
git commit -m "fix(core): clean up mindmap nodes/edges when deleting a mindmap note"
```

---

## Phase 2: IPC Layer Adaptation

### Task 9: Update IPC Handlers

**Files:**
- Modify: `packages/app/src/main/ipc.ts`

- [ ] **Step 1: Update notes:create handler to accept type params**

Replace the `notes:create` handler:

```typescript
  ipcMain.handle('notes:create', async (event, input: {
    title: string; type?: string; docId?: string; folderId?: string;
    folder?: string; annotationIds?: string[]; content?: string; templateId?: string;
    layout?: string; theme?: string
  }) => {
    return getLib(event).notes.create(input as any)
  })
```

- [ ] **Step 2: Update notes:list handler to accept type filter**

Replace the `notes:list` handler:

```typescript
  ipcMain.handle('notes:list', async (event, options?: {
    type?: string; docId?: string; folderId?: string; tag?: string; sort?: string; order?: string
  }) => {
    return getLib(event).notes.list(options as any)
  })
```

- [ ] **Step 3: Update notes:update handler to accept typeMeta**

```typescript
  ipcMain.handle('notes:update', async (event, id: string, updates: {
    title?: string; content?: string; typeMeta?: Record<string, unknown>
  }) => {
    return getLib(event).notes.update(id, updates)
  })
```

- [ ] **Step 4: Remove mindmap CRUD IPC handlers**

Remove these handlers (keep the node/edge handlers):

```typescript
// REMOVE these:
ipcMain.handle('mindmaps:create', ...)
ipcMain.handle('mindmaps:list', ...)
ipcMain.handle('mindmaps:get', ...)
ipcMain.handle('mindmaps:update', ...)
ipcMain.handle('mindmaps:delete', ...)
ipcMain.handle('mindmaps:move', ...)
ipcMain.handle('mindmaps:listDirs', ...)
ipcMain.handle('mindmaps:createDir', ...)
ipcMain.handle('mindmaps:renameDir', ...)
```

Keep these node/edge handlers but update the parameter names from `mindmapId` to `noteId` (the channel names stay for compatibility):

```typescript
  ipcMain.handle('mindmaps:addNode', async (event, noteId: string, input: MindmapNodeCreateInput) => {
    return getLib(event).mindmaps.addNode(noteId, input)
  })

  ipcMain.handle('mindmaps:getNodes', async (event, noteId: string) => {
    return getLib(event).mindmaps.getNodes(noteId)
  })

  ipcMain.handle('mindmaps:findNodesByNoteId', async (event, noteId: string) => {
    return getLib(event).mindmaps.findNodesByNoteId(noteId)
  })

  ipcMain.handle('mindmaps:updateNode', async (event, id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'notes' | 'shape' | 'styleOverrides' | 'nodeType' | 'noteId' | 'docId' | 'hyperlink' | 'imageUrl' | 'tagId' | 'parentId' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>) => {
    return getLib(event).mindmaps.updateNode(id, updates)
  })

  ipcMain.handle('mindmaps:removeNode', async (event, id: string) => {
    return getLib(event).mindmaps.removeNode(id)
  })

  ipcMain.handle('mindmaps:addEdge', async (event, noteId: string, input: {
    sourceId: string; targetId: string; label?: string
  }) => {
    return getLib(event).mindmaps.addEdge(noteId, input)
  })

  ipcMain.handle('mindmaps:getEdges', async (event, noteId: string) => {
    return getLib(event).mindmaps.getEdges(noteId)
  })

  ipcMain.handle('mindmaps:removeEdge', async (event, id: string) => {
    return getLib(event).mindmaps.removeEdge(id)
  })
```

Also remove the debug `console.log` statements from the node handlers.

- [ ] **Step 5: Update import — remove Mindmap type references if unused**

Update the import line at top of `ipc.ts`:

```typescript
import { Library, type MindmapNodeCreateInput, type MindmapNode } from '@banjuan/core'
```

This stays the same since we still use `MindmapNode` and `MindmapNodeCreateInput` for the node/edge handlers.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/main/ipc.ts
git commit -m "feat(app): update IPC handlers for unified note model"
```

---

### Task 10: Update Preload Bridge

**Files:**
- Modify: `packages/app/src/preload/index.ts`

- [ ] **Step 1: Update notes API to include type parameters**

Update the `notes` object in the preload:

```typescript
  notes: {
    create: (input: {
      title: string; type?: string; docId?: string; folder?: string;
      annotationIds?: string[]; content?: string; templateId?: string;
      layout?: string; theme?: string
    }) => ipcRenderer.invoke('notes:create', input),
    list: (options?: {
      type?: string; docId?: string; folderId?: string; tag?: string; sort?: string; order?: string
    }) => ipcRenderer.invoke('notes:list', options),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    update: (id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }) =>
      ipcRenderer.invoke('notes:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    getAnnotations: (noteId: string) => ipcRenderer.invoke('notes:getAnnotations', noteId),
    move: (id: string, targetFolder: string | null) => ipcRenderer.invoke('notes:move', id, targetFolder),
    listDirs: () => ipcRenderer.invoke('notes:listDirs'),
    createDir: (dirPath: string) => ipcRenderer.invoke('notes:createDir', dirPath),
    renameDir: (oldPath: string, newPath: string) => ipcRenderer.invoke('notes:renameDir', oldPath, newPath),
    onNavigateLink: (callback: (noteId: string) => void) => {
      const handler = (_event: any, noteId: string) => callback(noteId)
      ipcRenderer.on('navigate-note-link', handler)
      return () => { ipcRenderer.removeListener('navigate-note-link', handler) }
    },
  },
```

- [ ] **Step 2: Remove mindmap CRUD methods from preload**

Slim down the `mindmaps` object to only node/edge operations:

```typescript
  mindmaps: {
    addNode: (noteId: string, input: {
      title: string; parentId?: string; nodeType?: string; annotationId?: string;
      noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
      tagId?: string; content?: string; color?: string; notes?: string;
      shape?: string; styleOverrides?: string; positionX?: number; positionY?: number
    }) => ipcRenderer.invoke('mindmaps:addNode', noteId, input),
    getNodes: (noteId: string) => ipcRenderer.invoke('mindmaps:getNodes', noteId),
    findNodesByNoteId: (noteId: string) => ipcRenderer.invoke('mindmaps:findNodesByNoteId', noteId),
    updateNode: (id: string, updates: {
      title?: string; content?: string; color?: string; notes?: string;
      shape?: string; styleOverrides?: string; nodeType?: string;
      noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
      tagId?: string; parentId?: string; positionX?: number; positionY?: number;
      collapsed?: boolean; sortOrder?: number
    }) => ipcRenderer.invoke('mindmaps:updateNode', id, updates),
    removeNode: (id: string) => ipcRenderer.invoke('mindmaps:removeNode', id),
    addEdge: (noteId: string, input: { sourceId: string; targetId: string; label?: string }) =>
      ipcRenderer.invoke('mindmaps:addEdge', noteId, input),
    getEdges: (noteId: string) => ipcRenderer.invoke('mindmaps:getEdges', noteId),
    removeEdge: (id: string) => ipcRenderer.invoke('mindmaps:removeEdge', id),
  },
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/preload/index.ts
git commit -m "feat(app): update preload bridge for unified note model"
```

---

### Task 11: Update Electron Type Definitions

**Files:**
- Modify: `packages/app/electron.d.ts`

- [ ] **Step 1: Update notes type definitions**

```typescript
  notes: {
    create: (input: {
      title: string; type?: string; docId?: string; folder?: string;
      annotationIds?: string[]; content?: string; templateId?: string;
      layout?: string; theme?: string
    }) => Promise<any>
    list: (options?: {
      type?: string; docId?: string; folderId?: string; tag?: string; sort?: string; order?: string
    }) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }) => Promise<any>
    delete: (id: string) => Promise<void>
    getAnnotations: (noteId: string) => Promise<any[]>
    move: (id: string, targetFolder: string | null) => Promise<any>
    listDirs: () => Promise<string[]>
    createDir: (dirPath: string) => Promise<void>
    renameDir: (oldPath: string, newPath: string) => Promise<void>
    onNavigateLink: (callback: (noteId: string) => void) => () => void
  }
```

- [ ] **Step 2: Slim down mindmaps type definitions**

```typescript
  mindmaps: {
    addNode: (noteId: string, input: {
      title: string; parentId?: string; nodeType?: string; annotationId?: string;
      noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
      tagId?: string; content?: string; color?: string; notes?: string;
      shape?: string; styleOverrides?: string; positionX?: number; positionY?: number
    }) => Promise<any>
    getNodes: (noteId: string) => Promise<any[]>
    findNodesByNoteId: (noteId: string) => Promise<Array<any & { mindmapTitle: string }>>
    updateNode: (id: string, updates: {
      title?: string; content?: string; color?: string; notes?: string;
      shape?: string; styleOverrides?: string; nodeType?: string;
      noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
      tagId?: string; parentId?: string; positionX?: number; positionY?: number;
      collapsed?: boolean; sortOrder?: number
    }) => Promise<any>
    removeNode: (id: string) => Promise<void>
    addEdge: (noteId: string, input: { sourceId: string; targetId: string; label?: string }) => Promise<any>
    getEdges: (noteId: string) => Promise<any[]>
    removeEdge: (id: string) => Promise<void>
  }
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/electron.d.ts
git commit -m "feat(app): update electron.d.ts for unified note model"
```

---

## Phase 3: Frontend Adaptation

### Task 12: Update TabManager

**Files:**
- Modify: `packages/app/src/renderer/components/TabManager.tsx`

- [ ] **Step 1: Merge openMindmap into openNote**

Remove the separate `openMindmap` callback. Modify `openNote` to handle both types:

```typescript
  const openNote = useCallback((note: any) => {
    const noteType = note.type ?? 'markdown'
    const tabType = noteType === 'mindmap' ? 'mindmap' : 'note'
    const tabPrefix = noteType === 'mindmap' ? 'mindmap' : 'note'
    const existingTab = tabs.find(t => t.type === tabType && tabData.get(t.id)?.id === note.id)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const tabId = `${tabPrefix}-${note.id}`
    const newTab: Tab = { id: tabId, type: tabType, title: note.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, note))
    setActiveTabId(tabId)
  }, [tabs, tabData])
```

- [ ] **Step 2: Update LibraryView and MindmapView rendering**

Remove the separate `openMindmap` prop from LibraryView. Pass `openNote` as both `onOpenNote` and `onOpenMindmap`:

```typescript
            {tab.type === 'library' && (
              <LibraryView
                rootPath={libraryPath}
                libraryName={libraryName}
                onOpenDoc={openDocument}
                onOpenNote={openNote}
                onOpenMindmap={openNote}
                onOpenGraph={() => {}}
              />
            )}
```

Update MindmapView to receive note data:

```typescript
            {tab.type === 'mindmap' && tabData.get(tab.id) && (
              <MindmapView
                mindmap={tabData.get(tab.id)}
                onBack={() => closeTab(tab.id)}
                onOpenMindmap={openNote}
              />
            )}
```

Update NoteView:

```typescript
            {tab.type === 'note' && tabData.get(tab.id) && (
              <NoteView
                note={tabData.get(tab.id)}
                onBack={() => closeTab(tab.id)}
                onOpenNote={openNote}
                onOpenMindmap={openNote}
              />
            )}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/TabManager.tsx
git commit -m "refactor(app): merge openMindmap into openNote in TabManager"
```

---

### Task 13: Update LibraryView — Unify Mindmap State into Notes

**Files:**
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

This is the largest frontend change. The key changes:

1. Remove all `mindmapItems`, `mindmapDirs`, `selectedMindmapDir`, `expandedMindmapDirs` state
2. All mindmap operations go through `notes` API with `type: 'mindmap'`
3. The sidebar shows a unified notes list with type icons
4. "新建脑图" calls `notes.create({ title, type: 'mindmap' })`

- [ ] **Step 1: Replace mindmap creation to use notes API**

Find all calls to `window.electronAPI.mindmaps.create(...)` and replace with:

```typescript
window.electronAPI.notes.create({ title: '...', type: 'mindmap', folder: selectedDir, layout: 'mindmap' })
```

- [ ] **Step 2: Replace mindmap listing to use notes API**

Find `window.electronAPI.mindmaps.list()` calls and replace with:

```typescript
window.electronAPI.notes.list({ type: 'mindmap' })
```

Or, for a unified list showing all types:

```typescript
window.electronAPI.notes.list()
```

- [ ] **Step 3: Remove mindmap-specific state variables**

Remove:
- `mindmapItems` / `setMindmapItems`
- `mindmapDirs` / `setMindmapDirs`
- `selectedMindmapDir` / `setSelectedMindmapDir`
- `expandedMindmapDirs` / `setExpandedMindmapDirs`
- `loadMindmaps()`, `loadMindmapDirs()`
- Mindmap-specific event listener for `'mindmaps-changed'`

- [ ] **Step 4: Replace mindmap delete/move/rename calls**

Replace:
- `mindmaps.delete(id)` → `notes.delete(id)`
- `mindmaps.move(id, folder)` → `notes.move(id, folder)`
- `mindmaps.update(id, { title })` → `notes.update(id, { title })`
- `mindmaps.listDirs()` → `notes.listDirs()`
- `mindmaps.createDir()` → `notes.createDir()`
- `mindmaps.renameDir()` → `notes.renameDir()`

- [ ] **Step 5: Add type icon distinction in note list**

In the note list rendering, add an icon based on `note.type`:

```typescript
{note.type === 'mindmap' ? '🧠' : '📝'} {note.title}
```

- [ ] **Step 6: Update onOpenMindmap calls to use openNote pattern**

When clicking a mindmap in the list, call `onOpenNote(note)` instead of `onOpenMindmap(note)`. The TabManager's `openNote` already handles routing by `note.type`.

Actually, since we kept `onOpenMindmap` as a prop that maps to the same function, both work. But for clarity, mindmaps should go through `onOpenMindmap(note)` — which is now the same as `onOpenNote(note)`.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/renderer/views/LibraryView.tsx
git commit -m "refactor(app): unify mindmap state into notes in LibraryView"
```

---

### Task 14: Update MindmapView

**Files:**
- Modify: `packages/app/src/renderer/views/MindmapView.tsx`

- [ ] **Step 1: Update props to accept note object**

The `mindmap` prop now contains a unified note object with `type: 'mindmap'`. The `init()` function of `useMindmapStore` needs the note ID, which is the same as before. The key difference is that `layout` and `theme` now come from `note.typeMeta`:

```typescript
interface Props {
  mindmap: {
    id: string
    title: string
    type?: string
    typeMeta?: { layout?: string; theme?: string } | null
    path?: string
  }
  onBack?: () => void
  onOpenMindmap?: (note: any) => void
}
```

In the component, read layout/theme from typeMeta:

```typescript
const layout = props.mindmap.typeMeta?.layout ?? props.mindmap.layout ?? 'mindmap'
const theme = props.mindmap.typeMeta?.theme ?? props.mindmap.theme ?? 'classic'
```

This is backward-compatible — if old `layout`/`theme` props exist they're used as fallback.

- [ ] **Step 2: Update save/update calls**

Find any calls like `window.electronAPI.mindmaps.update(id, { layout, theme })` and replace with:

```typescript
window.electronAPI.notes.update(id, { typeMeta: { layout, theme } })
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/views/MindmapView.tsx
git commit -m "refactor(app): update MindmapView to use unified note object"
```

---

### Task 15: Update BacklinksPanel

**Files:**
- Modify: `packages/app/src/renderer/components/notes/BacklinksPanel.tsx`

- [ ] **Step 1: Simplify mindmap reference handling**

After the unification, `noteLinks:getBacklinks(noteId)` returns links from ALL note types, including mindmaps. The `findNodesByNoteId` can stay for showing specific node-level references.

However, backlinks now naturally include mindmap-to-note links. Update the rendering to show the note type:

```typescript
// In the backlinks rendering section, check if the linked note is a mindmap:
const linkedNote = await window.electronAPI.notes.get(link.sourceId)
if (linkedNote?.type === 'mindmap') {
  // Show mindmap icon
}
```

The `onOpenMindmap` callback should receive the full note object now. When a user clicks a mindmap backlink, call `onOpenMindmap(linkedNote)` with the note object (which has `type: 'mindmap'`).

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/notes/BacklinksPanel.tsx
git commit -m "refactor(app): simplify BacklinksPanel for unified note model"
```

---

### Task 16: Update useMindmapStore

**Files:**
- Modify: `packages/app/src/renderer/components/mindmap/useMindmapStore.ts` (or similar)

- [ ] **Step 1: Check and update init() and save() calls**

Find all references to `window.electronAPI.mindmaps.get(id)` in the mindmap store and replace with `window.electronAPI.notes.get(id)`. Similarly for update calls.

The `init()` function likely calls `mindmaps.get(id)` to load the mindmap — this should now call `notes.get(id)` and parse the response accordingly:

```typescript
// Old:
const mindmap = await window.electronAPI.mindmaps.get(id)
// New:
const note = await window.electronAPI.notes.get(id)
const content = JSON.parse(note.content) // { nodes, edges }
```

- [ ] **Step 2: Update title save**

Replace:
```typescript
window.electronAPI.mindmaps.update(id, { title: newTitle })
```
With:
```typescript
window.electronAPI.notes.update(id, { title: newTitle })
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/useMindmapStore.ts
git commit -m "refactor(app): update useMindmapStore to use unified notes API"
```

---

### Task 17: Final Verification and Cleanup

- [ ] **Step 1: Run TypeScript type check**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit 2>&1 | head -50`

Fix any remaining type errors.

- [ ] **Step 2: Search for remaining mindmaps CRUD references**

Run: `grep -rn "mindmaps\.create\|mindmaps\.list\|mindmaps\.get\|mindmaps\.update\|mindmaps\.delete\|mindmaps\.move\|mindmaps\.listDirs\|mindmaps\.createDir\|mindmaps\.renameDir" packages/app/src/`

All matches should be removed or converted to notes API calls.

- [ ] **Step 3: Search for remaining 'mindmap' event listeners**

Run: `grep -rn "mindmaps-changed" packages/app/src/`

These should be replaced with `notes-changed` or removed.

- [ ] **Step 4: Test the app**

Start the dev server and verify:
1. Open a library — existing notes and mindmaps load
2. Create a new markdown note — works as before
3. Create a new mindmap — creates via notes API
4. Open a mindmap — canvas renders correctly
5. Add nodes to a mindmap — saves correctly
6. Check backlinks between notes and mindmaps
7. Check the knowledge graph shows both types

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(app): resolve remaining issues from unified note model migration"
```
