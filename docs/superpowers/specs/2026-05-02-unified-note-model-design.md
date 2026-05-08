# 统一笔记模型设计

## 核心理念

所有用户创建的内容都是"笔记"，只是类型不同：

| 类型 | 说明 | 编辑器 |
|------|------|--------|
| `markdown` | 块编辑器笔记（现有） | BlockEditor |
| `mindmap` | 思维导图 | React Flow + MindmapCanvas |
| 未来: `handwriting` | 手写笔记 | Canvas |
| 未来: `whiteboard` | 白板 | tldraw 等 |
| 未来: `kanban` | 看板 | 拖拽列表 |

## 现状分析

### 当前两套平行系统

```
notes 表          mindmaps 表
├── NoteService    ├── MindmapService
├── notes:* IPC    ├── mindmaps:* IPC
├── .banjuan/notes/├── .banjuan/mindmaps/
├── FolderTree     ├── (独立的目录系统)
├── NoteView       ├── MindmapView
└── note_links     └── (无法参与双链)
```

**问题：**
1. 脑图无法参与 note_links 双链系统
2. 标签、文件夹、搜索需要对两个系统各实现一次
3. LibraryView 维护两套独立的 state（noteDirs / mindmapDirs）
4. 代码量翻倍，维护成本高

### 统一后

```
notes 表 (type 字段区分)
├── NoteService (统一)
├── notes:* IPC (统一，部分按 type 路由)
├── .banjuan/notes/ (统一目录)
├── FolderTree (统一展示所有类型)
├── TabManager 按 type 路由到不同编辑器
└── note_links (天然支持所有类型互链)
```

## 数据模型变更

### notes 表

```sql
-- 新增字段
ALTER TABLE notes ADD COLUMN type TEXT NOT NULL DEFAULT 'markdown';
-- 'markdown' | 'mindmap' | 'handwriting' | ...

-- mindmap 特有属性（JSON 存储，避免加太多列）
ALTER TABLE notes ADD COLUMN type_meta TEXT;
-- mindmap 的 type_meta: {"layout": "mindmap", "theme": "classic"}
```

**迁移后的 notes 表结构：**

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'markdown',
    path TEXT NOT NULL,
    doc_id TEXT,
    folder_id TEXT,
    content_format TEXT DEFAULT 'json',
    type_meta TEXT,          -- 类型特有的元数据 (JSON)
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES folders(id)
);
```

### mindmap_nodes / mindmap_edges 表

**保持不动**，只改外键：

```sql
-- mindmap_id 改为指向 notes.id
ALTER TABLE mindmap_nodes RENAME COLUMN mindmap_id TO note_id_owner;
-- 实际操作: 新建表 + 迁移数据（SQLite 不支持 ALTER FOREIGN KEY）
```

不改列名，仍叫 `mindmap_id`，但值指向 notes 表的 id。外键约束更新：

```sql
FOREIGN KEY (mindmap_id) REFERENCES notes(id)
```

### note_links 表

**无需改动！** 因为统一后 source_id 和 target_id 都是 notes.id，天然支持：
- markdown 笔记 ↔ markdown 笔记
- markdown 笔记 ↔ mindmap
- mindmap ↔ mindmap

### 文件存储

统一到 `.banjuan/notes/` 目录：

```
.banjuan/notes/
├── abc123.json          # markdown 笔记的 metadata
├── abc123.content.json  # markdown 笔记的 BlockNote 内容
├── def456.json          # mindmap 笔记的 metadata
├── def456.content.json  # mindmap 的 nodes + edges JSON
├── research/
│   ├── ghi789.json
│   └── ghi789.content.json
```

mindmap 的 content 文件格式（原 MindmapFileData 的子集）：

```json
{
  "nodes": [...],
  "edges": [...]
}
```

## 类型定义变更

```typescript
// 笔记类型
export type NoteType = 'markdown' | 'mindmap'

// 统一的 Note 接口
export interface Note {
  id: string
  title: string
  type: NoteType
  path: string
  docId: string | null
  folderId: string | null
  content: string            // markdown: BlockNote JSON, mindmap: nodes+edges JSON
  contentFormat: 'json' | 'markdown'
  typeMeta: Record<string, unknown> | null  // mindmap: {layout, theme}
  createdAt: string
  updatedAt: string
}

// 创建输入
export interface NoteCreateInput {
  title: string
  type?: NoteType            // 默认 'markdown'
  docId?: string
  folderId?: string
  folder?: string
  annotationIds?: string[]
  content?: string
  templateId?: string
  // mindmap 特有
  layout?: string
  theme?: string
}

// 列表过滤
export interface NoteListOptions {
  type?: NoteType            // 按类型过滤
  docId?: string
  folderId?: string
  tag?: string
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
}

// Mindmap 相关类型保持不变
export interface MindmapNode { ... }  // mindmapId 值改为 note.id
export interface MindmapEdge { ... }
```

删除的类型：
- ~~`Mindmap`~~ → 合并到 `Note`（type='mindmap'）
- ~~`MindmapCreateInput`~~ → 合并到 `NoteCreateInput`
- ~~`MindmapFileData`~~ → 内容部分保留为 mindmap content 格式

## 服务层变更

### NoteService 扩展

```typescript
class NoteService {
  // 现有方法全部保留，create/list/get 增加 type 支持
  
  async create(input: NoteCreateInput): Promise<Note> {
    // type 默认 'markdown'
    // 如果 type === 'mindmap'，type_meta 存 {layout, theme}
    // 内容文件格式根据 type 不同
  }
  
  async list(options?: NoteListOptions): Promise<Note[]> {
    // 支持 type 过滤: WHERE type = ?
  }
  
  async update(id, updates): Promise<Note> {
    // 新增 typeMeta 更新支持
  }
}
```

### MindmapService 精简

```typescript
class MindmapService {
  // 删除: create, list, get, update, delete, move, listDirs, createDir, renameDir
  // (这些都由 NoteService 统一处理)
  
  // 保留: 节点和边的操作（这些是 mindmap 特有的子结构）
  async addNode(noteId: string, input: MindmapNodeCreateInput): Promise<MindmapNode>
  async getNodes(noteId: string): Promise<MindmapNode[]>
  async updateNode(id: string, updates: ...): Promise<MindmapNode>
  async removeNode(id: string): Promise<void>
  async findNodesByNoteId(noteId: string): Promise<...>
  
  async addEdge(noteId: string, input: ...): Promise<MindmapEdge>
  async getEdges(noteId: string): Promise<MindmapEdge[]>
  async removeEdge(id: string): Promise<void>
}
```

### Library 类

```typescript
class Library {
  notes: NoteService      // 统一的笔记服务
  mindmapNodes: MindmapService  // 仅处理节点/边操作
  noteLinks: NoteLinkService    // 天然支持所有笔记类型
  // ...
}
```

## IPC 变更

### 删除的 IPC（由 notes:* 统一处理）

```
mindmaps:create    → notes:create (type: 'mindmap')
mindmaps:list      → notes:list (type: 'mindmap')
mindmaps:get       → notes:get
mindmaps:update    → notes:update
mindmaps:delete    → notes:delete
mindmaps:move      → notes:move
mindmaps:listDirs  → notes:listDirs
mindmaps:createDir → notes:createDir
mindmaps:renameDir → notes:renameDir
```

### 保留的 IPC（mindmap 节点/边操作）

```
mindmaps:addNode
mindmaps:getNodes
mindmaps:updateNode
mindmaps:removeNode
mindmaps:findNodesByNoteId
mindmaps:addEdge
mindmaps:getEdges
mindmaps:removeEdge
```

### notes:create 变更

```typescript
// 旧
notes:create({ title, folder, templateId })

// 新: 支持 type 参数
notes:create({ title, type: 'mindmap', folder, layout: 'mindmap', theme: 'classic' })
```

### notes:list 变更

```typescript
// 列出所有笔记
notes:list()

// 只列出 markdown 笔记
notes:list({ type: 'markdown' })

// 只列出脑图
notes:list({ type: 'mindmap' })
```

### notes:update 变更

```typescript
// mindmap 特有属性通过 typeMeta 更新
notes:update(id, { typeMeta: { layout: 'logical', theme: 'dark' } })
```

## 前端变更

### TabManager

```typescript
// 现在
{tab.type === 'note' && <NoteView ... />}
{tab.type === 'mindmap' && <MindmapView ... />}

// 改为: 统一用 note tab，按 note.type 路由
{tab.type === 'note' && tabData.noteType === 'markdown' && <NoteView ... />}
{tab.type === 'note' && tabData.noteType === 'mindmap' && <MindmapView ... />}
```

`openNote` 和 `openMindmap` 合并为一个方法：

```typescript
const openNote = useCallback((note: { id: string; title: string; type: NoteType }) => {
  const tabId = `note-${note.id}`
  // ...
}, [])
```

### LibraryView

- 删除独立的 mindmaps state（`mindmapItems`, `mindmapDirs`, `selectedMindmapDir`）
- 笔记和脑图共享同一个列表，用图标区分类型
- "笔记" sidebar section 改为展示所有类型，可选过滤
- 或拆分为 "全部笔记" / "Markdown" / "脑图" 子 tab

### FolderTree

- 统一显示所有类型的笔记
- 用图标区分：📝 markdown, 🧠 mindmap
- 新建笔记时弹出类型选择

### BacklinksPanel

- 不再需要单独的 `findNodesByNoteId` 查询
- `note_links` 天然包含所有类型间的引用
- 反向链接列表按来源类型显示不同图标

### MindmapView

- 不再接收独立的 `mindmap` 对象，而是接收 `note` 对象
- 从 `note.typeMeta` 读取 layout 和 theme
- `mindmapId` 参数改为 `noteId`

## 数据迁移

### 迁移脚本

```sql
-- 1. notes 表加字段
ALTER TABLE notes ADD COLUMN type TEXT NOT NULL DEFAULT 'markdown';
ALTER TABLE notes ADD COLUMN type_meta TEXT;

-- 2. 把 mindmaps 数据迁移到 notes 表
INSERT INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at)
SELECT 
  id, title, 'mindmap', path, doc_id, NULL, 'json',
  json_object('layout', layout, 'theme', COALESCE(theme, 'classic')),
  created_at, updated_at
FROM mindmaps;

-- 3. 文件系统迁移: 把 .banjuan/mindmaps/*.json 移到 .banjuan/notes/

-- 4. mindmap_nodes.note_id 字段（引用其他笔记）保持不变
--    mindmap_nodes.mindmap_id 的值现在指向 notes 表的 id

-- 5. 从 mindmap 节点内容中提取 noteLinks 并同步
--    遍历 mindmap_nodes.content，解析 JSON，提取 noteLink 引用
--    写入 note_links 表（source_id = mindmap 的 note.id, target_id = 被引用的 note.id）

-- 6. 迁移 tag_targets: 把 target_type = 'mindmap' 改为 target_type = 'note'
UPDATE tag_targets SET target_type = 'note' WHERE target_type = 'mindmap';

-- 7. 删除旧表（确认迁移完成后）
DROP TABLE mindmaps;
```

### 迁移安全

- 迁移前自动备份 db.sqlite
- 迁移在事务中执行，失败回滚
- 版本号记录在 config.json，避免重复迁移

## noteLinks 同步策略

### Markdown 笔记（现有逻辑不变）

BlockEditor 保存时提取 `[[wikilink]]`，调用 `noteLinks:sync(noteId, links)`。

### Mindmap 笔记（新增）

两个来源的链接需要同步：

1. **节点内容中的 `[[wikilink]]`**：NodeContentEditor 保存节点内容时，提取 noteLink 引用
2. **节点的 `noteId` 字段**：节点直接关联的笔记

同步时机：节点内容变更或 noteId 变更时，聚合该 mindmap 所有节点的链接，调用 `noteLinks:sync(mindmapNoteId, allLinks)`。

```typescript
// MindmapService 新增方法
async syncLinks(noteId: string): Promise<void> {
  const nodes = await this.getNodes(noteId)
  const links: LinkSyncEntry[] = []
  
  for (const node of nodes) {
    // 1. 节点直接关联的笔记
    if (node.noteId) {
      links.push({ targetId: node.noteId, context: node.title })
    }
    // 2. 节点内容中的 [[wikilink]]
    if (node.content) {
      const contentLinks = extractNoteLinksFromContent(node.content)
      links.push(...contentLinks)
    }
  }
  
  // 去重后同步
  await this.noteLinks.sync(noteId, dedup(links))
}
```

## 不变的部分

- `mindmap_nodes` 和 `mindmap_edges` 表结构（只改外键目标）
- MindmapCanvas、NodeShell、所有节点组件
- useMindmapStore 状态管理
- 布局引擎、主题系统
- BlockEditor
- 附件系统

## 实施顺序

### Phase 1: 数据层统一（core 包）
1. notes 表加 `type` + `type_meta` 字段
2. NoteService 扩展支持 type
3. MindmapService 精简（删除 CRUD，保留节点/边操作）
4. 数据迁移脚本
5. noteLinks 同步逻辑

### Phase 2: IPC 层适配
6. 统一 IPC handler（mindmaps CRUD → notes）
7. 更新 preload + electron.d.ts
8. 保持旧 IPC 别名兼容（过渡期）

### Phase 3: 前端适配
9. TabManager 统一 openNote
10. LibraryView 合并列表
11. FolderTree 支持多类型
12. MindmapView 接收 note 对象
13. BacklinksPanel 简化（去掉 findNodesByNoteId hack）
