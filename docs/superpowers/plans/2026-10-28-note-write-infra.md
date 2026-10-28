# 笔记写入基建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 外部程序能安全、增量、可定位地往书房写笔记：历史版本、按章节写入、找或建、机器可读输出、按时间取变更。

**Architecture:** core 新增 `notes/sections.ts`（纯函数）与 `notes/history.ts`（版本存取）；`NoteService.update` 加 `source` 选项并在文件锁内留版本，新增 `updateSection / ensure / history / restore`；接口、命令行、MCP 各加对应入口。

**Tech Stack:** TypeScript、better-sqlite3、vitest（core 用 `node ../../scripts/vitest-electron.mjs`）。

规格：`docs/superpowers/specs/2026-10-28-note-write-infra-design.md`。

---

### Task 1: 章节写入（纯函数）

**Files:** Create `packages/core/src/notes/sections.ts`, `packages/core/test/note-sections.test.ts`

- [ ] 失败测试：`parseHeadingLine('## 20261028')` → `{ level: 2, text: '20261028' }`，非标题行 → null，`####` 级别封顶 3；`upsertSection(blocks, { heading, content, mode, newAt })`：
  - 已有章节 replace：只替换到下一个同级 / 更高级标题前，其他块（含另一个同级章节、更低级子标题属于本节）不变；
  - append：追加在本节末尾；
  - 不存在 + `top`：插在第一个同级或更高级标题前（H1 之后的 H2 日期段之前）；无同级标题时文末；
  - 不存在 + `bottom`：文末；
  - 标题按纯文字匹配（忽略粗体等样式、首尾空白）。
- [ ] 实现：`headingText(block)` 拼接 `content` 中 text；`upsertSection` 只看顶层块，返回新数组。
- [ ] commit：`feat(core): 按标题定位章节写入（替换 / 追加 / 新建在顶部或文末）`

### Task 2: 历史版本存取

**Files:** Create `packages/core/src/notes/history.ts`, `packages/core/test/note-history.test.ts`; Modify `packages/core/src/sync/exclusions.ts`

- [ ] 失败测试（临时目录 + NodeFS）：`save(id, text, reason, now)` 写 `<ts>-<reason>.json`；`list(id)` 新到旧 `{ version, at, reason, title }`；`read(id, version)`；`newest(id)`；保留规则（51 份删最旧；>30 天删除但至少留 5 份）；非法 version（含 `/`、`..`）拒绝。
- [ ] 实现 `NoteHistory`；`EXCLUDED_DIRS` 加 `.note-history`（同步排除测试补一条）。
- [ ] commit：`feat(core): 笔记历史版本存取（设备本地，不同步）`

### Task 3: NoteService 接入

**Files:** Modify `packages/core/src/notes/service.ts`, `packages/core/src/types.ts`（若需）; Create `packages/core/test/note-write-infra.test.ts`

- [ ] 失败测试（真实 Library 临时目录）：
  - `update(id, { content }, { source: 'external' })` 两次 → 历史 2 份；应用内（默认）连续两次 → 1 份；外部写后应用内写 → 历史里有外部那版；
  - `restore(id, version)` → 内容回到该版本，且恢复前的内容进了历史；
  - `updateSection(id, '## 20261028', '- a', { mode: 'append', newAt: 'top' })` 新建在顶部；再 append 进同一节；其他节不变；
  - `ensure({ title, folder, content })` 两次 → 同一 ID、第二次 `created: false`；别的文件夹同名不算；
- [ ] 实现：`update(id, updates, opts?: { source?: 'app' | 'external'; reason?: string })`；Markdown 分支写前按规则 `history.save`；`externallyWritten: Set<string>`；`history(id)`、`restore(id, version)`、`updateSection(...)`、`ensure(...)`。
- [ ] commit：`feat(core): 笔记写入留历史版本；按章节写入、找或建、恢复`

### Task 4: 接口

**Files:** Modify `packages/app/src/main/api-server.ts`, `packages/app/src/main/api-links.ts`(+test)

- [ ] PUT 传 `{ source: 'external' }`；写入类返回加 `link`（`withNoteLink(note, library)`，单测）；新增 `POST /api/notes/ensure`、`POST /api/notes/:id/section`、`GET /api/notes/:id/history`、`POST /api/notes/:id/restore`；`GET /api/notes?since=`。
- [ ] commit：`feat(api): 笔记 ensure / section / history / restore 接口，写入结果带链接，列表按时间过滤`

### Task 5: 命令行

**Files:** Modify `packages/cli/src/commands/note.ts`, `packages/cli/skill/banjuan/SKILL.md`

- [ ] `note ensure`、`note section`、`note history`、`note restore`；create / update / move 加 `--json`；`list --since`。
- [ ] 技能说明：自动化写入推荐流程（ensure → section；出错用 history / restore）。
- [ ] commit：`feat(cli): note ensure / section / history / restore，写入命令 --json，list --since`

### Task 6: MCP

**Files:** Modify `plugins/claude-ai/mcp-server.mjs`

- [ ] 工具 `ensure_note`、`update_note_section`、`note_history`、`restore_note`；`list_notes` 加 `since`。说明里写清：改日记、总览这类长笔记用 `update_note_section`，不要整篇 `update_note`。
- [ ] commit：`feat(mcp): ensure_note / update_note_section / note_history / restore_note`

### Task 7: 实测、打包、交接

- [ ] 隔离实例实测（规格“测试”一节）；`pnpm verify`；打包安装；回归 sfw / sec / menubar / deeplink。
- [ ] 更新个人 worklog 技能用新能力（备份后改）。
- [ ] 写 CC Desk 对接说明给用户过目，同意后发给“cc-desk项目开发”会话。
- [ ] 合入 `integrate/local-test`，不推送。
