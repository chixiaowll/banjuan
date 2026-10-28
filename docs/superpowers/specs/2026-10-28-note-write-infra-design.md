# 笔记写入基建（给自动化 / AI 用）设计

日期：2026-10-28　分支：`feat/llm-friendly`

## 背景

外部程序（CC Desk 每晚整理工作、Claude Code、内置助手）要定期往书房写日记、卡片、周报。现状的问题（已核实）：

1. 只能整篇替换：每次“读全文 → 合并 → 整篇写回”，合并出错就丢内容。
2. 没有历史版本：写错无法恢复。
3. 你正在编辑器里改同一篇且未保存时，外部写入会被编辑器的保存盖掉（现设计是本地未保存编辑优先，并提示）。
4. 写入命令没有机器可读输出。
5. 找“某文件夹里标题为 X 的笔记，没有就建”要自己列全量再筛。

分工：半卷提供写入 / 查找能力；CC Desk 负责定时、汇总会话、调 Claude；worklog 技能定规则。

## 1. 笔记历史版本

- 存在 `.banjuan/.note-history/<笔记ID>/<时间戳>-<原因>.json`（原样保存写入前的笔记文件），设备本地，不参与同步（加入同步排除目录）。只对 Markdown 笔记做（脑图、手写不在本期）。
- 何时留版本（在笔记文件锁内、写入前）：
  - 外部写入（接口 / 命令行 / MCP，含按章节写入、恢复）：每次都留；
  - 应用内保存：同一篇 10 分钟内只留一份；但上一次写入来自外部时必留——这样第 3 条里被编辑器盖掉的外部内容也在历史里。
- 保留：每篇最多 50 份；超过 30 天的删除（至少留最新 5 份）。
- 恢复：先把当前内容留一份（恢复可撤销），再写回所选版本的标题和内容。
- 接口：`GET /api/notes/:id/history`、`POST /api/notes/:id/restore {version}`；命令行 `note history <id>`、`note restore <id> <version>`；MCP `note_history`、`restore_note`。

## 2. 按章节写入

- 用一行 Markdown 标题指定章节（如 `## 20261028`），按“级别 + 文字”找第一个匹配的标题块；章节 = 该标题之后直到下一个同级或更高级标题之前。
- 模式：`replace`（替换章节正文，保留标题）、`append`（追加到章节末尾）。
- 章节不存在时新建（标题 + 内容），位置 `newAt`：`top` = 第一个同级或更高级标题之前（日记把新的一天放最上面，H1 标题之下），`bottom` = 文末（默认）。
- 只改动这一节，其余块原样保留（包括链接、嵌入、样式）。
- 接口 `POST /api/notes/:id/section {heading, content, mode, newAt}`；命令行 `note section <id> "<标题行>" (--content|--file) [--mode replace|append] [--new-at top|bottom]`；MCP `update_note_section`。

## 3. 找或建

- 按文件夹（直接子级）+ 完全相同的标题找；有就返回，没有就用给的内容新建。重复执行不会建出第二篇。
- 接口 `POST /api/notes/ensure {title, folder, content}` → `{ ...笔记, created }`；命令行 `note ensure <title> --folder <f> [--content|--file]`；MCP `ensure_note`。

## 4. 机器可读

- 写入类接口返回的笔记带 `link`（`banjuan://note/<id>?library=…`）。
- 命令行 `note create / update / move / ensure / section / restore / history` 支持 `--json`（`id`、`title`、`path`、`link`，ensure 另有 `created`）；失败时退出码非零、错误写到 stderr。

## 5. 按时间取变更

- `GET /api/notes?since=<日期或时间>`：更新时间不早于它的笔记；命令行 `note list --since 2026-10-24`；MCP `list_notes` 加 `since`。

## 测试

- 单测：章节定位与写入（替换 / 追加 / 新建在顶部或底部、级别边界、不动其他块）；历史（外部每次留、应用内 10 分钟合并、外部写入后的应用内保存必留、保留上限、恢复可撤销）；找或建（同文件夹同名返回已有、其他文件夹同名不算）。
- 实测（隔离实例，命令行 + MCP）：日记按章节追加 / 新增一天；ensure 两次只有一篇；外部写入后应用内编辑器覆盖 → 历史里能找回外部那版并恢复；`--json` 输出可解析；`--since` 过滤。
