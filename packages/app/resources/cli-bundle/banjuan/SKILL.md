---
name: banjuan
description: Use when the user asks to manage their research library, look up documents, create or edit notes, search annotations, organize with tags, or work with mindmaps. Also use when the user mentions 半卷, 书房, banjuan, or their PDF/EPUB research collection.
---

# Banjuan CLI

CLI tool for the 半卷闲书 (Banjuan) research library app. Manages PDF/EPUB documents, markdown notes, annotations, mindmaps, and tags via the desktop app's HTTP API.

Most commands auto-launch the desktop app if not running. `history` works offline.

## Quick Reference

| Task | Command |
|------|---------|
| Check status | `banjuan status` |
| Create library | `banjuan init <path> [--name "名称"]` |
| Open library | `banjuan open <path>` |
| Switch active library | `banjuan use <path>` |
| List documents | `banjuan doc list [--tag <t>] [--type <t>]` |
| List folders | `banjuan folder list` |
| Create folder | `banjuan folder create <name> [--parent <id>]` |
| Create note | `banjuan note create <title> [--doc <id>] [--folder <id>]` |
| Search everything | `banjuan search <query> [--type document\|note\|annotation]` |
| Build mindmap | `banjuan mindmap create <title>` then `mindmap import <id> --json '{...}'` |
| View history | `banjuan history` |

## Multi-Library

Multiple libraries can be open simultaneously. Commands target the **active library** by default.

- `banjuan use <path>` — switch active library
- `banjuan --library <path> <command>` — target a specific library without switching
- `banjuan status` — shows all open libraries, active one marked `(当前)`

## All Commands

### App Lifecycle

```bash
banjuan status     # App status + open libraries
banjuan start      # Launch desktop app
banjuan stop       # Quit desktop app
```

### Library Management

```bash
banjuan init <path> [--name "名称"]   # Create library (opens if exists)
banjuan open <path>                   # Open existing library
banjuan close [path]                  # Close library (active if omitted)
banjuan list                          # List open libraries
banjuan use <path>                    # Switch active library
banjuan history                       # Past libraries (offline)
```

### Folders

```bash
banjuan folder list [--json]
banjuan folder create <name> [--parent <folder-id>]
banjuan folder rename <id> <new-name>
banjuan folder delete <id>
```

### Documents

```bash
banjuan doc list [--tag <tag>] [--type <type>] [--json]
banjuan doc info <id> [--json]
banjuan doc delete <id>
```

### Notes

```bash
banjuan note create <title> [--doc <id>] [--folder <folder-id>] [--content "<md>" | --file <path>]
banjuan note list [--doc <id>] [--type <type>] [--tag <tag>] [--folder <folder-id>] [--json]
banjuan note show <id>
banjuan note update <id> [--title "new"] [--content "markdown 文本"]
banjuan note delete <id>
banjuan note move <id> [folder-id]
```

**Note content on create** — provide markdown three ways (precedence `--content` > `--file` > stdin):

```bash
banjuan note create "标题" --content "# Hello"      # inline markdown
banjuan note create "标题" --file ./intro.md         # from a file (preferred)
banjuan note create "标题" < ./intro.md              # from stdin
```

Local images referenced in the markdown (`![](img/x.png)`) are imported into the
note automatically. **Prefer `--file`** when the markdown has images — paths
resolve relative to the file (`--content`/stdin resolve relative to the current
dir). Remote `http(s)://` images are left as-is.

### Annotations

```bash
banjuan ann list <doc-id> [--page <n>] [--json]
```

### Mindmaps

```bash
banjuan mindmap create <title> [--doc <id>]
banjuan mindmap list [--doc <id>] [--json]
banjuan mindmap show <id> [--json]
banjuan mindmap add-node <mindmap-id> <title> [--parent <node-id>] [--color <c>] [--shape <s>]
banjuan mindmap update-node <node-id> [--title "new"] [--color <c>] [--content <c>]
banjuan mindmap remove-node <node-id>
banjuan mindmap add-edge <mindmap-id> --from <node-id> --to <node-id> [--label "text"]
banjuan mindmap remove-edge <edge-id>
banjuan mindmap import <mindmap-id> --json '<data>' | --file <path> | stdin
```

### Tags

```bash
banjuan tag list [--json]
banjuan tag assign <target-id> <type> <tag-name>     # type: document|note
banjuan tag unassign <target-id> <type> <tag-name>   # 移除标签
banjuan tag delete <id>                              # 删除标签
```

### Search

```bash
banjuan search <query> [--type <type>] [--limit <n>] [--json]
```

## Common Workflows

**First-time setup:**
```bash
banjuan init ~/Documents/研究资料 --name "研究资料"
banjuan doc list    # PDF/EPUB files are auto-imported
```

**Research session:**
```bash
banjuan open ~/Documents/研究资料
banjuan doc list
banjuan note create "阅读笔记" --doc <doc-id>
banjuan ann list <doc-id>
banjuan search "关键概念"
```

**Build a mindmap (batch import — preferred for AI):**

First create the mindmap, then import the full structure via JSON:
```bash
banjuan mindmap create "论文框架"
# Use the returned ID for import:
banjuan mindmap import <mindmap-id> --json '<JSON>'
banjuan mindmap show <mindmap-id>   # Verify the tree
```

Import JSON schema:
```jsonc
{
  "nodes": [              // Required. Top-level nodes (roots of the tree)
    {
      "title": "中心主题",  // Required. Node label
      "id": "temp-1",      // Optional. Temp ID for edge references
      "content": "",       // Optional. Rich text content
      "notes": "",         // Optional. Node notes/memo
      "color": "#4ecdc4",  // Optional. Background color (hex)
      "shape": "box",      // Optional. roundedRect | box | ellipse | ...
      "hyperlink": "",     // Optional. URL link
      "imageUrl": "",      // Optional. Image URL
      "children": [        // Optional. Nested child nodes (recursive)
        {
          "title": "子节点",
          "children": [...]
        }
      ]
    }
  ],
  "edges": [              // Optional. Extra connections between nodes
    {
      "source": "temp-1",  // Node ID (temp or real)
      "target": "temp-2",
      "label": "关系说明"    // Optional. Edge label
    }
  ]
}
```

Example — complete mindmap in one command:
```bash
banjuan mindmap import <id> --json '{
  "nodes": [
    {"title": "中心主题", "children": [
      {"title": "研究背景", "color": "#4ecdc4", "children": [
        {"title": "现有方法"},
        {"title": "问题与挑战"}
      ]},
      {"title": "本文贡献", "color": "#ff6b6b", "children": [
        {"title": "方法一"},
        {"title": "方法二"}
      ]},
      {"title": "实验结果", "color": "#45b7d1"}
    ]}
  ]
}'
```

**Build a mindmap (step by step):**
```bash
banjuan mindmap create "读书笔记"
banjuan mindmap add-node <mm-id> "核心概念"           # Returns node-id
banjuan mindmap add-node <mm-id> "子概念A" --parent <node-id>
banjuan mindmap add-node <mm-id> "子概念B" --parent <node-id> --color "#ff6b6b"
```

**Cross-library query:**
```bash
banjuan --library ~/lib1 search "topic"
banjuan --library ~/lib2 search "topic"
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Commands fail with 503 | No library open — run `banjuan open <path>` first |
| Wrong library targeted | Check `banjuan status`, use `banjuan use <path>` to switch |
| Can't find document by ID | Copy the full UUID from list output |
| App not responding | Run `banjuan start` or check `banjuan status` |

## Output

- Default: human-readable tables
- `--json`: machine-readable, pipe to `jq` for processing
- IDs are full UUIDs, use them as-is in commands
