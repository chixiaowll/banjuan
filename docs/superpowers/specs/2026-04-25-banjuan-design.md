# 半卷闲书 (Banjuan) — 设计文档

> "腹有诗书气自华"

集书籍资料管理、阅读、标注、笔记、知识整理于一体的学习软件。

## 1. 概述

### 1.1 目标

构建一个离线优先的桌面学习应用，融合 Zotero（文献管理）、Obsidian（Markdown 笔记）、GoodNotes（标注）、MarginNote（阅读+笔记整理）的核心能力。

### 1.2 核心需求

- 文档库管理（多格式：PDF、EPUB、TXT、Markdown、图片、视频等）
- 阅读器/查看器（按文档类型适配渲染）
- 标注系统（高亮、批注、书签、手写标注）
- Markdown 笔记（与标注联动、双向链接）
- 知识组织（标签、文件夹、知识图谱）
- 插件扩展系统（JS/TS 插件）
- CLI 接口（人类可读 + JSON 输出，完整操控）
- Chrome 扩展（一键保存网页/文件到书房）
- 便携迁移（拷贝目录即可在另一台设备使用）

### 1.3 MVP 范围

第一阶段：基础框架 + 文档库 + 阅读器 + 标注 + 笔记

第二阶段：知识图谱 + 插件系统 + CLI

## 2. 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面框架 | Electron | Obsidian/Zotero 验证的成熟方案 |
| 前端框架 | React + TypeScript | 生态最大，复杂 UI 组件丰富 |
| 核心层 | Node.js + TypeScript | 纯库，无 UI 依赖 |
| 数据库 | SQLite (better-sqlite3) | 零外部依赖，单文件，便携 |
| PDF 渲染 | PDF.js | Mozilla 开源，业界标准 |
| EPUB 渲染 | epub.js | 成熟 EPUB 渲染库 |
| Markdown 渲染 | Milkdown (ProseMirror) | 插件化，所见即所得，兼做笔记编辑器 |
| 手写标注 | perfect-freehand + Canvas | 压感笔迹平滑渲染 |
| 图片查看 | React 内置 + 标注 canvas | 支持缩放、旋转、标注 |
| 视频播放 | HTML5 Video | 原生支持 MP4/MOV/WebM |
| 知识图谱 | D3.js force-directed | 灵活、可定制 |
| CLI 框架 | Commander.js | 标准 Node.js CLI 框架 |
| Chrome 扩展 | Chrome Extension (Manifest V3) | 一键保存网页到书房 |
| 包管理 | pnpm workspace | Monorepo 管理 |

### 2.1 支持的文档类型

| 类别 | 格式 | 查看器 | 可标注 |
|---|---|---|---|
| 文档 | PDF | PDF.js | 文本高亮、区域标注 |
| 电子书 | EPUB | epub.js | 文本高亮 |
| 文本 | TXT | 纯文本渲染 | 文本高亮 |
| Markdown | MD | Milkdown 渲染 | 文本高亮 |
| 图片 | JPG, PNG, WEBP, GIF | 图片查看器 | 区域标注（矩形/自由画笔） |
| 视频 | MOV, MP4, WebM | HTML5 Video | 时间点标注（时间戳+截图） |
| 网页 | HTML (Chrome 扩展保存) | 内置 webview | 文本高亮 |

插件可注册新的文档类型和对应查看器。

## 3. 架构：核心+壳模式

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────┐
│                       用户                            │
│   ┌──────────┐  ┌──────────┐  ┌───────────────┐     │
│   │ 桌面应用  │  │   CLI    │  │ Chrome 扩展    │     │
│   │ Electron  │  │ Commander│  │ Manifest V3   │     │
│   │ + React   │  │          │  │               │     │
│   └─────┬─────┘  └─────┬────┘  └───────┬───────┘     │
│         │              │            (HTTP API)        │
│         │              │               │              │
│         ┌─────┴──────────────┴──────────┴────┐    │
│         │        @banjuan/plugin-api          │    │
│         │           插件 API 层               │    │
│         └──────────────┬─────────────────────┘    │
│                        │                          │
│         ┌──────────────┴─────────────────────┐    │
│         │         @banjuan/core               │    │
│         │  library | documents | annotations  │    │
│         │  notes | tags | search | db         │    │
│         └──────────────┬─────────────────────┘    │
│                        │                          │
│         ┌──────────────┴─────────────────────┐    │
│         │      用户数据目录（书房）            │    │
│         │      SQLite + 文件系统              │    │
│         └────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### 3.2 Monorepo 结构

```
banjuan/
├── packages/
│   ├── core/            # 纯 Node.js 核心库
│   │   ├── src/
│   │   │   ├── library/       # 书房管理
│   │   │   ├── documents/     # 文档 CRUD、导入、元数据提取
│   │   │   ├── annotations/   # 标注 CRUD
│   │   │   ├── notes/         # 笔记 CRUD、Markdown 读写
│   │   │   ├── mindmaps/     # 脑图 CRUD、节点/边管理
│   │   │   ├── tags/          # 标签管理
│   │   │   ├── search/        # 全文搜索 (FTS5)
│   │   │   └── db/            # SQLite 连接、迁移、事务
│   │   └── package.json
│   ├── cli/             # CLI 工具
│   │   ├── src/
│   │   │   └── commands/      # doc, ann, note, tag, search, plugin
│   │   └── package.json
│   ├── app/             # Electron + React 桌面应用
│   │   ├── src/
│   │   │   ├── main/          # Electron 主进程（含本地 HTTP API 供 Chrome 扩展调用）
│   │   │   ├── renderer/      # React 渲染进程
│   │   │   │   ├── components/
│   │   │   │   ├── views/     # 各类查看器（PDF、EPUB、图片、视频、文本等）
│   │   │   │   └── hooks/
│   │   │   └── preload/
│   │   └── package.json
│   ├── plugin-api/      # 插件 SDK
│   │   ├── src/
│   │   └── package.json
│   └── chrome-extension/  # Chrome 扩展
│       ├── manifest.json    # Manifest V3
│       ├── popup/           # 弹窗 UI
│       ├── background/      # Service Worker
│       └── content/         # Content Script（抓取网页内容）
├── package.json         # pnpm workspace root
├── pnpm-workspace.yaml
└── tsconfig.json
```

## 4. 数据层

### 4.1 用户数据目录（书房）

```
my-library/
├── .banjuan/
│   ├── db.sqlite          # 元数据、标注、标签关系
│   ├── config.json        # 书房配置
│   └── plugins/           # 已安装插件
├── documents/             # 原始文档（PDF、EPUB）
│   ├── paper-abc.pdf
│   └── book-xyz.epub
└── notes/                 # Markdown 笔记
    ├── paper-abc/
    │   └── chapter1.md
    └── daily/
        └── 2026-04-25.md
```

设计原则：
- `documents/` 和 `notes/` 对人和 LLM 直接可读（cat、grep 友好）
- SQLite 存结构化数据（标注坐标、标签关系、搜索索引）
- 整个目录拷贝到另一台机器即可使用
- 笔记是纯 Markdown，无半卷闲书也可用任何编辑器打开

### 4.2 SQLite Schema

```sql
-- 文档
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    authors TEXT,           -- JSON array
    path TEXT NOT NULL,     -- 相对于 documents/ 的路径
    type TEXT NOT NULL,     -- 'pdf' | 'epub' | 'txt' | 'md' | 'image' | 'video' | 'html'
    hash TEXT NOT NULL,     -- 文件内容 hash，用于去重
    metadata TEXT,          -- JSON，扩展元数据
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 标注
CREATE TABLE annotations (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id),
    type TEXT NOT NULL,     -- 'highlight' | 'note' | 'bookmark' | 'ink'
    page INTEGER,           -- PDF 页码，EPUB 为 null
    position TEXT NOT NULL, -- JSON，PDF 坐标或 EPUB CFI
    content TEXT,           -- 批注内容
    selected_text TEXT,     -- 被选中的原文
    color TEXT DEFAULT 'yellow',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 笔记
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    path TEXT NOT NULL,     -- 相对于 notes/ 的路径
    doc_id TEXT REFERENCES documents(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 笔记-标注关联（多对多）
CREATE TABLE note_annotations (
    note_id TEXT NOT NULL REFERENCES notes(id),
    annotation_id TEXT NOT NULL REFERENCES annotations(id),
    PRIMARY KEY (note_id, annotation_id)
);

-- 标签
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

-- 文档-标签（多对多）
CREATE TABLE doc_tags (
    doc_id TEXT NOT NULL REFERENCES documents(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (doc_id, tag_id)
);

-- 笔记-标签（多对多）
CREATE TABLE note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (note_id, tag_id)
);

-- 全文搜索
CREATE VIRTUAL TABLE search_index USING fts5(
    title, content, type,   -- type: 'document' | 'note' | 'annotation'
    content_rowid=rowid,
    tokenize='unicode61'    -- 生产环境可换 ICU tokenizer 支持中文分词
);
```

### 4.3 标注定位格式

```typescript
// PDF 标注
interface PdfPosition {
    type: 'pdf'
    page: number
    rects: Array<{ x: number; y: number; w: number; h: number }>
    text: string
}

// EPUB 标注
interface EpubPosition {
    type: 'epub'
    cfi: string             // EPUB CFI 定位符
    text: string
}

// 文本文件标注（TXT、MD、HTML）
interface TextPosition {
    type: 'text'
    startOffset: number     // 字符偏移起始
    endOffset: number       // 字符偏移结束
    text: string
}

// 图片标注
interface ImagePosition {
    type: 'image'
    rect: { x: number; y: number; w: number; h: number }  // 区域标注
    path?: Array<{ x: number; y: number }>                  // 自由画笔路径（可选）
}

// 视频标注
interface VideoPosition {
    type: 'video'
    timestamp: number       // 秒
    duration?: number       // 标注覆盖的时长（可选）
    thumbnail?: string      // 截图文件路径
}

// 手写标注（ink）— 适用于所有文档类型
interface InkPosition {
    type: 'ink'
    page?: number                              // PDF 页码（可选）
    strokes: Array<{
        points: Array<{ x: number; y: number; pressure?: number; timestamp?: number }>
        color: string
        width: number
    }>
    bounds: { x: number; y: number; w: number; h: number }  // 笔迹包围盒
}

type AnnotationPosition = PdfPosition | EpubPosition | TextPosition | ImagePosition | VideoPosition | InkPosition
```

## 5. Core 层 API

### 5.1 入口

```typescript
import { Library } from '@banjuan/core'

const library = await Library.open('/path/to/my-library')
// 如果目录不存在 .banjuan/，抛出错误
// 使用 Library.init('/path') 创建新书房
```

### 5.2 文档操作

```typescript
// 导入（复制文件到 documents/，提取元数据，写入 SQLite）
const doc = await library.documents.import('/tmp/paper.pdf')

// 列表查询
const docs = await library.documents.list({ tag: '机器学习', sort: 'created_at' })

// 详情
const doc = await library.documents.get(id)

// 删除（从 SQLite 和文件系统同时移除）
await library.documents.delete(id)
```

### 5.3 标注操作

```typescript
const ann = await library.annotations.create({
    docId: doc.id,
    type: 'highlight',
    page: 3,
    position: { type: 'pdf', page: 3, rects: [...], text: '原文' },
    content: '我的批注',
    color: 'yellow'
})

const anns = await library.annotations.list({ docId: doc.id, page: 5 })
await library.annotations.update(ann.id, { color: 'red' })
await library.annotations.delete(ann.id)
```

### 5.4 脑图操作

```typescript
// 创建脑图
const map = await library.mindmaps.create({
    title: '注意力机制概念图',
    docId: doc.id,
    layout: 'tree'
})

// 添加节点（从标注创建）
const node = await library.mindmaps.addNode(map.id, {
    title: '自注意力',
    annotationId: ann.id,
    content: '每个位置关注所有位置'
})

// 添加子节点
const child = await library.mindmaps.addNode(map.id, {
    parentId: node.id,
    title: 'Q、K、V 矩阵'
})

// 添加关系边
await library.mindmaps.addEdge(map.id, {
    sourceId: node.id,
    targetId: otherNode.id,
    label: '组成'
})

// 列出文档的所有脑图
const maps = await library.mindmaps.list({ docId: doc.id })

// 导出
await library.mindmaps.export(map.id, { format: 'markdown' })  // 或 'opml' | 'svg' | 'png'
```

### 5.5 笔记操作

```typescript
const note = await library.notes.create({
    title: '论文笔记',
    docId: doc.id,
    annotationIds: [ann.id],
    content: '# 要点\n\n这篇论文提出了...'
})

const note = await library.notes.get(id)
await library.notes.update(id, { content: '...' })
const notes = await library.notes.list({ docId: doc.id })
```

### 5.5 搜索

```typescript
const results = await library.search.query('transformer attention')
// 返回: Array<{ type: 'document'|'note'|'annotation', id, title, snippet, score }>

const results = await library.search.query('transformer', { type: 'note' })
```

### 5.6 标签

```typescript
await library.tags.create({ name: '机器学习', color: 'blue' })
await library.tags.assign(doc.id, 'document', ['机器学习', '注意力机制'])
const tags = await library.tags.list()
const docs = await library.documents.list({ tag: '机器学习' })
```

## 6. 阅读器/查看器

按文档类型适配不同的查看器，统一的标注交互。

### 6.1 PDF 阅读器

- 基于 PDF.js
- 渲染模式：连续滚动 / 单页
- 功能：缩放、目录导航、页面跳转、文本搜索
- 文本选择层独立于渲染层，用于高亮和选词

### 6.2 EPUB 阅读器

- 基于 epub.js
- 功能：章节导航、自定义字体/字号/行距、亮/暗主题
- 定位使用 EPUB CFI 标准，精确到字符级

### 6.3 文本/Markdown 查看器

- TXT：纯文本渲染，支持文本选中高亮
- Markdown：Milkdown 只读渲染模式（与笔记编辑器共用同一组件）
- HTML（网页快照）：内置 webview 渲染，支持文本选中高亮

### 6.4 图片查看器

- 支持 JPG、PNG、WEBP、GIF
- 功能：缩放、旋转、适应窗口
- 标注：矩形区域选择、自由画笔（canvas overlay 层）

### 6.5 视频播放器

- 基于 HTML5 Video，支持 MP4、MOV、WebM
- 功能：播放/暂停、进度条、倍速、全屏
- 标注：在当前时间点添加标注，自动截取缩略图

### 6.6 标注交互

文本类文档（PDF、EPUB、TXT、MD、HTML）：
```
用户选中文本 → 弹出浮动工具条 → 选择操作：
  ├── 高亮（选颜色）→ core.annotations.create()
  ├── 批注（写评论）→ core.annotations.create() + content
  └── 创建笔记     → 打开笔记编辑器，自动关联此标注
```

图片：
```
用户框选区域 / 画笔标注 → 弹出工具条 → 添加批注 / 创建笔记
```

视频：
```
用户在某时间点点击"标注" → 自动截图 → 写批注 / 创建笔记
```

手写标注（所有文档类型通用）：
```
切换到手写模式（工具栏笔形图标）→ 在文档上自由书写/绘画 → 自动保存
```

### 6.8 手写标注系统

基于 canvas overlay 层，覆盖在所有查看器之上：

- **输入支持**：鼠标、触控屏、Apple Pencil / 手写笔（支持压感）
- **工具**：钢笔、荧光笔、橡皮擦、直线、矩形、箭头
- **属性**：颜色、粗细、透明度
- **渲染**：基于 SVG path 或 Canvas 2D，使用 [perfect-freehand](https://github.com/steveruizok/perfect-freehand) 做笔迹平滑和压感渲染
- **存储**：笔迹数据（点坐标 + 压感 + 时间戳）存入 SQLite annotations 表，type 为 `ink`
- **分层**：手写层独立于文档渲染层，不修改原文件，可单独显示/隐藏
- **性能**：大量笔迹时，已完成的笔画光栅化为位图缓存，只有当前活跃笔画实时渲染

### 6.7 标注侧边栏

- 阅读器右侧常驻面板
- 按页码/章节/时间点分组显示当前文档所有标注
- 点击标注跳转到对应位置
- 每条标注可展开查看关联笔记
- 支持筛选（按颜色、按类型）

## 7. 笔记系统

### 7.1 编辑器

- 基于 Milkdown（ProseMirror 内核）
- 所见即所得 + 源码模式切换
- 支持：标准 Markdown、KaTeX 数学公式、代码高亮、表格、任务列表

### 7.2 标注引用

笔记中通过特殊语法引用标注：

```markdown
> [!annotation](ann://a1b2c3)
> 这是高亮的原文内容

我的理解：这里其实是在说...
```

- `ann://id` 点击跳转到阅读器对应位置
- 渲染为带颜色的引用块，附文档名和页码
- 纯文本打开时也可读

### 7.3 双向链接

```markdown
这个概念和 [[attention-mechanism]] 相关
```

- 自动补全已有笔记标题
- 反向链接面板：显示哪些笔记引用了当前笔记

### 7.4 脑图笔记（MarginNote 模式）

类似 MarginNote 的学习笔记本，将标注和想法组织为思维导图：

- **一个文档可创建多个脑图** — 比如一本书可以有"章节结构脑图"、"核心概念脑图"、"待解决问题脑图"
- **节点来源多样**：
  - 从阅读器拖拽标注到脑图（自动创建节点，保留原文链接）
  - 手动添加空白节点
  - 从其他笔记引用
- **节点内容**：标题 + 富文本备注（Markdown）+ 关联标注引用
- **布局**：自动布局（树形/辐射形）+ 手动自由拖拽调整
- **交互**：
  - 双击节点编辑内容
  - 拖拽连线建立关系
  - 点击标注引用跳回阅读器对应位置
  - 折叠/展开子树
  - 节点着色和标签

**脑图存储：**

```typescript
// SQLite 新增表
CREATE TABLE mindmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    doc_id TEXT REFERENCES documents(id),  -- 关联文档（可选，脑图也可独立存在）
    layout TEXT DEFAULT 'tree',            -- 'tree' | 'radial' | 'free'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id),
    parent_id TEXT REFERENCES mindmap_nodes(id),  -- 树形结构
    annotation_id TEXT REFERENCES annotations(id), -- 关联标注（可选）
    title TEXT NOT NULL,
    content TEXT,           -- Markdown 备注
    color TEXT,
    position_x REAL,        -- 手动布局坐标
    position_y REAL,
    sort_order INTEGER,     -- 同级节点排序
    collapsed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE mindmap_edges (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id),
    source_id TEXT NOT NULL REFERENCES mindmap_nodes(id),
    target_id TEXT NOT NULL REFERENCES mindmap_nodes(id),
    label TEXT,             -- 关系标签
    style TEXT              -- 线条样式
);
```

**文件导出：** 脑图可导出为 Markdown 大纲（保持层级）、OPML、或 PNG/SVG 图片。

**渲染：** 基于 D3.js 树形布局 + 自定义力导向算法，支持平滑缩放和动画。

### 7.5 知识图谱

自动生成的全局关系图，与手动创建的脑图互补：

- D3.js force-directed graph
- 节点 = 笔记 + 文档 + 脑图
- 边 = 双向链接 + 标注关联 + 脑图连线
- 支持缩放、拖拽、按标签着色、点击打开
- 数据从 SQLite 实时查询，不额外存储图结构

## 8. 插件系统

### 8.1 插件结构

```
my-plugin/
├── package.json      # name, version, banjuan.apiVersion
├── manifest.json     # 权限声明、UI 扩展点
└── index.js          # 入口
```

### 8.2 插件 API

```typescript
export default class MyPlugin extends BanjuanPlugin {
    async onload() {
        // 注册命令（GUI 命令面板 + CLI 都可调用）
        this.addCommand({
            id: 'export-to-anki',
            name: '导出到 Anki',
            callback: async () => { ... }
        })

        // 扩展 UI
        this.registerView('anki-panel', AnkiPanelView)

        // 监听事件
        this.on('annotation:created', async (ann) => { ... })

        // 访问 core API
        const docs = await this.library.documents.list()
    }

    async onunload() { ... }
}
```

### 8.3 扩展点

- 侧边栏面板
- 工具栏按钮
- 右键菜单
- 编辑器工具条
- 设置页
- CLI 命令（插件注册的命令可通过 `banjuan plugin run <command>` 调用）

### 8.4 事件系统

```
document:imported, document:deleted
annotation:created, annotation:updated, annotation:deleted
note:created, note:updated, note:deleted
mindmap:created, mindmap:updated, mindmap:deleted
mindmap:node:added, mindmap:node:removed, mindmap:edge:added
tag:assigned, tag:removed
library:opened, library:closed
```

## 9. CLI

### 9.1 命令结构

```bash
banjuan init                                  # 创建书房
banjuan open /path/to/library                 # 指定书房

banjuan doc import paper.pdf                  # 导入
banjuan doc list [--tag TAG] [--json]         # 列表
banjuan doc info <id>                         # 详情
banjuan doc export <id> --with-annotations    # 导出

banjuan ann list <doc-id> [--page N]          # 标注列表
banjuan ann add <doc-id> --page N --text "..."

banjuan note create "标题" [--doc <doc-id>]   # 创建笔记
banjuan note list [--json]                    # 列表
banjuan note show <id>                        # 输出内容
banjuan note edit <id>                        # 打开 $EDITOR

banjuan mindmap create "概念图" [--doc <doc-id>]  # 创建脑图
banjuan mindmap list [--doc <doc-id>]              # 列出脑图
banjuan mindmap show <id> [--json]                 # 查看脑图结构
banjuan mindmap export <id> --format md|opml|svg   # 导出

banjuan search "关键词" [--type note|doc|ann]

banjuan tag list
banjuan tag assign <id> <type> "标签名"

banjuan plugin install ./path
banjuan plugin list
banjuan plugin run <command>
```

### 9.2 输出控制

- 默认：人类可读的表格/彩色输出
- `--json`：结构化 JSON，供 LLM 和脚本消费
- 基于 Commander.js 实现

## 10. Chrome 扩展

### 10.1 功能

- 一键保存当前网页到书房（保存为 HTML 快照 + 截图）
- 选中文本后右键"保存到半卷闲书"（创建带高亮的快照）
- 保存页面上的图片/PDF 链接到书房
- 弹窗中可选择目标标签和备注

### 10.2 通信机制

Chrome 扩展通过本地 HTTP API 与桌面应用通信：

```
Chrome 扩展 → HTTP POST localhost:PORT/api/clip → Electron 主进程 → @banjuan/core
```

- 桌面应用启动时在本地开一个 HTTP 端口（仅 localhost）
- 端口号写入固定位置（`~/.banjuan/api-port`），扩展读取
- API 端点：`/api/clip`（保存网页）、`/api/status`（检查连接）
- 桌面应用未运行时，扩展提示用户先启动应用

### 10.3 保存格式

```
documents/
└── web-clips/
    └── 2026-04-25-article-title/
        ├── index.html        # 完整 HTML 快照（内联 CSS/图片）
        ├── screenshot.png    # 页面截图
        └── metadata.json     # URL、保存时间、选中文本
```

## 11. 里程碑

### Phase 1: 基础框架（MVP）
- Monorepo 搭建（pnpm workspace）
- @banjuan/core 骨架（Library、DB 模块）
- SQLite schema 和迁移机制
- 书房初始化和打开

### Phase 2: 文档库（MVP）
- 文档导入（复制文件 + 提取元数据）
- 支持所有文档类型（PDF、EPUB、TXT、MD、图片、视频、HTML）
- 文档列表、详情、删除
- 标签系统

### Phase 3: 阅读器/查看器（MVP）
- PDF.js 集成
- EPUB.js 集成
- 文本/Markdown 渲染
- 图片查看器
- 视频播放器
- 目录导航、页面跳转

### Phase 4: 标注系统（MVP）
- 文本高亮（PDF、EPUB、TXT、MD、HTML）
- 图片区域标注
- 视频时间点标注
- 批注
- 标注侧边栏
- 标注持久化到 SQLite

### Phase 5: 笔记系统（MVP）
- Milkdown 编辑器集成
- 笔记 CRUD
- 标注引用语法
- 双向链接
- 反向链接面板

### Phase 6: 脑图笔记
- 脑图创建/编辑/删除
- 从标注拖拽创建节点
- 树形/辐射形/自由布局
- 节点编辑、连线、折叠/展开
- 导出（Markdown/OPML/SVG）

### Phase 7: 知识图谱
- D3.js 力导向图
- 节点/边渲染（含脑图数据）
- 交互（缩放、拖拽、点击跳转）

### Phase 8: 插件系统
- 插件加载器
- Plugin API（命令、视图、事件）
- 插件设置页

### Phase 9: CLI
- Commander.js 基础框架
- 所有子命令实现
- --json 输出模式
- 插件命令集成

### Phase 10: Chrome 扩展
- Manifest V3 扩展
- 网页快照保存
- 本地 HTTP API 通信
- 选中文本保存
