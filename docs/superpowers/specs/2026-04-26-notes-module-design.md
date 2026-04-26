# Notes Module Design Spec

## Overview

Banjuan 笔记模块重写，目标是构建一个兼顾**文献笔记**和**个人知识库**的强大笔记系统。参考 GoodNote、Obsidian、Zettlr 的设计理念，以 BlockNote 块编辑器为核心，支持双向链接、深度文档嵌入、文件夹组织和可自定义模板。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 核心定位 | 文献笔记 + 知识库兼顾 | 研究场景需要两者 |
| 编辑器 | BlockNote（替换 Milkdown） | 开箱即用的块编辑、斜杠命令、拖拽，底层 TipTap/ProseMirror 可扩展 |
| 笔记组织 | 文件夹 + 双向链接 + 标签混合 | 文件夹做物理归类，链接和标签做逻辑关联 |
| 文档关联 | 深度嵌入 | 笔记中直接嵌入标注片段，可跳转到原文位置 |
| 内容存储 | BlockNote JSON | 块编辑器原生格式，保留 Markdown 导出能力 |
| 知识图谱 | 保持现状 | 当前 D3 图谱够用，优先级放在笔记核心能力 |
| 模板 | 内置 + 用户自定义 | 加速常见笔记创建流程 |
| 排版样式 | 参考 Zettlr | 优雅可读的学术风格 |

## 1. 数据模型

### 1.1 数据库 Schema 变更

**新建表：**

```sql
-- 文件夹树
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES folders(id)
);

-- 双向链接
CREATE TABLE note_links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    context TEXT,
    PRIMARY KEY (source_id, target_id),
    FOREIGN KEY (source_id) REFERENCES notes(id),
    FOREIGN KEY (target_id) REFERENCES notes(id)
);

-- 模板
CREATE TABLE note_templates (
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

**修改 `notes` 表：**

```sql
ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES folders(id);
ALTER TABLE notes ADD COLUMN content_format TEXT DEFAULT 'json';
```

### 1.2 笔记存储

- 内容格式：BlockNote JSON
- 文件路径：`.banjuan/notes/{id}.json`（以 ID 命名，避免文件名冲突）
- 文件结构：`{ meta: NoteFileData, blocks: BlockNoteBlock[] }`
- Markdown 导出：通过 BlockNote 内置能力按需生成
- 迁移：现有 `.md` 笔记通过迁移脚本转为 JSON 块格式

### 1.3 TypeScript 类型

```typescript
interface Note {
    id: string
    title: string
    path: string
    docId: string | null
    folderId: string | null
    content: string              // BlockNote JSON string
    contentFormat: 'json' | 'markdown'
    createdAt: string
    updatedAt: string
}

interface NoteCreateInput {
    title: string
    docId?: string
    folderId?: string
    annotationIds?: string[]
    content?: string
    templateId?: string
}

interface NoteLink {
    sourceId: string
    targetId: string
    context: string
}

interface Folder {
    id: string
    name: string
    parentId: string | null
    sortOrder: number
    createdAt: string
    updatedAt: string
    children?: Folder[]
}

interface NoteTemplate {
    id: string
    name: string
    description: string
    content: string              // BlockNote JSON
    isBuiltin: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}
```

### 1.4 笔记创建场景

- **从笔记目录创建**：`docId` 为空，`folderId` 指向所在文件夹
- **从 PDF/EPUB 中创建**：`docId` 关联文档，`folderId` 可选
- `docId` 和 `folderId` 独立，可同时存在、也可都为空
- 从文档中创建的笔记，后续可拖入文件夹归类

## 2. BlockNote 编辑器

### 2.1 编辑器基础

- 替换 Milkdown，使用 `@blocknote/react` + `@blocknote/core`
- 内置能力：斜杠命令菜单、拖拽排序、工具栏、嵌套块、Markdown 快捷键
- 自动保存：800ms debounce

### 2.2 自定义块类型

**标注引用块（AnnotationEmbed）：**

```
┌─────────────────────────────────┐
│ 📄 论文标题.pdf  p.12           │
│ ┌─────────────────────────────┐ │
│ │ "被高亮的原文片段..."        │ │
│ └─────────────────────────────┘ │
│ 用户的批注内容                   │
│                    [跳转到原文]  │
└─────────────────────────────────┘
```

- 存储属性：`{ docId, annotationId, quote, comment }`
- 点击跳转到 PDF 对应页面和位置
- 标注内容变更时，通过 `annotationId` 同步更新引用

**双向链接（NoteLink，行内节点）：**

- 输入 `[[` 触发笔记搜索弹窗，模糊搜索所有笔记标题
- 搜索无匹配时显示"创建新笔记: xxx"选项
- 插入后显示为带样式的行内链接
- 自动维护 `note_links` 表（插入时创建、删除时清理）
- 悬停预览目标笔记内容（详见 §6）

**文档引用块（DocumentEmbed）：**

```
┌─────────────────────────────────┐
│ 📄 论文标题.pdf                  │
│ 作者 · 2024 · 42页              │
│                    [打开文档]    │
└─────────────────────────────────┘
```

- 嵌入文档卡片，显示元信息
- 点击在新标签页打开文档

### 2.3 斜杠命令菜单

输入 `/` 弹出命令面板：

- **基础块**：文本、标题 H1-H3、列表、待办、引用、代码块、分割线
- **嵌入块**：标注引用、文档引用、图片
- **链接**：笔记链接（同 `[[` 触发）
- **模板**：从模板插入内容

## 3. 双向链接与笔记组织

### 3.1 双向链接系统

**创建链接：**
- 编辑器中输入 `[[` 触发搜索弹窗
- 模糊搜索所有笔记标题
- 搜索无匹配时可即时创建新笔记
- 选择后插入行内链接，同时写入 `note_links` 表

**反向引用面板（Backlinks）：**
- 位于笔记编辑视图右侧边栏
- 展示"引用了此笔记的其他笔记"列表
- 每条显示：来源笔记标题 + `context` 片段
- 点击跳转到来源笔记

**链接维护：**
- 保存笔记时，解析内容中所有链接，与 `note_links` 表做 diff，增删变更记录
- 笔记删除时清理所有关联 `note_links`
- 笔记重命名不影响链接（通过 `id` 引用）

### 3.2 文件夹管理

**UI 结构：**
- 左侧边栏显示文件夹树 + 笔记列表
- 支持拖拽：笔记拖入文件夹、文件夹拖拽调整层级
- 右键菜单：新建文件夹、重命名、删除
- 删除文件夹时笔记移到根目录（不删笔记）
- 顶部快捷入口：全部笔记、最近编辑

**文件夹支持任意深度嵌套**，通过 `folders.parent_id` 实现。

### 3.3 标签配合

- 文件夹：物理归类，一个笔记只能在一个文件夹
- 标签：逻辑分类，一个笔记可有多个标签
- 笔记列表支持按文件夹浏览或按标签筛选，两种视图切换

## 4. 模板系统

### 4.1 内置模板

3 个开箱即用模板：

- **文献笔记** — 标题、来源信息、摘要、关键发现、我的思考、相关文献
- **Zettelkasten 卡片** — 核心观点（一段话）、支撑论据、相关链接
- **会议/读书笔记** — 日期、主题、要点列表、行动项、参考资料

### 4.2 自定义模板

**创建方式：**
- 从空白创建：模板管理界面中新建，用 BlockNote 编辑器编写
- 从现有笔记创建：笔记菜单中"另存为模板"

**管理界面：**
- 设置中的"模板管理"页面
- 支持编辑、删除、排序、复制
- 内置模板不可删除但可隐藏

### 4.3 使用方式

- 新建笔记时弹出选择：空白笔记 或 从模板创建
- 斜杠命令 `/template` 插入模板内容到当前位置
- 模板仅作为初始内容，插入后与模板脱钩，独立编辑

## 5. UI 布局与交互

### 5.1 笔记目录视图（NoteView 重写）

```
┌──────────────┬──────────────────────────────┬──────────────┐
│  左侧边栏     │        编辑区                 │   右侧边栏    │
│              │                              │              │
│ [全部] [最近]  │  笔记标题（可编辑）            │  反向引用     │
│              │  标签: #tag1 #tag2 [+]       │  ┌──────────┐│
│ 📁 文件夹A    │                              │  │笔记X 引用 ││
│   📄 笔记1   │  BlockNote 编辑器             │  │了此笔记   ││
│   📄 笔记2   │  ┌────────────────────────┐  │  │"上下文..."││
│ 📁 文件夹B    │  │ 块内容...              │  │  └──────────┘│
│   📁 子目录   │  │                        │  │              │
│     📄 笔记3 │  │ [[双向链接]]            │  │  文档关联     │
│              │  │                        │  │  📄 论文.pdf  │
│ 📄 未归类笔记 │  │ /标注引用块/            │  │              │
│              │  │ /文档引用块/            │  │  标注引用     │
│──────────────│  └────────────────────────┘  │  📌 3条标注   │
│ 标签筛选      │                              │              │
│ #research    │                              │              │
│ #reading     │                              │              │
└──────────────┴──────────────────────────────┴──────────────┘
```

- 左侧边栏：文件夹树 + 标签筛选，可折叠
- 中间：BlockNote 编辑器，顶部显示标题和标签
- 右侧边栏：反向引用、关联文档、关联标注，可折叠

### 5.2 文档内笔记面板（NotesPanel 增强）

PDF/EPUB 阅读器侧边栏中：

- 显示当前文档关联的所有笔记
- 一键从选中标注创建笔记（自动填入标注引用块）
- 笔记卡片显示前几行预览，点击展开行内编辑或跳转完整视图
- 支持在面板内直接用 BlockNote 编辑

### 5.3 快捷键

- `Cmd+N` — 新建笔记
- `Cmd+Shift+N` — 从模板新建
- `Cmd+E` — 切换编辑/阅读模式

### 5.4 拖拽交互

- 笔记拖入文件夹
- 标注拖入笔记编辑器自动生成引用块

## 6. 预览与阅读模式

### 6.1 双向链接悬停预览

- 鼠标悬停 `[[链接]]` 300ms 后弹出浮窗
- 浮窗内容：笔记标题 + 前 5-8 行块内容的只读渲染
- 浮窗内的链接可继续悬停预览（链式预览，最多 2 层嵌套）
- 浮窗底部显示"在新标签页打开"按钮
- 鼠标移出浮窗后 200ms 关闭

### 6.2 阅读模式

- 编辑区右上角切换按钮：编辑模式 / 阅读模式
- 快捷键：`Cmd+E` 切换
- 阅读模式下：
  - 隐藏拖拽手柄、斜杠菜单、块工具栏
  - 内容只读，排版更紧凑
  - 标注引用块、文档引用块仍可点击跳转
  - 双向链接可点击跳转、可悬停预览
- 默认进入编辑模式，用户偏好可记忆

## 7. 排版样式规范（参考 Zettlr）

### 7.1 字体

- 正文：系统无衬线字体栈 — `"Inter", "PingFang SC", "Noto Sans SC", -apple-system, sans-serif`
- 标题：同正文字体，通过字重和字号区分
- 代码：`"JetBrains Mono", "Fira Code", "SF Mono", monospace`
- 中英文混排优化：中文使用 PingFang SC / Noto Sans SC

### 7.2 字号与行距

| 元素 | 字号 | 行高 | 字重 |
|------|------|------|------|
| H1 | 28px | 1.3 | 700 |
| H2 | 22px | 1.35 | 600 |
| H3 | 18px | 1.4 | 600 |
| 正文 | 15px | 1.75 | 400 |
| 代码 | 13px | 1.6 | 400 |
| 小字/元信息 | 13px | 1.5 | 400 |

- 段间距：正文段落间 `12px`
- 编辑区最大宽度：`720px` 居中（阅读模式下 `680px`）
- 左右内边距：`32px`

### 7.3 色彩

**亮色模式：**

| 元素 | 颜色 |
|------|------|
| 正文 | `#2e3440`（Nord Polar Night） |
| 标题 | `#2e3440` |
| 次要文字 | `#6b7280` |
| 链接/双向链接 | `#5e81ac`（Nord Frost） |
| 引用块左边框 | `#d8dee9`，背景 `#f8f9fb` |
| 代码块背景 | `#f0f2f5`，边框 `#e5e7eb` |
| 行内代码 | 背景 `#f0f2f5`，文字 `#bf616a` |
| 标注引用块 | 左边框 `#ebcb8b`（Nord Aurora），背景 `#fffdf5` |
| 选中/高亮 | `#e8f0fe` |

**暗色模式：**

| 元素 | 颜色 |
|------|------|
| 正文 | `#d8dee9` |
| 背景 | `#2e3440` |
| 链接 | `#88c0d0` |
| 引用块 | 左边框 `#4c566a`，背景 `#353b48` |
| 代码块 | 背景 `#3b4252` |
| 标注引用块 | 左边框 `#ebcb8b`，背景 `#3a3730` |

### 7.4 块样式细节

- **引用块**：左侧 3px 实线边框，`12px` 左内边距，圆角背景
- **代码块**：`1px` 边框，`8px` 圆角，`16px` 内边距，带语言标签
- **标注引用块**：左侧 3px 琥珀色边框，暖色背景，文档名和页码在顶部小字显示
- **文档引用块**：卡片样式，`1px` 边框，`8px` 圆角，hover 时轻微阴影
- **待办列表**：自定义勾选框样式，已完成项文字变灰加删除线
- **分割线**：`1px` 实线，颜色 `#e5e7eb`，上下 `24px` 间距

### 7.5 动效

- 块拖拽：200ms ease 过渡
- 悬停预览浮窗：150ms fade-in
- 侧边栏折叠：200ms ease-in-out
- 模式切换：150ms 淡入淡出
- 所有动效遵循 `prefers-reduced-motion` 系统设置

## 8. 数据迁移

### 8.1 迁移策略

- 运行时检测：打开 Library 时检查是否存在旧格式 `.md` 笔记
- 自动迁移：将 YAML frontmatter + Markdown 内容解析并转为 BlockNote JSON
- 迁移流程：
  1. 读取 `.md` 文件，解析 frontmatter 和 content
  2. 通过 BlockNote 的 Markdown-to-Blocks API 转换内容
  3. 写入新的 `.json` 文件
  4. 更新数据库记录（path, content_format）
  5. 备份原 `.md` 文件到 `.banjuan/notes/backup/`
- 迁移完成后在 `notes` 表 `content_format` 标记为 `json`
- 兼容读取：遇到 `content_format = 'markdown'` 的记录，运行时转换显示

### 8.2 新增 IPC 接口

```typescript
// 文件夹
'folders:create'    // { name, parentId? }
'folders:list'      // 返回嵌套树结构
'folders:update'    // { id, name?, parentId?, sortOrder? }
'folders:delete'    // { id } — 笔记移到根目录

// 双向链接
'noteLinks:list'    // { noteId } — 返回正向和反向链接
'noteLinks:sync'    // { noteId, links[] } — 保存时全量同步

// 模板
'templates:create'  // { name, description?, content }
'templates:list'    // 包含内置和自定义
'templates:update'  // { id, name?, description?, content? }
'templates:delete'  // { id } — 内置模板不可删除

// 笔记扩展
'notes:move'        // { id, folderId } — 移动到文件夹
'notes:saveAsTemplate' // { noteId, name }
```

## 9. 范围外（不在本次实现）

- 知识图谱增强（保持现有 D3 图谱）
- 手写/绘图（GoodNote 风格）
- 实时协作编辑
- 插件系统
- AI 辅助写作
