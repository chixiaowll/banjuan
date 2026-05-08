# Tag System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete tag system with hierarchical tags (via `/` separator), applicable to documents/notes/mindmaps, with tag management UI, Library filtering, and in-editor tagging.

**Architecture:** Extend the existing `TagService` (dual persistence: file + SQLite). Add mindmap target support, missing IPC/preload methods, auto-color generation. Build a shared `TagInput` component used across Library detail panel, document viewers, and note editors. Add tag filtering to Library sidebar. Add a Tag Manager tab for bulk management.

**Tech Stack:** TypeScript, React, better-sqlite3, Electron IPC, lucide-react icons

---

## File Structure

### Core (packages/core)
- **Modify:** `packages/core/src/types.ts` — extend `TagTarget` to include `'mindmap'`
- **Modify:** `packages/core/src/db/schema.ts` — add `mindmap_tags` table
- **Modify:** `packages/core/src/tags/service.ts` — add mindmap support to tableMap, add `delete`, `rename`, `updateColor`, `listWithCounts` methods, add auto-color generation
- **Modify:** `packages/core/test/tags.test.ts` — add tests for new methods

### Electron App (packages/app)
- **Modify:** `packages/app/src/main/ipc.ts` — add missing tag IPC handlers
- **Modify:** `packages/app/src/preload/index.ts` — add missing tag preload methods
- **Modify:** `packages/app/electron.d.ts` — add type definitions for new tag API methods

### Renderer (packages/app/src/renderer)
- **Create:** `packages/app/src/renderer/components/tags/TagInput.tsx` — shared tag input component with autocomplete
- **Create:** `packages/app/src/renderer/components/tags/TagPill.tsx` — shared tag pill display component
- **Create:** `packages/app/src/renderer/components/tags/ColorPicker.tsx` — color picker popover for tag management
- **Create:** `packages/app/src/renderer/views/TagManagerView.tsx` — tag management page (full tab view)
- **Modify:** `packages/app/src/renderer/views/LibraryView.tsx` — sidebar tag section (search, pills, filter), detail panel TagInput, list row tag pills
- **Modify:** `packages/app/src/renderer/views/NoteView.tsx` — add tag row below toolbar
- **Modify:** `packages/app/src/renderer/components/viewers/PdfViewer.tsx` — add tag row below PdfToolbar
- **Modify:** `packages/app/src/renderer/components/TitleBar.tsx` — add `'tag-manager'` to Tab type
- **Modify:** `packages/app/src/renderer/components/TabManager.tsx` — add TagManagerView routing
- **Modify:** `packages/app/src/renderer/i18n/en.ts` — add tag-related i18n keys
- **Modify:** `packages/app/src/renderer/i18n/zh.ts` — add tag-related i18n keys

---

### Task 1: Extend TagTarget and DB Schema for Mindmaps

**Files:**
- Modify: `packages/core/src/types.ts:216`
- Modify: `packages/core/src/db/schema.ts:95` (after note_tags table)

- [ ] **Step 1: Update TagTarget type**

In `packages/core/src/types.ts`, change line 216 from:

```typescript
export type TagTarget = 'document' | 'note'
```

to:

```typescript
export type TagTarget = 'document' | 'note' | 'mindmap'
```

- [ ] **Step 2: Add mindmap_tags table to schema**

In `packages/core/src/db/schema.ts`, add after the `note_tags` table (after line 95, before the `search_index` virtual table):

```sql
CREATE TABLE IF NOT EXISTS mindmap_tags (
    mindmap_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (mindmap_id, tag_id)
);
```

The full addition in the `SCHEMA_SQL` template literal:

```typescript
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
```

- [ ] **Step 3: Verify the schema change compiles**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit -p packages/core/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/db/schema.ts
git commit -m "feat(tags): extend TagTarget to include mindmap, add mindmap_tags table"
```

---

### Task 2: Add Mindmap Support and New Methods to TagService

**Files:**
- Modify: `packages/core/src/tags/service.ts`

- [ ] **Step 1: Add auto-color generation**

Add at the top of `packages/core/src/tags/service.ts` (after the imports, before the class):

```typescript
const TAG_PALETTE = [
  '#4a7ab5', '#7b6ba8', '#a07842', '#3d8a66',
  '#5d5da0', '#9a8035', '#a35882', '#3a7f86',
  '#737a84', '#6b8a3d', '#8a6b3d', '#3d6b8a',
]

function autoColor(name: string): string {
  const hash = name.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}
```

- [ ] **Step 2: Update create() to use auto-color**

Replace the `create` method (lines 28-39):

```typescript
async create(input: { name: string; color?: string }): Promise<Tag> {
  const id = uuid()
  const color = input.color ?? autoColor(input.name)

  const tags = this.readTagsFile()
  tags.push({ id, name: input.name, color })
  this.writeTagsFile(tags)

  this.db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)').run(id, input.name, color)

  return { id, name: input.name, color }
}
```

- [ ] **Step 3: Add mindmap to all three tableMaps**

Update the `tableMap` in `assign()` (lines 68-71), `unassign()` (lines 110-113), and `forTarget()` (lines 123-126) to include mindmap:

```typescript
const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
  document: { table: 'doc_tags', idCol: 'doc_id' },
  note: { table: 'note_tags', idCol: 'note_id' },
  mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
}
```

- [ ] **Step 4: Add mindmap file handling in assign()**

After the `else if (targetType === 'note')` block in `assign()` (after line 66), add:

```typescript
} else if (targetType === 'mindmap') {
  const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(targetId) as { path: string } | undefined
  if (row) {
    const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      const json = JSON.parse(raw)
      const existingTags = (json.tags as string[]) ?? []
      json.tags = [...new Set([...existingTags, ...tagNames])]
      json.updatedAt = new Date().toISOString()
      writeFileSync(filePath, JSON.stringify(json, null, 2))
    }
  }
}
```

- [ ] **Step 5: Add mindmap file handling in unassign()**

After the `else if (targetType === 'note')` block in `unassign()` (after line 108), add:

```typescript
} else if (targetType === 'mindmap') {
  const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(targetId) as { path: string } | undefined
  if (row) {
    const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      const json = JSON.parse(raw)
      json.tags = ((json.tags as string[]) ?? []).filter((t: string) => t !== tagName)
      json.updatedAt = new Date().toISOString()
      writeFileSync(filePath, JSON.stringify(json, null, 2))
    }
  }
}
```

- [ ] **Step 6: Add delete() method**

Add after the `forTarget()` method:

```typescript
async delete(tagId: string): Promise<void> {
  const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag | undefined
  if (!tag) return

  // Remove from all junction tables
  this.db.prepare('DELETE FROM doc_tags WHERE tag_id = ?').run(tagId)
  this.db.prepare('DELETE FROM note_tags WHERE tag_id = ?').run(tagId)
  this.db.prepare('DELETE FROM mindmap_tags WHERE tag_id = ?').run(tagId)
  this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId)

  // Remove from tags.json
  const tags = this.readTagsFile()
  this.writeTagsFile(tags.filter(t => t.id !== tagId))

  // Remove from all document files
  const docRows = this.db.prepare('SELECT id FROM documents').all() as Array<{ id: string }>
  for (const { id } of docRows) {
    const data = this.docStore.read(id)
    if (data && data.tags.includes(tag.name)) {
      data.tags = data.tags.filter(t => t !== tag.name)
      data.updatedAt = new Date().toISOString()
      this.docStore.write(data)
    }
  }

  // Remove from all note/mindmap files
  const noteRows = this.db.prepare('SELECT id, path FROM notes').all() as Array<{ id: string; path: string }>
  for (const { path } of noteRows) {
    const filePath = join(this.rootPath, '.banjuan', 'notes', path)
    if (!existsSync(filePath)) continue
    const raw = readFileSync(filePath, 'utf-8')
    if (!raw.includes(tag.name)) continue
    try {
      // Try JSON (mindmap)
      const json = JSON.parse(raw)
      if (json.tags && json.tags.includes(tag.name)) {
        json.tags = json.tags.filter((t: string) => t !== tag.name)
        json.updatedAt = new Date().toISOString()
        writeFileSync(filePath, JSON.stringify(json, null, 2))
      }
    } catch {
      // Try frontmatter (markdown/handwriting note)
      const { data, content } = parseFrontmatter(raw)
      if (data.tags && (data.tags as string[]).includes(tag.name)) {
        data.tags = (data.tags as string[]).filter((t: string) => t !== tag.name)
        data.updatedAt = new Date().toISOString()
        writeFileSync(filePath, serializeFrontmatter(data, content))
      }
    }
  }
}
```

- [ ] **Step 7: Add rename() method**

```typescript
async rename(tagId: string, newName: string): Promise<void> {
  const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag | undefined
  if (!tag) return
  const oldName = tag.name

  // Update DB
  this.db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(newName, tagId)

  // Update tags.json
  const tags = this.readTagsFile()
  const entry = tags.find(t => t.id === tagId)
  if (entry) entry.name = newName
  this.writeTagsFile(tags)

  // Update all document files
  const docRows = this.db.prepare('SELECT id FROM documents').all() as Array<{ id: string }>
  for (const { id } of docRows) {
    const data = this.docStore.read(id)
    if (data && data.tags.includes(oldName)) {
      data.tags = data.tags.map(t => t === oldName ? newName : t)
      data.updatedAt = new Date().toISOString()
      this.docStore.write(data)
    }
  }

  // Update all note/mindmap files
  const noteRows = this.db.prepare('SELECT id, path FROM notes').all() as Array<{ id: string; path: string }>
  for (const { path } of noteRows) {
    const filePath = join(this.rootPath, '.banjuan', 'notes', path)
    if (!existsSync(filePath)) continue
    const raw = readFileSync(filePath, 'utf-8')
    if (!raw.includes(oldName)) continue
    try {
      const json = JSON.parse(raw)
      if (json.tags && json.tags.includes(oldName)) {
        json.tags = json.tags.map((t: string) => t === oldName ? newName : t)
        json.updatedAt = new Date().toISOString()
        writeFileSync(filePath, JSON.stringify(json, null, 2))
      }
    } catch {
      const { data, content } = parseFrontmatter(raw)
      if (data.tags && (data.tags as string[]).includes(oldName)) {
        data.tags = (data.tags as string[]).map((t: string) => t === oldName ? newName : t)
        data.updatedAt = new Date().toISOString()
        writeFileSync(filePath, serializeFrontmatter(data, content))
      }
    }
  }
}
```

- [ ] **Step 8: Add updateColor() method**

```typescript
async updateColor(tagId: string, color: string): Promise<void> {
  this.db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, tagId)

  const tags = this.readTagsFile()
  const entry = tags.find(t => t.id === tagId)
  if (entry) entry.color = color
  this.writeTagsFile(tags)
}
```

- [ ] **Step 9: Add listWithCounts() method**

```typescript
async listWithCounts(): Promise<Array<Tag & { count: number }>> {
  const sql = `
    SELECT tags.id, tags.name, tags.color,
      (SELECT COUNT(*) FROM doc_tags WHERE doc_tags.tag_id = tags.id) +
      (SELECT COUNT(*) FROM note_tags WHERE note_tags.tag_id = tags.id) +
      (SELECT COUNT(*) FROM mindmap_tags WHERE mindmap_tags.tag_id = tags.id) AS count
    FROM tags
    ORDER BY count DESC, tags.name ASC
  `
  return this.db.prepare(sql).all() as Array<Tag & { count: number }>
}
```

- [ ] **Step 10: Verify compilation**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit -p packages/core/tsconfig.json`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/tags/service.ts
git commit -m "feat(tags): add mindmap support, delete/rename/updateColor/listWithCounts methods, auto-color"
```

---

### Task 3: Add Tests for New TagService Methods

**Files:**
- Modify: `packages/core/test/tags.test.ts`

- [ ] **Step 1: Add tests for new methods**

Append the following tests to the existing `describe('TagService')` block in `packages/core/test/tags.test.ts`:

```typescript
test('delete removes tag from all targets and files', async () => {
  const tag = await lib.tags.create({ name: 'ToDelete' })
  const doc = await lib.documents.import(join(__dirname, 'fixtures', 'sample.pdf'))
  await lib.tags.assign(doc.id, 'document', ['ToDelete'])

  await lib.tags.delete(tag.id)

  const allTags = await lib.tags.list()
  expect(allTags.find(t => t.name === 'ToDelete')).toBeUndefined()

  const docTags = await lib.tags.forTarget(doc.id, 'document')
  expect(docTags).toEqual([])
})

test('rename cascades to all targets', async () => {
  const tag = await lib.tags.create({ name: 'OldName' })
  const doc = await lib.documents.import(join(__dirname, 'fixtures', 'sample.pdf'))
  await lib.tags.assign(doc.id, 'document', ['OldName'])

  await lib.tags.rename(tag.id, 'NewName')

  const allTags = await lib.tags.list()
  expect(allTags.find(t => t.name === 'NewName')).toBeDefined()
  expect(allTags.find(t => t.name === 'OldName')).toBeUndefined()

  const docTags = await lib.tags.forTarget(doc.id, 'document')
  expect(docTags[0].name).toBe('NewName')
})

test('updateColor changes tag color', async () => {
  const tag = await lib.tags.create({ name: 'Colored' })
  await lib.tags.updateColor(tag.id, '#ff0000')

  const allTags = await lib.tags.list()
  const updated = allTags.find(t => t.id === tag.id)
  expect(updated?.color).toBe('#ff0000')
})

test('listWithCounts returns tags sorted by usage', async () => {
  await lib.tags.create({ name: 'Popular' })
  await lib.tags.create({ name: 'Lonely' })
  const doc1 = await lib.documents.import(join(__dirname, 'fixtures', 'sample.pdf'))
  const doc2 = await lib.documents.import(join(__dirname, 'fixtures', 'sample.pdf'))
  await lib.tags.assign(doc1.id, 'document', ['Popular'])
  await lib.tags.assign(doc2.id, 'document', ['Popular'])
  await lib.tags.assign(doc1.id, 'document', ['Lonely'])

  const result = await lib.tags.listWithCounts()
  const popular = result.find(t => t.name === 'Popular')
  const lonely = result.find(t => t.name === 'Lonely')
  expect(popular!.count).toBeGreaterThanOrEqual(2)
  expect(lonely!.count).toBeGreaterThanOrEqual(1)
})

test('auto-color is assigned when no color provided', async () => {
  const tag = await lib.tags.create({ name: 'AutoColored' })
  expect(tag.color).toBeTruthy()
  expect(tag.color).toMatch(/^#[0-9a-f]{6}$/)
})
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx vitest run packages/core/test/tags.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/tags.test.ts
git commit -m "test(tags): add tests for delete, rename, updateColor, listWithCounts, auto-color"
```

---

### Task 4: Add IPC Handlers and Preload API

**Files:**
- Modify: `packages/app/src/main/ipc.ts:107-117`
- Modify: `packages/app/src/preload/index.ts:25-29`
- Modify: `packages/app/electron.d.ts:22-26`

- [ ] **Step 1: Add IPC handlers**

In `packages/app/src/main/ipc.ts`, replace the existing tag handlers (lines 107-117) with:

```typescript
ipcMain.handle('tags:list', async (event) => {
  return getLib(event).tags.list()
})

ipcMain.handle('tags:listWithCounts', async (event) => {
  return getLib(event).tags.listWithCounts()
})

ipcMain.handle('tags:create', async (event, input: { name: string; color?: string }) => {
  return getLib(event).tags.create(input)
})

ipcMain.handle('tags:forTarget', async (event, targetId: string, targetType: string) => {
  return getLib(event).tags.forTarget(targetId, targetType as any)
})

ipcMain.handle('tags:assign', async (event, targetId: string, targetType: string, tagNames: string[]) => {
  return getLib(event).tags.assign(targetId, targetType as any, tagNames)
})

ipcMain.handle('tags:unassign', async (event, targetId: string, targetType: string, tagName: string) => {
  return getLib(event).tags.unassign(targetId, targetType as any, tagName)
})

ipcMain.handle('tags:delete', async (event, tagId: string) => {
  return getLib(event).tags.delete(tagId)
})

ipcMain.handle('tags:rename', async (event, tagId: string, newName: string) => {
  return getLib(event).tags.rename(tagId, newName)
})

ipcMain.handle('tags:updateColor', async (event, tagId: string, color: string) => {
  return getLib(event).tags.updateColor(tagId, color)
})
```

- [ ] **Step 2: Add preload API methods**

In `packages/app/src/preload/index.ts`, replace the tags section (lines 25-29) with:

```typescript
tags: {
  list: () => ipcRenderer.invoke('tags:list'),
  listWithCounts: () => ipcRenderer.invoke('tags:listWithCounts'),
  create: (input: { name: string; color?: string }) => ipcRenderer.invoke('tags:create', input),
  forTarget: (id: string, type: string) => ipcRenderer.invoke('tags:forTarget', id, type),
  assign: (targetId: string, targetType: string, tagNames: string[]) => ipcRenderer.invoke('tags:assign', targetId, targetType, tagNames),
  unassign: (targetId: string, targetType: string, tagName: string) => ipcRenderer.invoke('tags:unassign', targetId, targetType, tagName),
  delete: (tagId: string) => ipcRenderer.invoke('tags:delete', tagId),
  rename: (tagId: string, newName: string) => ipcRenderer.invoke('tags:rename', tagId, newName),
  updateColor: (tagId: string, color: string) => ipcRenderer.invoke('tags:updateColor', tagId, color),
},
```

- [ ] **Step 3: Update electron.d.ts type definitions**

In `packages/app/electron.d.ts`, replace the tags section (lines 22-26) with:

```typescript
tags: {
  list: () => Promise<any[]>
  listWithCounts: () => Promise<Array<{ id: string; name: string; color: string | null; count: number }>>
  create: (input: { name: string; color?: string }) => Promise<any>
  forTarget: (id: string, type: string) => Promise<any[]>
  assign: (targetId: string, targetType: string, tagNames: string[]) => Promise<void>
  unassign: (targetId: string, targetType: string, tagName: string) => Promise<void>
  delete: (tagId: string) => Promise<void>
  rename: (tagId: string, newName: string) => Promise<void>
  updateColor: (tagId: string, color: string) => Promise<void>
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit -p packages/app/tsconfig.json`
Expected: No errors (or only pre-existing errors)

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/main/ipc.ts packages/app/src/preload/index.ts packages/app/electron.d.ts
git commit -m "feat(tags): add assign/unassign/delete/rename/updateColor/listWithCounts IPC handlers"
```

---

### Task 5: Add i18n Keys

**Files:**
- Modify: `packages/app/src/renderer/i18n/en.ts`
- Modify: `packages/app/src/renderer/i18n/zh.ts`

- [ ] **Step 1: Add English translations**

In `packages/app/src/renderer/i18n/en.ts`, add before the closing `} as const`:

```typescript
// Tags
'tags.search': 'Search tags...',
'tags.addTag': 'Add tag...',
'tags.manager': 'Tag Manager',
'tags.newTag': 'New Tag',
'tags.rename': 'Rename',
'tags.delete': 'Delete',
'tags.deleteConfirm': 'Delete tag "{0}"? It will be removed from all items.',
'tags.color': 'Color',
'tags.count': 'Items',
'tags.more': '+{0} more',
'tags.name': 'Name',
'tags.actions': 'Actions',
'tags.noTags': 'No tags yet',
'tags.sortByName': 'Sort by name',
'tags.sortByCount': 'Sort by count',
```

- [ ] **Step 2: Add Chinese translations**

In `packages/app/src/renderer/i18n/zh.ts`, add before the closing `} as const`:

```typescript
// Tags
'tags.search': '搜索标签...',
'tags.addTag': '添加标签...',
'tags.manager': '标签管理',
'tags.newTag': '新建标签',
'tags.rename': '重命名',
'tags.delete': '删除',
'tags.deleteConfirm': '删除标签「{0}」？将从所有内容中移除。',
'tags.color': '颜色',
'tags.count': '关联数',
'tags.more': '+{0} 更多',
'tags.name': '名称',
'tags.actions': '操作',
'tags.noTags': '还没有标签',
'tags.sortByName': '按名称排序',
'tags.sortByCount': '按关联数排序',
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/i18n/en.ts packages/app/src/renderer/i18n/zh.ts
git commit -m "feat(tags): add i18n keys for tag system"
```

---

### Task 6: Create TagPill Component

**Files:**
- Create: `packages/app/src/renderer/components/tags/TagPill.tsx`

- [ ] **Step 1: Create the TagPill component**

```typescript
import React from 'react'
import { X } from 'lucide-react'

interface Props {
  name: string
  color: string | null
  onRemove?: () => void
}

function leafName(name: string): string {
  const parts = name.split('/')
  return parts[parts.length - 1]
}

function pillBg(color: string): string {
  // Mix color with white at ~15% to create a soft background
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const mix = (c: number) => Math.round(c * 0.15 + 255 * 0.85)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

export default function TagPill({ name, color, onRemove }: Props) {
  const fg = color || '#737a84'
  const bg = pillBg(fg)

  return (
    <span
      title={name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
        padding: '2px 6px', borderRadius: 9999,
        background: bg, color: fg, whiteSpace: 'nowrap',
      }}
    >
      {leafName(name)}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{ cursor: 'pointer', display: 'inline-flex', marginLeft: 2, opacity: 0.6 }}
        >
          <X size={10} />
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit -p packages/app/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/tags/TagPill.tsx
git commit -m "feat(tags): create TagPill component"
```

---

### Task 7: Create TagInput Component

**Files:**
- Create: `packages/app/src/renderer/components/tags/TagInput.tsx`

- [ ] **Step 1: Create the TagInput component**

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus } from 'lucide-react'
import TagPill from './TagPill.js'
import { useT } from '../../i18n/index.js'

interface Tag {
  id: string
  name: string
  color: string | null
}

interface Props {
  targetId: string
  targetType: 'document' | 'note' | 'mindmap'
  compact?: boolean
}

export default function TagInput({ targetId, targetType, compact }: Props) {
  const t = useT()
  const [tags, setTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [inputOpen, setInputOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadTags = useCallback(async () => {
    const result = await window.electronAPI.tags.forTarget(targetId, targetType)
    setTags(result)
  }, [targetId, targetType])

  const loadAllTags = useCallback(async () => {
    const result = await window.electronAPI.tags.list()
    setAllTags(result)
  }, [])

  useEffect(() => { loadTags() }, [loadTags])

  useEffect(() => {
    if (inputOpen) {
      loadAllTags()
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [inputOpen, loadAllTags])

  useEffect(() => {
    if (!inputOpen) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setInputOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [inputOpen])

  const handleAdd = async (tagName: string) => {
    const trimmed = tagName.trim()
    if (!trimmed) return

    const existing = allTags.find(t => t.name === trimmed)
    if (!existing) {
      await window.electronAPI.tags.create({ name: trimmed })
    }
    await window.electronAPI.tags.assign(targetId, targetType, [trimmed])
    await loadTags()
    setQuery('')
    setInputOpen(false)
  }

  const handleRemove = async (tagName: string) => {
    await window.electronAPI.tags.unassign(targetId, targetType, tagName)
    await loadTags()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      handleAdd(query)
    } else if (e.key === 'Escape') {
      setInputOpen(false)
      setQuery('')
    }
  }

  const suggestions = query.trim()
    ? allTags
        .filter(t => !tags.some(existing => existing.id === t.id))
        .filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
    : []

  const isNew = query.trim() && !allTags.some(t => t.name === query.trim())

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minHeight: compact ? 24 : 28 }}>
      {tags.map((tag) => (
        <TagPill key={tag.id} name={tag.name} color={tag.color} onRemove={() => handleRemove(tag.name)} />
      ))}
      <div ref={containerRef} style={{ position: 'relative' }}>
        {inputOpen ? (
          <div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('tags.addTag')}
              style={{
                fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)',
                borderRadius: 4, outline: 'none', background: 'var(--surface)',
                color: 'var(--text)', width: 140,
              }}
            />
            {(suggestions.length > 0 || isNew) && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 2,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 100, minWidth: 160, maxHeight: 200, overflowY: 'auto',
              }}>
                {suggestions.map((tag) => (
                  <div
                    key={tag.id}
                    onClick={() => handleAdd(tag.name)}
                    style={{
                      padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: tag.color || '#737a84', flexShrink: 0,
                    }} />
                    {tag.name}
                  </div>
                ))}
                {isNew && (
                  <div
                    onClick={() => handleAdd(query)}
                    style={{
                      padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                      color: 'var(--accent)', borderTop: suggestions.length > 0 ? '1px solid var(--border)' : 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    + Create "{query.trim()}"
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <span
            onClick={() => setInputOpen(true)}
            style={{
              fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '2px 4px', borderRadius: 4,
            }}
          >
            <Plus size={12} />{compact ? '' : t('tags.addTag')}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit -p packages/app/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/tags/TagInput.tsx
git commit -m "feat(tags): create TagInput component with autocomplete"
```

---

### Task 8: Integrate TagInput into Library Detail Panel

**Files:**
- Modify: `packages/app/src/renderer/views/LibraryView.tsx:806-815`

- [ ] **Step 1: Add TagInput import**

At the top of `LibraryView.tsx`, add:

```typescript
import TagInput from '../components/tags/TagInput.js'
```

- [ ] **Step 2: Replace read-only tag display with TagInput in document detail panel**

In `LibraryView.tsx`, replace the tag display block (lines 806-815):

```typescript
{selectedItemTags.length > 0 && (
  <div style={{ marginTop: 8, marginBottom: 8 }}>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {selectedItemTags.map((tag) => (
        <span key={tag.id} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: 'var(--hover)', color: tag.color || 'var(--text-muted)' }}>{tag.name}</span>
      ))}
    </div>
  </div>
)}
```

with:

```typescript
<div style={{ marginTop: 8, marginBottom: 8 }}>
  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
  <TagInput targetId={selectedItemId} targetType={selectedSection === 'documents' ? 'document' : 'note'} />
</div>
```

- [ ] **Step 3: Also add TagInput to the notes detail panel**

Find the notes detail panel section (around line 828, the block starting with `{selectedItemId && selectedSection !== 'documents'`). Inside that panel, add TagInput similarly:

```typescript
<div style={{ marginTop: 8, marginBottom: 8 }}>
  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
  <TagInput targetId={selectedItemId} targetType="note" />
</div>
```

- [ ] **Step 4: Verify the app runs**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npm run dev`
Test: Open the app, select a document, verify TagInput appears in the detail panel. Add a tag, verify it persists.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/views/LibraryView.tsx
git commit -m "feat(tags): integrate TagInput into Library detail panel"
```

---

### Task 9: Library Sidebar Tag Section with Search and Filter

**Files:**
- Modify: `packages/app/src/renderer/views/LibraryView.tsx:626-646` (sidebar tags section)
- Modify: `packages/app/src/renderer/views/LibraryView.tsx:424-445` (getDisplayItems filter logic)

- [ ] **Step 1: Add state for tag search and sidebar tag data**

Near the existing state declarations (around line 164), add:

```typescript
const [tagsWithCounts, setTagsWithCounts] = useState<Array<{ id: string; name: string; color: string | null; count: number }>>([])
const [tagSearch, setTagSearch] = useState('')
const [showAllTags, setShowAllTags] = useState(false)
```

- [ ] **Step 2: Add TagPill import**

```typescript
import TagPill from '../components/tags/TagPill.js'
```

- [ ] **Step 3: Update loadTags to use listWithCounts**

Replace the existing `loadTags` function (around line 245-248) with:

```typescript
const loadTags = async () => {
  try {
    const list = await window.electronAPI.tags.listWithCounts()
    setTagsWithCounts(list)
    setTags(list)
  } catch { setTagsWithCounts([]); setTags([]) }
}
```

- [ ] **Step 4: Replace the sidebar Tags section**

Replace lines 626-646 (the `{/* Tags */}` section) with:

```typescript
{/* Tags */}
<div style={{ padding: '4px 12px' }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('library.tags')}</div>
    <span
      onClick={() => onOpenTagManager?.()}
      title={t('tags.manager')}
      style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
    >⚙</span>
  </div>
  {tagsWithCounts.length > 0 && (
    <input
      value={tagSearch}
      onChange={(e) => setTagSearch(e.target.value)}
      placeholder={t('tags.search')}
      style={{
        width: '100%', fontSize: 11, padding: '3px 6px', marginBottom: 6,
        border: '1px solid var(--border)', borderRadius: 4,
        background: 'var(--surface)', color: 'var(--text)', outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  )}
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
    {(() => {
      const filtered = tagsWithCounts.filter(tag =>
        !tagSearch || tag.name.toLowerCase().includes(tagSearch.toLowerCase())
      )
      const MAX_VISIBLE = 10
      const visible = showAllTags ? filtered : filtered.slice(0, MAX_VISIBLE)
      const remaining = filtered.length - MAX_VISIBLE
      return (
        <>
          {visible.map((tag) => (
            <span
              key={tag.id}
              onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
              style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 9999, cursor: 'pointer',
                background: selectedTag === tag.id ? (tag.color || 'var(--accent)') : 'var(--hover)',
                color: selectedTag === tag.id ? '#fff' : (tag.color || 'var(--text-muted)'),
                border: selectedTag === tag.id ? `1px solid ${tag.color || 'var(--accent)'}` : '1px solid transparent',
                fontWeight: 500,
              }}
            >
              {tag.name.split('/').pop()} ({tag.count})
            </span>
          ))}
          {!showAllTags && remaining > 0 && (
            <span
              onClick={() => setShowAllTags(true)}
              style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px' }}
            >
              {t('tags.more', remaining)}
            </span>
          )}
          {showAllTags && filtered.length > MAX_VISIBLE && (
            <span
              onClick={() => setShowAllTags(false)}
              style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px' }}
            >
              ▲
            </span>
          )}
        </>
      )
    })()}
    {tagsWithCounts.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('library.noTags')}</span>}
  </div>
</div>
```

- [ ] **Step 5: Add tag filtering to getDisplayItems**

In the `getDisplayItems` function (around line 424-445), add tag filtering before the search filter. After the section filtering and before `if (searchQuery)`, add:

```typescript
if (selectedTag) {
  const tag = tagsWithCounts.find(t => t.id === selectedTag)
  if (tag) {
    // Need to filter items that have this tag — we'll fetch tag associations
    // For simplicity, filter by checking if item has the tag
    // This requires items to carry their tags. We'll enhance the item loading.
  }
}
```

Actually, the simpler approach: load tag associations for filtering. Add a new state:

```typescript
const [tagFilteredIds, setTagFilteredIds] = useState<Set<string> | null>(null)
```

Add an effect that updates when `selectedTag` changes:

```typescript
useEffect(() => {
  if (!selectedTag) {
    setTagFilteredIds(null)
    return
  }
  const loadFilteredIds = async () => {
    // Get all items that have tags from both document and note lists
    const allItems = [...documents, ...notes]
    const ids = new Set<string>()
    for (const item of allItems) {
      const targetType = documents.includes(item) ? 'document' : 'note'
      const itemTags = await window.electronAPI.tags.forTarget(item.id, targetType)
      if (itemTags.some(t => t.id === selectedTag)) ids.add(item.id)
    }
    setTagFilteredIds(ids)
  }
  loadFilteredIds()
}, [selectedTag, documents, notes])
```

Then in `getDisplayItems`, after section filtering add:

```typescript
if (tagFilteredIds) {
  items = items.filter((item: any) => tagFilteredIds.has(item.id))
}
```

- [ ] **Step 6: Add onOpenTagManager to Props**

Add `onOpenTagManager` to the `Props` interface:

```typescript
interface Props {
  rootPath: string
  libraryName: string
  onOpenDoc: (doc: any) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
  onOpenGraph: () => void
  onOpenTagManager?: () => void
}
```

And update the function signature to destructure it.

- [ ] **Step 7: Verify the app runs**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npm run dev`
Test: Open app, verify sidebar tags section shows tags with counts, search works, clicking a tag filters the list.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/renderer/views/LibraryView.tsx
git commit -m "feat(tags): add sidebar tag section with search, counts, and click-to-filter"
```

---

### Task 10: Library List Tag Pills

**Files:**
- Modify: `packages/app/src/renderer/views/LibraryView.tsx` (table row rendering)

- [ ] **Step 1: Load tags for each item in the list**

Add a state for item tags:

```typescript
const [itemTagsMap, setItemTagsMap] = useState<Map<string, Array<{ id: string; name: string; color: string | null }>>>(new Map())
```

Add an effect to load tags for displayed items:

```typescript
useEffect(() => {
  const loadItemTags = async () => {
    const items = getDisplayItems()
    const map = new Map<string, Array<{ id: string; name: string; color: string | null }>>()
    for (const item of items) {
      const targetType = documents.some((d: any) => d.id === item.id) ? 'document' : 'note'
      try {
        const itemTags = await window.electronAPI.tags.forTarget(item.id, targetType)
        if (itemTags.length > 0) map.set(item.id, itemTags)
      } catch { /* skip */ }
    }
    setItemTagsMap(map)
  }
  loadItemTags()
}, [displayItems.length, selectedSection])
```

- [ ] **Step 2: Add tag pills below title in each table row**

Find the table row title cell rendering. Below the title `<div>`, add:

```typescript
{itemTagsMap.get(item.id) && (
  <div style={{ display: 'flex', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
    {itemTagsMap.get(item.id)!.slice(0, 3).map((tag) => (
      <TagPill key={tag.id} name={tag.name} color={tag.color} />
    ))}
    {itemTagsMap.get(item.id)!.length > 3 && (
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        +{itemTagsMap.get(item.id)!.length - 3}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify the app runs**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npm run dev`
Test: Open app, verify tag pills appear below titles in the list.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/views/LibraryView.tsx
git commit -m "feat(tags): show tag pills in Library list rows"
```

---

### Task 11: Add Tag Row to NoteView

**Files:**
- Modify: `packages/app/src/renderer/views/NoteView.tsx:380-385`

- [ ] **Step 1: Add TagInput import**

At the top of `NoteView.tsx`:

```typescript
import TagInput from '../components/tags/TagInput.js'
```

- [ ] **Step 2: Add tag row below the toolbar**

In `NoteView.tsx`, after the toolbar `</div>` (the one with `height: 40` at around line 385), add a tag row:

```typescript
{/* Tag row */}
<div style={{
  padding: '4px 12px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
}}>
  <TagInput
    targetId={note.id}
    targetType={note.type === 'mindmap' ? 'mindmap' : 'note'}
    compact
  />
</div>
```

The tag row goes between the toolbar and the editor content area, so it's always visible.

- [ ] **Step 3: Verify the app runs**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npm run dev`
Test: Open a note, verify tag row appears below toolbar. Add a tag, verify it persists.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/views/NoteView.tsx
git commit -m "feat(tags): add tag row to NoteView"
```

---

### Task 12: Add Tag Row to PdfViewer

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/PdfViewer.tsx:93-96`

- [ ] **Step 1: Add TagInput import**

At the top of `PdfViewer.tsx`:

```typescript
import TagInput from '../tags/TagInput.js'
```

- [ ] **Step 2: Add tag row between PdfToolbar and content area**

In `PdfViewer.tsx`, between `<PdfToolbar />` (line 95) and the content `<div>` (line 96), add:

```typescript
<PdfToolbar />
{/* Tag row */}
<div style={{
  padding: '4px 12px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
}}>
  <TagInput targetId={doc.id} targetType="document" compact />
</div>
<div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
```

- [ ] **Step 3: Verify the app runs**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npm run dev`
Test: Open a PDF document, verify tag row appears below toolbar.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfViewer.tsx
git commit -m "feat(tags): add tag row to PdfViewer"
```

---

### Task 13: Create ColorPicker Component

**Files:**
- Create: `packages/app/src/renderer/components/tags/ColorPicker.tsx`

- [ ] **Step 1: Create the ColorPicker component**

```typescript
import React, { useState, useEffect, useRef } from 'react'

const PRESET_COLORS = [
  '#4a7ab5', '#7b6ba8', '#a07842', '#3d8a66',
  '#5d5da0', '#9a8035', '#a35882', '#3a7f86',
  '#737a84', '#6b8a3d', '#8a6b3d', '#3d6b8a',
]

interface Props {
  value: string | null
  onChange: (color: string) => void
  onClose: () => void
}

export default function ColorPicker({ value, onChange, onClose }: Props) {
  const [custom, setCustom] = useState(value || '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 4,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      zIndex: 200, width: 180,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
        {PRESET_COLORS.map((color) => (
          <div
            key={color}
            onClick={() => { onChange(color); onClose() }}
            style={{
              width: 32, height: 32, borderRadius: 6, background: color, cursor: 'pointer',
              border: value === color ? '2px solid var(--text)' : '2px solid transparent',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="#hex"
          style={{
            flex: 1, fontSize: 11, padding: '3px 6px',
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          }}
        />
        <button
          onClick={() => { if (/^#[0-9a-fA-F]{6}$/.test(custom)) { onChange(custom); onClose() } }}
          style={{ fontSize: 11, padding: '3px 8px' }}
        >OK</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/tags/ColorPicker.tsx
git commit -m "feat(tags): create ColorPicker component"
```

---

### Task 14: Create TagManagerView

**Files:**
- Create: `packages/app/src/renderer/views/TagManagerView.tsx`

- [ ] **Step 1: Create the TagManagerView component**

```typescript
import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, Check, X } from 'lucide-react'
import ColorPicker from '../components/tags/ColorPicker.js'
import { useT } from '../i18n/index.js'

interface TagWithCount {
  id: string
  name: string
  color: string | null
  count: number
}

export default function TagManagerView() {
  const t = useT()
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'count'>('count')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadTags = useCallback(async () => {
    const list = await window.electronAPI.tags.listWithCounts()
    setTags(list)
  }, [])

  useEffect(() => { loadTags() }, [loadTags])

  const filtered = tags
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'count' ? b.count - a.count : a.name.localeCompare(b.name))

  const handleCreate = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    await window.electronAPI.tags.create({ name: trimmed })
    setNewName('')
    setShowCreate(false)
    await loadTags()
  }

  const handleRename = async (tagId: string) => {
    const trimmed = editValue.trim()
    if (!trimmed) return
    await window.electronAPI.tags.rename(tagId, trimmed)
    setEditingId(null)
    await loadTags()
  }

  const handleDelete = async (tagId: string) => {
    await window.electronAPI.tags.delete(tagId)
    setConfirmDeleteId(null)
    await loadTags()
  }

  const handleColorChange = async (tagId: string, color: string) => {
    await window.electronAPI.tags.updateColor(tagId, color)
    await loadTags()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{t('tags.manager')}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: 6, color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tags.search')}
              style={{
                fontSize: 12, padding: '4px 8px 4px 24px', width: 180,
                border: '1px solid var(--border)', borderRadius: 4,
                background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              }}
            />
          </div>
          <button onClick={() => setSortBy(sortBy === 'count' ? 'name' : 'count')}
            style={{ fontSize: 11, padding: '4px 8px' }}>
            {sortBy === 'count' ? t('tags.sortByName') : t('tags.sortByCount')}
          </button>
          <button onClick={() => setShowCreate(true)}
            style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} />{t('tags.newTag')}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          padding: '8px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false) }}
            placeholder={t('tags.name')}
            style={{
              fontSize: 12, padding: '4px 8px', flex: 1,
              border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
            }}
          />
          <button onClick={handleCreate} style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} />{t('common.confirm')}
          </button>
          <button onClick={() => { setShowCreate(false); setNewName('') }}
            style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={14} />{t('common.cancel')}
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px',
          padding: '10px 0', borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          <span>{t('tags.name')}</span>
          <span>{t('tags.color')}</span>
          <span style={{ textAlign: 'center' }}>{t('tags.count')}</span>
          <span style={{ textAlign: 'right' }}>{t('tags.actions')}</span>
        </div>

        {/* Table rows */}
        {filtered.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {t('tags.noTags')}
          </div>
        )}
        {filtered.map((tag) => (
          <div key={tag.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px',
            padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center',
            fontSize: 13,
          }}>
            {/* Name */}
            <div>
              {editingId === tag.id ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(tag.id); if (e.key === 'Escape') setEditingId(null) }}
                    style={{
                      fontSize: 12, padding: '2px 6px', flex: 1,
                      border: '1px solid var(--border)', borderRadius: 4,
                      background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                    }}
                  />
                  <span onClick={() => handleRename(tag.id)} style={{ cursor: 'pointer', color: 'var(--accent)', display: 'inline-flex' }}><Check size={14} /></span>
                  <span onClick={() => setEditingId(null)} style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={14} /></span>
                </div>
              ) : (
                <span>{tag.name}</span>
              )}
            </div>

            {/* Color */}
            <div style={{ position: 'relative' }}>
              <span
                onClick={() => setColorPickerId(colorPickerId === tag.id ? null : tag.id)}
                style={{
                  display: 'inline-block', width: 20, height: 20, borderRadius: 4,
                  background: tag.color || '#737a84', cursor: 'pointer',
                  border: '1px solid var(--border)',
                }}
              />
              {colorPickerId === tag.id && (
                <ColorPicker
                  value={tag.color}
                  onChange={(color) => handleColorChange(tag.id, color)}
                  onClose={() => setColorPickerId(null)}
                />
              )}
            </div>

            {/* Count */}
            <span style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{tag.count}</span>

            {/* Actions */}
            <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <span
                onClick={() => { setEditingId(tag.id); setEditValue(tag.name) }}
                title={t('tags.rename')}
                style={{ cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}
              ><Pencil size={14} /></span>
              {confirmDeleteId === tag.id ? (
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span onClick={() => handleDelete(tag.id)} style={{ cursor: 'pointer', color: '#c44040', fontSize: 11 }}>{t('common.confirm')}</span>
                  <span onClick={() => setConfirmDeleteId(null)} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}>{t('common.cancel')}</span>
                </span>
              ) : (
                <span
                  onClick={() => setConfirmDeleteId(tag.id)}
                  title={t('tags.delete')}
                  style={{ cursor: 'pointer', color: '#c44040', display: 'inline-flex' }}
                ><Trash2 size={14} /></span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npx tsc --noEmit -p packages/app/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/views/TagManagerView.tsx
git commit -m "feat(tags): create TagManagerView with search, rename, delete, color picker"
```

---

### Task 15: Integrate Tag Manager Tab into Tab System

**Files:**
- Modify: `packages/app/src/renderer/components/TitleBar.tsx:6`
- Modify: `packages/app/src/renderer/components/TabManager.tsx`

- [ ] **Step 1: Add tag-manager to Tab type**

In `packages/app/src/renderer/components/TitleBar.tsx`, change line 6:

```typescript
type: 'library' | 'document' | 'note'
```

to:

```typescript
type: 'library' | 'document' | 'note' | 'tag-manager'
```

- [ ] **Step 2: Add tag-manager icon in tab rendering**

In `TitleBar.tsx`, update the icon rendering (around line 161):

```typescript
<span className="title-bar-tab-icon">
  {tab.type === 'library' ? '📚' : tab.type === 'document' ? '📄' : tab.type === 'tag-manager' ? '🏷' : '📝'}
</span>
```

- [ ] **Step 3: Add TagManagerView import and routing to TabManager**

In `packages/app/src/renderer/components/TabManager.tsx`, add import:

```typescript
import TagManagerView from '../views/TagManagerView.js'
```

- [ ] **Step 4: Add openTagManager callback**

In `TabManager.tsx`, after the `openNote` callback, add:

```typescript
const openTagManager = useCallback(() => {
  const existingTab = tabs.find(t => t.type === 'tag-manager')
  if (existingTab) {
    setActiveTabId(existingTab.id)
    return
  }
  const tabId = 'tag-manager'
  const newTab: Tab = { id: tabId, type: 'tag-manager', title: t('tags.manager'), closable: true }
  setTabs(prev => [...prev, newTab])
  setActiveTabId(tabId)
}, [tabs, t])
```

- [ ] **Step 5: Pass openTagManager to LibraryView**

In the LibraryView rendering (around line 98-105), add the prop:

```typescript
<LibraryView
  rootPath={libraryPath}
  libraryName={libraryName}
  onOpenDoc={openDocument}
  onOpenNote={openNote}
  onOpenMindmap={openNote}
  onOpenGraph={() => {}}
  onOpenTagManager={openTagManager}
/>
```

- [ ] **Step 6: Add TagManagerView rendering in tab loop**

In the tabs rendering loop (around line 114-120), add:

```typescript
{tab.type === 'tag-manager' && (
  <TagManagerView />
)}
```

- [ ] **Step 7: Verify the app runs**

Run: `cd /Users/chixiao/Documents/work/research/newproject && npm run dev`
Test: Click ⚙ in sidebar tags section. Verify Tag Manager opens as a new tab. Verify singleton behavior (clicking ⚙ again focuses existing tab). Test rename, delete, color change.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/renderer/components/TitleBar.tsx packages/app/src/renderer/components/TabManager.tsx
git commit -m "feat(tags): integrate Tag Manager tab into tab system"
```
