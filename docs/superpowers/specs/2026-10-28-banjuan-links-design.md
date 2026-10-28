# `banjuan://` 链接：AI 回答链接回原文 设计

日期：2026-10-28　分支：`feat/llm-friendly`

## 目标

1. AI（Claude Code、内置助手）的回答能附上可点的出处，点了在半卷里打开到对应的文档页、批注或笔记。
2. AI 用 Markdown 读写笔记时，笔记里的链接和嵌入（笔记 / 文档链接、批注引用、文档 / 笔记嵌入）不丢。

只做 macOS（协议在打包配置里登记）。

## 1. 链接格式

| 链接 | 指向 |
|---|---|
| `banjuan://doc/<文档ID>?page=12` | 文档（某页） |
| `banjuan://annotation/<批注ID>?doc=<文档ID>&page=3` | 一处批注（打开它所在文档的那一页） |
| `banjuan://note/<笔记ID>` | 一篇笔记 |

- 都可带 `library=<书房路径>`。文档 ID 由文件内容算出，换台电脑也相同。
- ID 只允许字母、数字、连字符（1–64 位），页码为正整数；其余参数原样保留（供 Markdown 往返用）。
- 解析与生成放在 core（`notes/links.ts`），主进程、接口、Markdown 转换共用。

## 2. 点击链接

- 主进程接 `open-url`（启动早期收到的先排队；启动时有链接就不再另开默认窗口）。
- 选书房：
  1. 带 `library`：只认“最近书房”里有的路径（按真实路径比较），否则当作没带；
  2. 否则在已打开的书房里找含这个 ID 的（文档 / 笔记 / 批注）；
  3. 都没有：打开或调出一个书库窗口，弹出非阻塞提示“找不到链接指向的内容”。
- 书房已在某窗口打开 → 调到前面，发 `library:open-link`；没打开 → 新开书库窗口，hash 带 `library=…&openLink=…`。
- 渲染端（TabManager）：文档 → 打开并到那一页；批注 → 查出文档和页码后同上；笔记 → 打开笔记；查不到 → 提示。
- 只打开查看，链接不能触发任何修改。

## 3. 接口带上链接

- `GET /api/search`：每条结果加 `link`（文档命中带页码，批注带文档和页码）。
- `GET /api/documents/:id/text`：每页加 `link`。
- `GET /api/annotations`：每条加 `link`。
- 以上都带 `library=<当前书房路径>`。
- MCP 工具说明、内置助手提示词、技能说明：引用书房内容时用这些链接注明出处。

## 4. Markdown 往返不丢

`GET /api/notes/:id?format=markdown`（AI 读笔记走这里）改用带链接的写法；导出成 .md 文件仍是原来的 `[[标题]]` 写法，不变。

| 块 | Markdown |
|---|---|
| 笔记链接（有 ID） | `[标题](banjuan://note/<id>)` |
| 文档链接 | `[标题](banjuan://doc/<id>)` |
| 批注引用 | `> [📄 文档名 p.3](banjuan://annotation/<id>?doc=<docId>&page=3)` 下接 `> "原文"`、`> 评论` |
| 文档嵌入 | `> [📘 文档名](banjuan://doc/<id>?embed=1&authors=…&pageCount=…)` |
| 笔记嵌入 | `> [📝 笔记名](banjuan://note/<id>?embed=1&pageIndex=…)` |

写回（`markdownToBlocks`）时按链接还原：行内 `banjuan://note|doc` 链接 → 笔记 / 文档链接；首行只有一个 `banjuan://` 链接的引用段 → 对应的嵌入块。普通 Markdown 工具里这些都是正常链接。

不在往返范围内：文字颜色、背景色、对齐等样式（Markdown 表达不了），在工具说明里写明。

## 5. 测试

- 单测：链接生成 / 解析（合法与非法输入）；笔记块 → Markdown → 块往返后 ID 与属性不变；导出模式输出不变。
- 实测（安装版，隔离数据目录）：`open 'banjuan://doc/<id>?page=3'` 打开到第 3 页；批注、笔记链接；书房未打开时先打开；带陌生路径的链接不打开那个路径；接口结果里有 `link`。
