# `banjuan://` 链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 回答里的出处链接点了能在半卷打开到对应页 / 批注 / 笔记；AI 经 Markdown 读写笔记不丢链接和嵌入。

**Architecture:** core 新增 `notes/links.ts`（生成 / 解析）；`blocksToMarkdown` 加 `banjuanLinks` 选项、`markdownToBlocks` 识别这些链接；接口结果加 `link`；主进程 `deep-link.ts` 接 `open-url`、选书房、交给书库窗口；渲染端 TabManager 打开目标。

**Tech Stack:** TypeScript、Electron 35（open-url、electron-builder protocols）、React、vitest。

规格：`docs/superpowers/specs/2026-10-28-banjuan-links-design.md`。

---

### Task 1: 链接生成与解析（core）

**Files:** Create `packages/core/src/notes/links.ts`, `packages/core/test/links.test.ts`; Modify `packages/core/src/index.ts`

- [ ] 失败测试：

```ts
import { describe, it, expect } from 'vitest'
import { formatLink, parseLink } from '../src/notes/links.js'

describe('banjuan links', () => {
  it('writes and reads doc / annotation / note links with their query', () => {
    expect(formatLink('doc', 'abc123', { page: 3, library: '/Users/a b/书房' })).toBe('banjuan://doc/abc123?page=3&library=%2FUsers%2Fa+b%2F%E4%B9%A6%E6%88%BF')
    expect(parseLink('banjuan://doc/abc123?page=3&library=%2FUsers%2Fa+b%2F%E4%B9%A6%E6%88%BF')).toEqual({ kind: 'doc', id: 'abc123', query: { page: '3', library: '/Users/a b/书房' } })
    expect(parseLink(formatLink('annotation', 'a-1', { doc: 'd1', page: 7 }))).toEqual({ kind: 'annotation', id: 'a-1', query: { doc: 'd1', page: '7' } })
    expect(formatLink('note', 'n1')).toBe('banjuan://note/n1')
    expect(formatLink('doc', 'd', { page: undefined, authors: '' })).toBe('banjuan://doc/d')
  })

  it('refuses anything else', () => {
    for (const bad of ['https://x/doc/1', 'banjuan://book/1', 'banjuan://doc/', 'banjuan://doc/a/b', 'banjuan://doc/a%2Fb', 'banjuan://doc/' + 'x'.repeat(65), 'banjuan://doc/a b'])
      expect(parseLink(bad)).toBeNull()
  })

  it('reads a page only when it is a whole number from 1 up', () => {
    expect(linkPage({ page: '12' })).toBe(12)
    for (const p of ['0', '-1', '1.5', 'x', undefined]) expect(linkPage({ page: p as any })).toBeUndefined()
  })
})
```

- [ ] 实现 `links.ts`：`LinkKind = 'doc'|'annotation'|'note'`；`formatLink(kind, id, query?)`（跳过 undefined / 空串，`URLSearchParams` 编码）；`parseLink(url)`（正则 `^banjuan://(doc|annotation|note)/([A-Za-z0-9-]{1,64})/?(?:\?(.*))?$`，query 用 `URLSearchParams` 读）；`linkPage(query)`。index.ts 导出。
- [ ] 通过后 commit：`feat(core): banjuan:// 链接的生成与解析`

### Task 2: Markdown 往返（core）

**Files:** Modify `packages/core/src/notes/export-markdown.ts`, `packages/core/src/notes/migration.ts`; Create `packages/core/test/markdown-links.test.ts`

- [ ] 失败测试：一组块（标题、含 **粗体** + 笔记链接 + 文档链接的段落、批注引用（多行原文、评论）、文档嵌入（作者、页数）、笔记嵌入（pageIndex）、普通引用、无 ID 的 `[[标题]]` 笔记链接）→ `blocksToMarkdown(blocks, { banjuanLinks: true })` → `markdownToBlocks` → 比较类型与 props（忽略 `styles: {}` / `children: []` 的补全）；导出模式（无选项）输出仍是 `[[标题]]` 与 `> 📄 …`。
- [ ] 实现：
  - `blocksToMarkdown(blocks, opts?: { banjuanLinks?: boolean })`，选项传到 `blockToMd` / `inlineToMd`；
  - 行内：`noteLink` 有 noteId → `[title](banjuan://note/id)`，`documentLink` → `[title](banjuan://doc/id)`；
  - 块：`annotationEmbed` → `> [📄 docTitle p.N](banjuan://annotation/<annotationId>?doc=&page=)`（无 annotationId 时用 `banjuan://doc/<docId>?page=`），再接 `> "原文"`（多行原文每行加 `> `，首行带开引号、末行带闭引号）与评论行；`documentEmbed` → `> [📘 docTitle](banjuan://doc/<id>?embed=1&authors=&pageCount=)`；`noteEmbed` → `> [📝 noteTitle](banjuan://note/<id>?embed=1&pageIndex=)`；
  - `parseInline`：`[text](banjuan://note/<id>)` → `{ type: 'noteLink', props: { noteId, title: text } }`，`banjuan://doc/` → `{ type: 'documentLink', props: { docId, title: text } }`；
  - `markdownToBlocks`：引用段首行恰为一个 `banjuan://` 链接时收集整段：annotation 链接、或 doc 链接且后面还有行 → `annotationEmbed`（原文：以 `"` 开头到以 `"` 结尾的行；其余为评论）；doc 链接带 `embed=1` 或单独一行 → `documentEmbed`；note 链接 → `noteEmbed`。
- [ ] 通过后 commit：`feat(core): 笔记 Markdown 往返带 banjuan:// 链接，ID 与嵌入不丢`

### Task 3: 接口结果带链接、AI 读笔记用带链接的 Markdown

**Files:** Modify `packages/app/src/main/api-server.ts`, `plugins/claude-ai/mcp-server.mjs`, `plugins/claude-ai/index.js`, `packages/cli/skill/banjuan/SKILL.md`

- [ ] `?format=markdown` → `blocksToMarkdown(blocks, { banjuanLinks: true })`。
- [ ] `/api/search`、`/api/documents/:id/text`（每页）、`/api/annotations` 结果加 `link`（带 `library: lib.rootPath`）。
- [ ] MCP：search / read_document / get_annotations 说明里写明结果带 `link`，回答引用时用 `[文字](link)`；update_note 说明改为“Markdown 往返保留链接与嵌入，样式（颜色、对齐）不保留”。内置助手提示词同。技能说明的“Answer from a document”流程用 `--json` 取 `link`。
- [ ] 隔离实例实测（mcpcall）：结果有 `link`；读出含嵌入的笔记、原样写回后再读 raw，块一致。
- [ ] commit：`feat(api): 搜索、正文、批注结果带 banjuan:// 链接；AI 读笔记用带链接的 Markdown`

### Task 4: 点击链接打开（主进程 + 渲染端）

**Files:** Create `packages/app/src/main/deep-link.ts`, `packages/app/src/main/deep-link-target.ts`（纯）+ test; Modify `packages/app/src/main/index.ts`, `packages/app/electron-builder.yml`, `packages/app/src/preload/index.ts`, `packages/shared-ui/src/api.ts`, `packages/app/src/renderer/App.tsx`, `packages/shared-ui/src/components/TabManager.tsx`, 7 个语言文件

- [ ] 纯函数 `pickLibrary(link, { history, openLibraries, has })`：带 library 且在历史中（真实路径相等）→ 它；否则第一个 `has(lib, link)` 为真的已开书房；否则 null。单测覆盖：历史内 / 历史外路径 / 在已开书房中找到 / 都没有。
- [ ] `deep-link.ts`：`open-url` 排队（ready 前）；`openLink(url)`：解析失败忽略并记日志；选书房；已开窗口 → focus + `library:open-link`（发原链接）；否则 `createWindow({ hash: library=…&openLink=… })`；找不到 → 调出 / 新开书库窗口 + `dialog.showMessageBox`（非阻塞）文案 `link.notFound`（主进程按当前语言取 shared-ui 文案）。启动时有排队的链接则不开默认窗口。
- [ ] electron-builder：`mac.protocols: [{ name: Banjuan Link, schemes: [banjuan] }]`。
- [ ] preload / api：`library.onOpenLink(cb)`；App.tsx `launchTarget` 读 `openLink` → TabManager `pendingOpenLink`；TabManager `openLink(url)`：doc → `requestDocPage` + `banjuan:open-document`；annotation → `api.annotations.get` 得到文档和页（链接里的 doc/page 兜底）；note → `note-link-click`；找不到 → `toast.error(t('link.notFound'))`。
- [ ] 文案 `link.notFound`（7 种语言）。
- [ ] `pnpm verify`；commit：`feat(app): 点击 banjuan:// 链接在半卷打开到对应文档页、批注、笔记`

### Task 5: 打包实测与收尾

- [ ] 打包安装；隔离实例实测：`open 'banjuan://doc/<id>?page=3'` → 打开到第 3 页；批注链接；笔记链接；书房未开时（带 library）先打开书房；陌生 library 路径不打开；接口 `link` 可直接 `open`。
- [ ] 回归 sfw、sec、menubar；合入 `integrate/local-test`，不推送。
