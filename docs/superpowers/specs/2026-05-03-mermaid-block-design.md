# Mermaid Block Design Spec

## Goal

Add a Mermaid diagram block type to the BlockNote editor, allowing users to write Mermaid syntax and see real-time rendered diagrams (flowcharts, sequence diagrams, Gantt charts, etc.) inline within their notes.

## Architecture

A new `mermaid` BlockNote custom block that stores Mermaid source code as a block prop. The block supports three view modes (code, preview, split) and uses CodeMirror for editing with syntax highlighting, and the `mermaid` library for SVG rendering. No new database tables or note types are needed — the Mermaid code lives inside the note's existing JSON content.

## Block Spec

```typescript
{
  type: 'mermaid',
  propSchema: {
    code: { default: '' },
    viewMode: { default: 'split' }  // 'code' | 'preview' | 'split'
  },
  content: 'none'
}
```

- `code`: Raw Mermaid syntax string
- `viewMode`: Persisted per-block, so each diagram remembers the user's preferred view

## Components

### MermaidBlock

Top-level component registered via `createReactBlockSpec`. Manages view mode state and coordinates the editor and preview.

**File**: `packages/app/src/renderer/components/notes/blocks/MermaidBlock.tsx`

Structure:
```
MermaidBlock (contentEditable=false)
├── MermaidToolbar
│   ├── View mode toggle: code | split | preview (icon buttons)
│   └── Template dropdown: flowchart, sequence, gantt
├── (view mode dependent)
│   ├── code:    MermaidCodeEditor (full width)
│   ├── preview: MermaidPreview (full width)
│   └── split:   MermaidCodeEditor (50%) | MermaidPreview (50%)
```

### MermaidCodeEditor

CodeMirror 6 editor instance configured for Mermaid syntax.

**File**: `packages/app/src/renderer/components/notes/blocks/MermaidCodeEditor.tsx`

- Uses `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown` (Mermaid has no official CM6 language, markdown is close enough for basic highlighting)
- Dark theme background to match code blocks in the editor
- Calls `onChange` with debounce (300ms) to trigger re-render
- Minimum height: 120px, grows with content

### MermaidPreview

Renders Mermaid source to SVG using the `mermaid` library.

**File**: `packages/app/src/renderer/components/notes/blocks/MermaidPreview.tsx`

- Calls `mermaid.render(id, code)` which returns an SVG string
- Inserts SVG into a container div via `dangerouslySetInnerHTML`
- On syntax error: displays error message in a muted style (no crash, no blocking)
- SVG is centered within the container
- Empty state: shows placeholder text "Write Mermaid syntax to see diagram"

## Templates

When inserting a new Mermaid block, offer three starter templates via the toolbar dropdown:

**Flowchart** (default):
```
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]
```

**Sequence Diagram**:
```
sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi
```

**Gantt Chart**:
```
gantt
    title Project Plan
    section Phase 1
    Task A :a1, 2024-01-01, 30d
    Task B :after a1, 20d
```

Users can write any valid Mermaid syntax beyond these templates — the renderer accepts all Mermaid-supported diagram types.

## Slash Menu Integration

Add a "Mermaid Diagram" item to the BlockNote slash menu (`/` command):
- Label: "Mermaid Diagram"
- Icon: A simple diagram icon or the text "```"
- Group: "Media" (alongside existing image/file embeds)
- Action: Insert a mermaid block with the flowchart template as default code

## Editor Schema Registration

Add `mermaidBlock: MermaidBlock` to the existing schema in `BlockEditor.tsx`:

```typescript
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
    noteEmbed: NoteEmbed,
    fileEmbed: FileEmbed,
    mermaidBlock: MermaidBlock,  // new
  },
  // ...
})
```

## Styling

**File**: Add styles to existing `BlockEditor.css`

- Block container: `border: 1px solid var(--border)`, `border-radius: 8px`, `overflow: hidden`
- Toolbar: `height: 36px`, `border-bottom: 1px solid var(--border)`, `padding: 0 8px`, icon buttons
- Code editor: dark background (`#1e1e1e` or match existing code block theme), monospace font
- Preview area: white/transparent background, SVG centered, `padding: 16px`
- Split mode: flexbox row, 50/50, vertical divider `1px solid var(--border)`
- Error state: red-tinted text, `font-size: 12px`, `color: var(--text-muted)`

## Read-Only Mode

When the BlockNote editor is in `readOnly` mode (e.g., in note embeds), the Mermaid block:
- Shows only the rendered preview (no toolbar, no code editor)
- Falls back to preview mode regardless of stored `viewMode`

## Dependencies

New npm packages:
- `mermaid` — Diagram rendering engine
- `@codemirror/view` — CodeMirror 6 core view
- `@codemirror/state` — CodeMirror 6 state management
- `@codemirror/lang-markdown` — Syntax highlighting (best available match for Mermaid)
- `@codemirror/theme-one-dark` — Dark theme for code editor

## Mermaid Configuration

Initialize mermaid once at module level:
```typescript
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: 'inherit',
})
```

- `startOnLoad: false` — We control rendering manually
- `securityLevel: 'strict'` — Prevent XSS in SVG output
- Theme can later be made dynamic (dark mode support)

## Scope Exclusions

The following are explicitly out of scope for this implementation:
- Visual drag-and-drop flowchart editing (this is a code-based solution)
- Mermaid-specific syntax highlighting (use markdown highlighting as approximation)
- Export individual diagrams as PNG/SVG (can be added later)
- Dark mode theme for rendered SVG (use mermaid default theme for now)
