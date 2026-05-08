# Tag System Design

## Goal

Add a complete tag system to Banjuan: hierarchical tags (via `/` separator), applicable to documents, notes, and mindmaps, with tag management UI, Library filtering, and in-editor tagging.

## Architecture

Extend the existing `TagService` and dual-persistence model (file + SQLite). Tags are flat strings with `/` as a hierarchy separator — no DB schema changes for hierarchy. UI parses `/` for display (show leaf name, tooltip full path). A shared `TagInput` component handles tag addition/removal across all surfaces.

## Data Model

### Tag Definition

```typescript
interface Tag {
  id: string
  name: string      // e.g. "方法论/GTD", "React"
  color: string     // hex color, auto-generated or user-overridden
}
```

- `name` uses `/` to express hierarchy: `方法论/GTD`, `项目/论文A/实验`
- DB stores flat string. UI layer parses `/` for display.
- `color` is auto-assigned on creation via name hash from a 12-color muted palette (consistent with existing TYPE_PILLS style). User can override.

### TagTarget

```typescript
type TagTarget = 'document' | 'note' | 'mindmap'
```

Extend from current `'document' | 'note'` to include `'mindmap'`.

### DB Schema

Existing tables (no changes):
- `tags (id TEXT PK, name TEXT UNIQUE, color TEXT)`
- `doc_tags (doc_id TEXT, tag_id TEXT, PK(doc_id, tag_id))`
- `note_tags (note_id TEXT, tag_id TEXT, PK(note_id, tag_id))`

New table:
- `mindmap_tags (mindmap_id TEXT, tag_id TEXT, PK(mindmap_id, tag_id))`

### File Storage

Unchanged — tags stored as `string[]` in:
- Document metadata: `.banjuan/data/documents/<id>.json` → `tags` field
- Note frontmatter: `.banjuan/notes/<id>.json` → `tags` field
- Mindmap meta: `.banjuan/notes/<id>.json` (type=mindmap) → `tags` field
- Tag definitions: `.banjuan/tags.json`

Dual persistence: write to both file and DB. File is source of truth for sync/recovery.

## Backend Changes

### TagService Additions

```typescript
class TagService {
  // Existing (fix mindmap support in tableMap):
  async create(input: { name: string; color?: string }): Promise<Tag>
  async list(): Promise<Tag[]>
  async assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void>
  async unassign(targetId: string, targetType: TagTarget, tagName: string): Promise<void>
  async forTarget(targetId: string, targetType: TagTarget): Promise<Tag[]>

  // New:
  async delete(tagId: string): Promise<void>          // cascade remove from all targets + files
  async rename(tagId: string, newName: string): Promise<void>  // cascade update files
  async updateColor(tagId: string, color: string): Promise<void>
  async getUsageCount(tagId: string): Promise<number>  // count across all target tables
  async listWithCounts(): Promise<(Tag & { count: number })[]>  // for sidebar + management
}
```

Fix: add `'mindmap'` to `tableMap` in `assign()`, `unassign()`, and `forTarget()`.

### Auto-Color Generation

```typescript
const PALETTE = [
  '#4a7ab5', '#7b6ba8', '#a07842', '#3d8a66',
  '#5d5da0', '#9a8035', '#a35882', '#3a7f86',
  '#737a84', '#6b8a3d', '#8a6b3d', '#3d6b8a',
]

function autoColor(name: string): string {
  const hash = name.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
```

Background for each color derived by mixing with white at 15% opacity (same pattern as TYPE_PILLS).

### IPC Layer

New handlers in `ipc.ts`:
- `tags:assign(targetId, targetType, tagNames)`
- `tags:unassign(targetId, targetType, tagName)`
- `tags:delete(tagId)`
- `tags:rename(tagId, newName)`
- `tags:updateColor(tagId, color)`
- `tags:listWithCounts()`

Corresponding preload API additions in `preload/index.ts`.

## UI Components

### 1. TagInput Component (Shared)

Reusable component for adding/removing tags on any content.

**Props:**
```typescript
interface TagInputProps {
  targetId: string
  targetType: TagTarget
}
```

**Behavior:**
- Displays current tags as colored pills with `x` remove button
- Pill shows leaf name only (last segment after `/`), hover tooltip shows full path
- `+` button / `+添加tag...` opens an input with autocomplete dropdown
- Autocomplete searches existing tags by full path (fuzzy match)
- Pressing Enter on non-existent name creates new tag immediately
- Supports `/` in input for creating hierarchical tags

**Used in:** Library detail panel, PDF reader toolbar area, note editor header, mindmap toolbar.

### 2. Library Sidebar Tag Section

Below existing Documents / Notes sections.

**Layout:**
```
Tags                          ⚙️
[🔍 搜索 tag...]
GTD (3)  卡片笔记 (2)  React (4)
论文A (5)  实验 (1)  ...
+12 more
```

**Behavior:**
- Tags displayed as pills, sorted by usage count descending
- Default shows top N (e.g. 10) tags, `+N more` expands to show all
- Search box: fuzzy match on full tag path, real-time filter
- Click tag → filter main list to show all content with that tag (cross-type: documents + notes + mindmaps)
- Click again → deselect, clear filter
- Selected tag highlighted with stronger background
- ⚙️ icon opens Tag Manager tab

### 3. Library List Tag Display

In the table row, below the title text (same cell, second line):
- Show content's tags as small pills
- Max 3 visible, `+N` for overflow
- Pill style: colored background + text, consistent with TYPE_PILLS
- Leaf name only, hover for full path

### 4. Tag Manager Tab

**Tab integration:**
- `Tab.type` adds `'tag-manager'`
- Singleton: clicking ⚙️ when tab exists focuses it instead of creating new
- Tab icon: `🏷` or Tag lucide icon
- Title: i18n `tags.manager`

**Page layout:**
```
Tag 管理                         [🔍 搜索] [+ 新建]
──────────────────────────────────────────────────
名称              颜色    关联数   操作
方法论/GTD        ●       3      ✏️ 🗑
方法论/卡片笔记    ●       2      ✏️ 🗑
项目/论文A        ●       5      ✏️ 🗑
React            ●       4      ✏️ 🗑
```

**Features:**
- Table with columns: full name, color pill, usage count, actions
- Search: fuzzy match on name
- New: input for name + optional color picker (defaults to auto-color)
- Rename (✏️): inline editing, Enter to confirm. Cascades to all targets.
- Delete (🗑): confirmation dialog. Removes from all targets.
- Color: click color pill → popover with preset palette (12 colors) + custom hex input
- Sort: by name (alpha) or by count (desc)

### 5. In-Editor Tag Areas

**PDF Reader (`DocumentView`):**
- Tag row below toolbar, above PDF content
- Uses `TagInput` component with `targetType='document'`

**Note Editor (`NoteView`):**
- Tag row below toolbar, above editor content
- Uses `TagInput` with `targetType='note'` (covers both markdown and handwriting notes)

**Mindmap (`NoteView` with type=mindmap):**
- Tag row below toolbar, above canvas
- Uses `TagInput` with `targetType='mindmap'`

## Implementation Phases

### Phase 1: Backend Completion
- Fix `TagTarget` type to include `'mindmap'`
- Add `mindmap_tags` table
- Fix `TagService` tableMap for mindmap
- Add `delete`, `rename`, `updateColor`, `listWithCounts` methods
- Add missing IPC handlers and preload API
- Auto-color generation

### Phase 2: TagInput Component + Library Detail Panel
- Build `TagInput` shared component (pills, autocomplete, create-on-type)
- Wire into Library detail panel

### Phase 3: Library Sidebar Tags
- Tag section with pill list, search, click-to-filter
- Wire filtering into list query

### Phase 4: Library List Tag Pills
- Show tag pills on each row in the table

### Phase 5: In-Editor Tag Areas
- Add tag row to PDF reader, note editor, mindmap toolbar

### Phase 6: Tag Manager Tab
- New tab type, singleton behavior
- Full management UI (table, rename, delete, color picker)

## i18n Keys

```
tags.title: "Tags" / "标签"
tags.search: "Search tags..." / "搜索标签..."
tags.addTag: "Add tag..." / "添加标签..."
tags.manager: "Tag Manager" / "标签管理"
tags.newTag: "New Tag" / "新建标签"
tags.rename: "Rename" / "重命名"
tags.delete: "Delete" / "删除"
tags.deleteConfirm: "Delete tag \"{name}\"? It will be removed from all items." / "删除标签「{name}」？将从所有内容中移除。"
tags.color: "Color" / "颜色"
tags.count: "Items" / "关联数"
tags.more: "+{n} more" / "+{n} 更多"
```
