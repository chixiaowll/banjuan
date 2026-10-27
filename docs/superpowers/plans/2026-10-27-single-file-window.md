# 单文件窗口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 像 VS Code 一样直接打开一个文件：PDF / EPUB / 图片只读查看，Markdown / 纯文本可编辑并保存回原文件，不进书库；需要时一键加入书库。

**Architecture:**
- 主进程新增 `file-windows`，负责打开、去重、记录“窗口 ↔ 文件”，并提供 `file:*` IPC（只放行窗口自己的文件）。
- 渲染端新增 `#file` 入口 `FileWindowApp`。它用 `singleFileApi` 把一个文件包装成阅读器需要的 `BanjuanAPI`，并通过 `ViewerCapabilities` 上下文隐藏批注 / 笔记 / 标签等依赖书库的界面。
- Markdown / 纯文本用 CodeMirror 编辑，`textFileSession` 负责编码、换行符、BOM、自动保存的状态。

**Tech Stack:** Electron 35（`open-file`、`fileAssociations`）、React、CodeMirror 6（新增 `@codemirror/search`）、vitest。

设计文档：`docs/superpowers/specs/2026-10-27-single-file-window-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `packages/shared-ui/src/api.ts` | 新增 `SingleFileAPI` / `SingleFileInfo` 类型；`BanjuanAPI.file?`；`library.onImportOpen?` |
| `packages/app/src/main/file-view-state.ts` (+test) | 阅读位置存储：`file-view-state.json`，最近 500 个 |
| `packages/app/src/main/file-watch.ts` (+test) | 监视单个文件（监听所在文件夹），忽略自己写入引起的变化 |
| `packages/app/src/main/file-windows.ts` (+test) | 打开 / 去重 / 窗口↔文件登记、命令行参数解析、`local-file` 放行判断、`file:*` IPC、在书库窗口中打开 |
| `packages/app/src/main/windows.ts` | `createWindow({ hash })`；单文件窗口不作为“最近的书库窗口” |
| `packages/app/src/main/index.ts` | `open-file`、启动参数、菜单“打开文件…”、`local-file` 放行 |
| `packages/app/src/main/api-server.ts` | `POST /api/view` |
| `packages/app/src/preload/index.ts` | `file` 命名空间、`library.onImportOpen` |
| `packages/shared-ui/src/components/viewers/viewerCapabilities.ts` | 单文件模式开关 |
| PDF / EPUB 工具栏、侧栏、选区工具条、`useReadingTimer` | 按开关隐藏 |
| `packages/shared-ui/src/utils/singleFileApi.ts` (+test) | 单文件 `BanjuanAPI` 包装 |
| `packages/shared-ui/src/components/fileWindow/textFileSession.ts` (+test) | 解码 / 编码、脏状态、保存调度 |
| `packages/shared-ui/src/components/fileWindow/TextFileEditor.tsx` | CodeMirror 编辑器 + 预览 |
| `packages/shared-ui/src/components/fileWindow/FileWindowApp.tsx` | 单文件窗口：标题栏、横幅、加入书库 |
| `packages/shared-ui/src/utils/importAndOpen.ts` | 书库窗口里导入（或找到）并打开一个外部路径 |
| `packages/app/src/renderer/App.tsx`、`TabManager.tsx` | `#file` 路由；`#library=…&importOpen=…`；`onImportOpen` |
| `packages/cli/src/index.ts` | `banjuan <文件>` |
| `packages/app/electron-builder.yml` | `fileAssociations`（rank: Alternate） |
| i18n 7 个文件 | 新文案 |

---

### Task 1: 共享类型

**Files:** Modify `packages/shared-ui/src/api.ts`

- [ ] 新增：

```ts
export interface SingleFileInfo {
  path: string            // 真实路径
  name: string            // 文件名
  type: 'pdf' | 'epub' | 'markdown' | 'text' | 'image' | 'unsupported'
  size: number
  /** 文件位于某个已知书库内时 */
  library?: { root: string; name: string }
}
export interface SingleFileAPI {
  info(): Promise<SingleFileInfo>
  readBuffer(): Promise<ArrayBuffer | Uint8Array>
  readRange(start: number, end: number): Promise<ArrayBuffer | Uint8Array>
  writeBytes(bytes: Uint8Array): Promise<{ stamp: string }>
  getViewState(): Promise<Record<string, unknown>>
  setViewState(state: Record<string, unknown>): Promise<void>
  openInSystem(): Promise<void>
  libraries(): Promise<Array<{ path: string; name: string }>>
  addToLibrary(libraryPath: string): Promise<void>
  openInLibrary(): Promise<void>
  /** 外部修改（stamp 变了）/ 文件消失 */
  onChanged(cb: (e: { kind: 'changed' | 'gone'; stamp?: string }) => void): () => void
}
```

- [ ] `BanjuanAPI` 增加 `file?: SingleFileAPI`；`library` 增加 `onImportOpen?(cb: (absPath: string) => void): () => void`。
- [ ] `npx tsc --noEmit -p packages/shared-ui` 通过；提交。

### Task 2: 阅读位置存储（主进程）

**Files:** Create `packages/app/src/main/file-view-state.ts`, `file-view-state.test.ts`

- [ ] 测试：写入 501 个文件后最早的被淘汰；同一路径再次写入会移到最新；读取不存在的路径返回 `{}`；损坏的 JSON 当作空。
- [ ] 实现 `class FileViewStateStore { constructor(file: string, max = 500); get(path); set(path, state) }`。内存中用 `Map` 保持插入顺序，写入用临时文件加改名，写盘防抖 300ms，另提供 `flush()`。
- [ ] `cd packages/app && npx vitest run src/main/file-view-state.test.ts` 通过；提交。

### Task 3: 文件监视（主进程）

**Files:** Create `packages/app/src/main/file-watch.ts`, `file-watch.test.ts`

- [ ] 测试（真实临时目录）：
  - 外部覆盖写会触发 `changed`，带新的 stamp
  - 通过 `markOwnWrite(stamp)` 登记的自己写入不触发
  - 删除会触发 `gone`
  - 别的编辑器那种“临时文件改名替换”的写法触发 `changed`
- [ ] 实现：`watchFile(path, onEvent)`。监听所在文件夹，按文件名过滤，防抖 150ms，每次事件时 `stat`；stamp 为 `${size}:${mtimeMs}`；与上次已知 stamp 相同则忽略。返回 `{ markOwnWrite(stamp), close() }`。
- [ ] 测试通过；提交。

### Task 4: 单文件登记与打开（主进程）

**Files:** Create `packages/app/src/main/file-windows.ts`, `file-windows.test.ts`; Modify `windows.ts`

- [ ] `windows.ts`：`createWindow(opts?: { hash?: string; kind?: 'library' | 'file' })`，加载 `index.html#<hash>`。`file` 类窗口：
  - 仍加入 `windows`，关闭和退出前同样会写完待保存内容
  - 不更新 `lastFocused`（截图“插入笔记”仍只找书库窗口）
- [ ] `file-windows.ts` 纯函数（可测）：
  - `fileTypeOf(path)`：md / markdown → markdown，txt → text，pdf，epub，图片扩展名 → image，其余 unsupported
  - `filesFromArgv(argv, isPackaged)`：跳过可执行文件和脚本路径、以 `-` 开头的参数、不存在的路径和目录
  - `libraryContaining(realPath, history)`：按真实路径前缀匹配
- [ ] `FileWindowRegistry`（注入 `create(path) / focus(win)`，便于测试）：
  - `open(path)`：先取真实路径；已打开的就聚焦，否则新建
  - `fileOf(webContentsId)`
  - `isServable(path)`：已打开的文件本身，或已打开的 Markdown 所在文件夹内的图片
- [ ] 测试：
  - 同一文件（含符号链接）只开一个窗口
  - 关闭后可再开
  - `isServable` 放行与拒绝的情形
  - `filesFromArgv` 正确取出文件
- [ ] 通过；提交。

### Task 5: `file:*` IPC 与入口接线（主进程）

**Files:** Modify `file-windows.ts`, `index.ts`, `api-server.ts`, `ipc.ts`（导出 `getLibraryHistory` 已有、`openPathInLibraryWindow`）

- [ ] IPC 处理（全部用 `event.sender.id` 查文件，查不到就拒绝）：
  - `file:info`、`file:readBuffer`、`file:readRange`
  - `file:writeBytes`：仅 markdown / text 类型；`NodeFS.writeTextFile` 原子写；写后 `stat` 得到 stamp 并登记为自己写入
  - `file:getViewState` / `file:setViewState`
  - `file:openInSystem`（`openPathSafely`）
  - `file:libraries`：书库历史中仍存在的书库
  - `file:addToLibrary(root)`：root 必须在书库历史中；记录为用户选择的路径，然后 `openPathInLibraryWindow(root, path)`，再关闭单文件窗口
  - `file:openInLibrary`：用 `info.library.root` 调同一函数
  - 窗口打开时启动 `watchFile`，通过 `file:changed` 发给窗口；窗口关闭时停止
- [ ] `openPathInLibraryWindow(root, absPath)`：先 `rememberUserChosenPath(absPath)`。已有窗口显示该书库就发 `library:import-open`；否则 `createWindow({ hash: 'library=<enc>&importOpen=<enc>' })`。
- [ ] `index.ts`：
  - `app.on('open-file')` 在 ready 前排队，ready 后打开
  - ready 时若有排队的文件或命令行参数里有文件，就只开这些文件窗口，不开书库窗口
  - 菜单“文件 → 打开文件…（⌘O）”，支持多选，按类型过滤
  - `local-file` 协议多放行 `registry.isServable(path)`
- [ ] `api-server.ts`：`POST /api/view { path }` 调用 `registry.open(resolve(path))`。
- [ ] `npx tsc --noEmit -p packages/app/tsconfig.json`；提交。

### Task 6: preload

**Files:** Modify `packages/app/src/preload/index.ts`

- [ ] `file: { info: () => invoke('file:info'), … , onChanged: cb => listen('file:changed', cb) }`。`local-file://` 地址由渲染端用 `info().path` 拼出。
- [ ] `library.onImportOpen: cb => listen('library:import-open', cb)`；类型检查；提交。

### Task 7: 单文件模式开关与阅读器改动

**Files:** Create `packages/shared-ui/src/components/viewers/viewerCapabilities.ts`; Modify `PdfToolbar.tsx`、`PdfViewer.tsx`、`PdfLeftSidebar.tsx`、`EpubToolbar.tsx`、`EpubLeftSidebar.tsx`、`EpubViewer.tsx`、`EpubContentArea.tsx`、`TextSelectionToolbar.tsx`、`useReadingTimer.ts`

- [ ] 开关定义：

```ts
export interface ViewerCapabilities { annotate: boolean; library: boolean }
export const ViewerCapabilitiesContext = createContext<ViewerCapabilities>({ annotate: true, library: true })
export const useViewerCapabilities = () => useContext(ViewerCapabilitiesContext)
```

- [ ] `annotate=false` 时隐藏：
  - 工具按钮、颜色选择、批注显示开关
  - 墨迹工具条
  - 批注右键菜单
  - 左栏“批注 / 笔记”两个标签
- [ ] `library=false` 时隐藏：
  - 阅读计时（`useReadingTimer` 不读不写）
  - 标签行
  - 右侧信息栏及其开关
- [ ] `TextSelectionToolbar` 的 `onHighlight` / `onUnderline` 改为可选，缺省时不显示对应按钮。
- [ ] 书库窗口中默认值不变，现有测试全部通过；提交。

### Task 8: 单文件 API 包装

**Files:** Create `packages/shared-ui/src/utils/singleFileApi.ts`, `singleFileApi.test.ts`

- [ ] 测试：
  - `documents.get` 返回由文件信息构造的文档，`metadata` 来自 `getViewState`
  - `documents.update({ metadata })` 合并后调 `setViewState`
  - `readFileRange` / `fileSize` / `readFileBuffer` / `getFileSrc` 转到 `file.*`
  - `annotations.list` 返回 `[]`，`annotations.create` 抛错
  - `notes.list` 返回 `[]`
- [ ] 实现 `createSingleFileApi(base: BanjuanAPI, file: SingleFileAPI, info: SingleFileInfo): BanjuanAPI`：在 `base` 之上覆盖 `documents`、`annotations`、`notes`、`tags`、`docLinks`。文档 id 为 `file:<path>`，类型按扩展名映射。
- [ ] 通过；提交。

### Task 9: 文本会话逻辑

**Files:** Create `packages/shared-ui/src/components/fileWindow/textFileSession.ts`, `textFileSession.test.ts`

- [ ] 测试：
  - UTF-8 内容解码后原样编码回去，字节完全一致（含 BOM、CRLF）
  - 非法 UTF-8 时 `readOnlyReason = 'encoding'`
  - 混合换行按多数统一
  - 编辑后 1s 自动保存（假时钟）；保存中又编辑，保存完后再保存一次
  - 外部变化：未修改时 `reload`，已修改时 `conflict`
  - `gone` 时暂停自动保存
- [ ] 实现：
  - `decodeTextFile(bytes) → { text, bom, eol, readOnlyReason? }`
  - `encodeTextFile(text, { bom, eol }) → Uint8Array`
  - `class TextFileSession`：用 `setText` / `save` / `onExternal(kind)` 维护状态 `saved | dirty | saving | error | conflict | gone`，写入函数可注入
- [ ] 通过；提交。

### Task 10: 编辑器与单文件窗口界面

**Files:** Create `TextFileEditor.tsx`、`FileWindowApp.tsx`；Modify `packages/shared-ui/src/index.ts`（导出 `FileWindowApp`）、i18n 7 个文件

- [ ] `TextFileEditor`：
  - CodeMirror 扩展：`history`、`markdown()`（仅 markdown 类型）、`search` + `searchKeymap`、`EditorView.lineWrapping`、⌘S 绑定立即保存
  - 主题随 `ThemeProvider` 明暗
  - 预览切换：左编辑右预览。预览把相对图片路径改写为 `local-file://<文件夹>/…` 后，交给 `BlockEditor readOnly autoParseMarkdown skipLinkSync`
- [ ] `FileWindowApp`：
  - 标题栏（可拖动、留出红绿灯位置）：文件名、保存状态（文本类型）、预览开关、加入书库 / 在书库中打开
  - 横幅：编码只读、外部修改冲突（载入 / 保留）、文件消失、“在书库「X」中”
  - 主体：文本类型用 `TextFileEditor`；其余类型在 `ViewerCapabilitiesContext({ annotate: false, library: false })` 下渲染 `DocumentViewer`，API 用 `createSingleFileApi`；`unsupported` 类型显示说明和“用系统默认应用打开”
  - 注册 `api.lifecycle.onFlushRequest(flushAll)`，会话保存用 `registerFlushUntilWritten`
- [ ] i18n 新键（7 种语言）：
  - `fileWindow.saved` / `unsaved` / `saving` / `saveFailed`
  - `fileWindow.preview`
  - `fileWindow.addToLibrary` / `noLibrary` / `chooseLibrary`
  - `fileWindow.inLibrary` / `openInLibrary`
  - `fileWindow.encodingReadOnly`
  - `fileWindow.changedOutside` / `loadOutside` / `keepMine`
  - `fileWindow.gone`
  - `fileWindow.unsupported`
- [ ] shared-ui 类型检查与测试通过；提交。

### Task 11: 渲染端入口与书库窗口接收“导入并打开”

**Files:** Modify `packages/app/src/renderer/App.tsx`、`packages/shared-ui/src/components/TabManager.tsx`；Create `packages/shared-ui/src/utils/importAndOpen.ts`

- [ ] `App.tsx`：hash 以 `#file` 开头时渲染 `FileWindowApp`。`MainApp` 解析 `#library=…&importOpen=…`：有就打开指定书库（而不是历史第一个），并把 `importOpen` 传给 `TabManager`。
- [ ] `importAndOpen(api, libraryRoot, absPath)`：
  1. `documents.importFiles([absPath])`（书库内的文件原地导入，书库外的复制并自动改名）
  2. 按相对路径（书库内）或返回的文件名（复制到根目录）在 `documents.list()` 中找到文档
  3. 派发 `banjuan:open-document`
- [ ] `TabManager`：新增 `pendingImportOpen?: string` 属性；挂载后执行一次；同时订阅 `api.library.onImportOpen`。
- [ ] 类型检查；提交。

### Task 12: 命令行与文件关联

**Files:** Modify `packages/cli/src/index.ts`、`packages/cli/src/lib.ts`、`packages/app/electron-builder.yml`

- [ ] CLI：解析前检查 `process.argv[2]`。若不是已知子命令、不以 `-` 开头、并且是存在的文件，则执行 `ensureApp()` 并 `apiPost('/api/view', { path: resolve(arg) })`，打印 `✓ Opened <name>`。
- [ ] `electron-builder.yml` 的 `mac.fileAssociations`：pdf、epub（Viewer）；md / markdown、txt（Editor）；png / jpg / jpeg / gif / webp（Viewer）。全部 `rank: Alternate`。
- [ ] cli 测试通过；提交。

### Task 13: 验证

- [ ] `pnpm verify` 全部通过。
- [ ] 端到端脚本 `sfw.mjs`（隔离 `--user-data-dir` 和 HOME，启动参数带文件）：
  1. PDF 窗口出图，且没有批注工具按钮
  2. 2.5GB PDF 能打开
  3. Markdown（含 CRLF 与 BOM）输入后约 1.5s，原文件字节等于“原内容 + 输入”，其余字节不变
  4. 外部改写文件后编辑器内容更新
  5. 加入书库：原文件不变，书库根目录多一份，书库窗口打开该文档
  6. `POST /api/view` 同一文件两次，只有一个文件窗口
- [ ] 打包安装（`electron-builder --dir --mac --arm64`），在安装版上重跑；再跑已有回归套件（sec、b8、twowin、b11、b12、b13）。
- [ ] 合并到 `integrate/local-test`；不推送。
