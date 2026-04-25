# 半卷闲书 — 多平台同步架构设计

## 1. 目标

支持通过 iCloud / WebDAV / Git 同步所有数据（元数据、标注、笔记、脑图、标签），无需自建服务器。大文件（PDF/EPUB/视频等）支持按需手动下载。首期实现 WebDAV。

## 2. 核心原则

- **文件即数据源** — JSON / Markdown 文件是 single source of truth，不是 SQLite
- **SQLite 是本地索引** — 纯查询缓存，启动时从文件重建，不参与同步
- **书房即目录** — 用户把书房建在已有的文档目录上，文件原地不动，不复制
- **每实体一文件** — 标注、脑图等每条记录独立一个 JSON 文件，最小化同步冲突
- **关系内嵌** — 实体间关联关系存在各自的 JSON/frontmatter 中，不单独存文件

## 3. 目录结构

```
~/Documents/研究资料/                    ← 书房根目录（用户已有的文档目录）
├── 机器学习/
│   ├── attention.pdf                   ← 用户自己的文件，原地不动
│   └── bert.epub
├── 哲学/
│   └── 庄子.txt
├── notes/                              ← banjuan 管理的笔记（用户也可在此创建 .md）
│   └── a4/
│       └── a4fbbc5e.md
├── .banjuan/
│   ├── config.json                     ← 书房配置
│   ├── tags.json                       ← 全局标签定义 [{id, name, color}]
│   ├── sync.json                       ← 同步配置（WebDAV 地址、模式等）
│   ├── data/
│   │   ├── documents/
│   │   │   └── 9d/
│   │   │       └── 9d087c54.json       ← 文档元数据
│   │   ├── annotations/
│   │   │   └── a4/
│   │   │       └── a4fbbc5e.json       ← 标注数据
│   │   └── mindmaps/
│   │       └── 88/
│   │           └── 88565702.json       ← 脑图数据（含 nodes + edges）
│   ├── stubs/
│   │   └── 9d/
│   │       └── 9d087c54.stub.json      ← 大文件占位符
│   └── db.sqlite                       ← 本地索引缓存（不同步）
```

### 3.1 子目录分层规则

所有按 ID 存储的实体（documents、annotations、mindmaps、stubs）使用 UUID 前两位字符作为子目录：

```
annotations/
├── 9d/
│   ├── 9d087c54-3519-4175-950e-aa68410e05c5.json
│   └── 9da3f2b1-xxxx.json
├── a4/
│   └── a4fbbc5e-xxxx.json
```

笔记 .md 文件同理，存在 `notes/{前两位}/` 下。

## 4. 数据格式

### 4.1 文档元数据 — `.banjuan/data/documents/{prefix}/{id}.json`

```json
{
  "id": "9d087c54-3519-4175-950e-aa68410e05c5",
  "title": "Attention Is All You Need",
  "authors": ["Vaswani et al."],
  "path": "机器学习/attention.pdf",
  "type": "pdf",
  "hash": "a948904f2f0f...",
  "tags": ["机器学习", "注意力"],
  "metadata": {},
  "createdAt": "2026-04-25T10:00:00Z",
  "updatedAt": "2026-04-25T10:00:00Z"
}
```

- `path` 是相对于书房根目录的路径
- `tags` 内嵌为字符串数组（引用 tags.json 中的 name）
- 导入 = 为已有文件创建这条 JSON，不复制原文件
- 删除 = 删除这条 JSON，原文件不动

### 4.2 标注 — `.banjuan/data/annotations/{prefix}/{id}.json`

```json
{
  "id": "a4fbbc5e-xxxx",
  "docId": "9d087c54-xxxx",
  "type": "highlight",
  "page": 3,
  "position": { "type": "pdf", "page": 3, "rects": [...], "text": "..." },
  "content": "这段很重要",
  "selectedText": "Attention is all you need",
  "color": "#fde68a",
  "createdAt": "2026-04-25T10:05:00Z",
  "updatedAt": "2026-04-25T10:05:00Z"
}
```

### 4.3 笔记 — `notes/{prefix}/{id}.md`（frontmatter + 正文合一）

```markdown
---
id: a4fbbc5e-3519-4175-950e-aa68410e05c5
title: Attention 论文笔记
docId: 9d087c54-3519-4175-950e-aa68410e05c5
annotationIds:
  - ann001
  - ann002
tags:
  - 机器学习
  - 注意力
createdAt: 2026-04-25T10:00:00Z
updatedAt: 2026-04-25T10:30:00Z
---

> Attention is all you need

我的理解是...
```

- 用户可以在 notes/ 下自由创建 .md 文件
- 从标注创建笔记时，自动生成 frontmatter 并写入关联
- 没有 frontmatter 的 .md 文件 — 导入时自动补充 id 和 createdAt

### 4.4 脑图 — `.banjuan/data/mindmaps/{prefix}/{id}.json`

```json
{
  "id": "88565702-xxxx",
  "title": "概念图",
  "docId": "9d087c54-xxxx",
  "layout": "tree",
  "tags": ["机器学习"],
  "nodes": [
    {
      "id": "node1",
      "parentId": null,
      "annotationId": null,
      "title": "Transformer",
      "content": null,
      "color": null,
      "positionX": null,
      "positionY": null,
      "sortOrder": 0,
      "collapsed": false
    }
  ],
  "edges": [
    {
      "id": "edge1",
      "sourceId": "node1",
      "targetId": "node2",
      "label": "包含",
      "style": null
    }
  ],
  "createdAt": "2026-04-25T11:00:00Z",
  "updatedAt": "2026-04-25T11:30:00Z"
}
```

nodes 和 edges 内嵌在脑图 JSON 中，不单独存文件（一张脑图的节点/边总是一起读写）。

### 4.5 标签定义 — `.banjuan/tags.json`

```json
[
  { "id": "tag1", "name": "机器学习", "color": "#89b4fa" },
  { "id": "tag2", "name": "注意力", "color": "#a6e3a1" }
]
```

标签分配不在这里 — 各实体自己的 JSON/frontmatter 中通过 tags 数组引用标签名。

### 4.6 大文件 stub — `.banjuan/stubs/{prefix}/{id}.stub.json`

```json
{
  "id": "9d087c54-xxxx",
  "hash": "a948904f...",
  "size": 5242880,
  "remotePath": "机器学习/attention.pdf",
  "createdAt": "2026-04-25T10:00:00Z"
}
```

- 同步时发现远端有文档元数据但本地没有原文件 → 创建 stub
- 用户手动点"下载"→ 从 WebDAV 拉取原文件，删除 stub
- 用户手动点"上传"→ 将本地文件推到 WebDAV

## 5. SQLite 索引层

### 5.1 角色

纯本地查询缓存。所有表的数据来源是文件，SQLite 只是为了加速查询和全文搜索。

### 5.2 Schema

与现有 schema 基本一致，但：
- 去掉外键约束（数据完整性由文件层保证）
- 保留 FTS5 search_index

### 5.3 重建策略

**全量重建：**
- 首次启动 / 用户手动触发 / 索引文件损坏
- 扫描 `.banjuan/data/` 下所有 JSON + 书房内所有 .md 文件
- 解析 → 写入 SQLite 表 + FTS5

**增量更新：**
- 记录上次索引时间到 `.banjuan/db.meta.json`
- 启动时只扫描 mtime 大于上次索引时间的文件
- 运行时通过 fs.watch 监听文件变更，实时更新索引

### 5.4 写操作流程

```
用户操作 → Service 写 JSON/md 文件 → Service 更新 SQLite 索引 → 触发 EventBus 事件
```

读操作不变，查 SQLite。

## 6. 同步机制

### 6.1 同步范围

| 目录/文件 | 是否同步 | 说明 |
|---|---|---|
| `.banjuan/data/**` | 同步 | 所有元数据、标注、脑图 |
| `.banjuan/tags.json` | 同步 | 标签定义 |
| `.banjuan/sync.json` | 同步 | 同步配置 |
| `.banjuan/config.json` | 同步 | 书房配置 |
| `notes/**/*.md` | 同步 | 笔记文件 |
| `.banjuan/stubs/**` | 同步 | stub 信息 |
| `.banjuan/db.sqlite` | 不同步 | 本地索引 |
| `.banjuan/db.meta.json` | 不同步 | 索引时间戳 |
| 文档原文件（PDF等） | 可选手动 | 大文件按需上传/下载 |

### 6.2 同步策略

基于文件 mtime 的双向同步：

1. 本地改了文件 → 下次同步时推到远端
2. 远端有更新的文件 → 拉到本地
3. 双方都改了同一文件 → last-write-wins（mtime 更新的覆盖旧的）
4. 一端删除了文件 → 同步时在另一端也删除

**删除检测：** 每次同步完成后，在 `.banjuan/sync-snapshot.json` 中记录本次同步的完整文件列表。下次同步时，对比 snapshot 与当前本地/远端文件列表：文件在 snapshot 中存在但本地不存在 → 本地删除了，需要在远端也删除；反之亦然。首次同步无 snapshot，不执行任何删除。`sync-snapshot.json` 不参与同步（仅本地使用）。

### 6.3 冲突概率分析

每实体独立文件的设计让冲突概率极低：
- 两端同时改**不同**标注/笔记 → 不同文件，零冲突
- 两端同时改**同一条**标注 → 同一文件冲突，last-write-wins，可接受
- `tags.json` 是共享文件 → 有冲突风险，但标签定义改动频率极低

### 6.4 SyncAdapter 接口

```typescript
interface SyncConfig {
  type: 'webdav'
  url: string
  username: string
  password: string
  remotePath: string
}

interface RemoteFile {
  path: string
  mtime: number
  size: number
  isDirectory: boolean
}

interface SyncAdapter {
  connect(config: SyncConfig): Promise<void>
  disconnect(): Promise<void>
  list(remotePath: string): Promise<RemoteFile[]>
  upload(localPath: string, remotePath: string): Promise<void>
  download(remotePath: string, localPath: string): Promise<void>
  delete(remotePath: string): Promise<void>
  getMetadata(remotePath: string): Promise<{ mtime: number; size: number }>
}
```

首期实现 `WebDAVAdapter`。未来 iCloud / Git 实现同一接口。

### 6.5 大文件处理

- 导入文档时，文件留在本地原位，不自动上传
- 用户可手动选择"上传到云端"→ 推送到 WebDAV
- 同步时发现远端有文档元数据但本地无原文件 → 创建 stub
- 用户手动点"下载"→ 从 WebDAV 拉取到本地对应路径，删除 stub
- 文档列表中显示状态：本地 / 云端（stub）/ 已同步

## 7. 对现有代码的影响

### 7.1 @banjuan/core — 大改

| 模块 | 变化 |
|---|---|
| DocumentService | import 不复制文件，只写 JSON；delete 只删 JSON 不动原文件；path 改为相对路径 |
| AnnotationService | CRUD 改为读写 JSON 文件 + 更新 SQLite 索引 |
| NoteService | CRUD 改为读写 .md（frontmatter）+ 更新 SQLite 索引 |
| MindmapService | CRUD 改为读写 JSON（nodes/edges 内嵌）+ 更新索引 |
| TagService | 标签定义读写 tags.json；分配关系内嵌到各实体 |
| SearchService | 不变，基于 SQLite FTS5 |
| GraphService | 不变，查 SQLite |
| 新增 IndexService | 从文件重建 SQLite 索引（全量 + 增量） |
| 新增 SyncService | 同步编排：比对本地/远端文件列表，调用 SyncAdapter |
| 新增 WebDAVAdapter | WebDAV 协议实现 |
| 新增 StubService | 管理 stub 文件、大文件上传下载 |
| 新增 FileWatcher | 监听文件变更，触发索引更新 |

### 7.2 @banjuan/app — 小改

- IPC 加 sync 相关 handler
- UI：同步配置页、文档列表显示 stub 状态、上传/下载按钮
- 启动时触发索引重建

### 7.3 @banjuan/cli — 小改

- 加 `banjuan sync` 命令（push/pull/status）
- doc import 行为变化

## 8. 实施计划

分 3 个 Phase：

### Phase A: 存储层重构
- 定义 JSON/md 文件格式
- 重构所有 service 为 file-first + SQLite 索引
- 实现 IndexService（全量 + 增量重建）
- 实现 FileWatcher
- 迁移现有测试

### Phase B: WebDAV 同步
- 实现 SyncAdapter 接口 + WebDAVAdapter
- 实现 SyncService（双向同步编排）
- 实现 StubService（大文件管理）
- 同步测试

### Phase C: UI + CLI 集成
- 同步配置 UI（WebDAV 地址、用户名、密码）
- 文档列表 stub 状态 + 下载按钮
- CLI `banjuan sync` 命令
- 同步状态指示器
