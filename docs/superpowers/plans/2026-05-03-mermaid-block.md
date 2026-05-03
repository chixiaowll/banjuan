# Mermaid Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Mermaid diagram block to the BlockNote editor so users can write Mermaid syntax and see rendered diagrams inline in their notes.

**Architecture:** A new `mermaidBlock` custom block type registered in BlockNote's schema. The block has three view modes (code/preview/split), uses CodeMirror 6 for syntax editing and the `mermaid` library for SVG rendering. No database changes — Mermaid source lives in the note's existing JSON content as a block prop.

**Tech Stack:** BlockNote (`createReactBlockSpec`), CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/theme-one-dark`), Mermaid JS

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `packages/app/src/renderer/components/notes/blocks/MermaidBlock.tsx` | Top-level block spec + toolbar + view mode switching |
| **Create:** `packages/app/src/renderer/components/notes/blocks/MermaidCodeEditor.tsx` | CodeMirror 6 editor wrapper |
| **Create:** `packages/app/src/renderer/components/notes/blocks/MermaidPreview.tsx` | Mermaid → SVG rendering |
| **Create:** `packages/app/src/renderer/components/notes/blocks/mermaidTemplates.ts` | Template strings for flowchart, sequence, gantt |
| **Modify:** `packages/app/src/renderer/components/notes/BlockEditor.tsx` | Register mermaidBlock in schema |
| **Modify:** `packages/app/src/renderer/components/notes/BlockEditor.css` | Styles for mermaid block |
| **Modify:** `packages/app/package.json` | Add mermaid + codemirror dependencies |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `packages/app/package.json`

- [ ] **Step 1: Install mermaid and CodeMirror packages**

```bash
cd packages/app
pnpm add mermaid @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/theme-one-dark
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/chixiao/Documents/work/research/newproject
pnpm ls mermaid @codemirror/view --filter @banjuan/app
```

Expected: Both packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add packages/app/package.json pnpm-lock.yaml
git commit -m "chore: add mermaid and codemirror dependencies"
```

---

### Task 2: Mermaid Templates

**Files:**
- Create: `packages/app/src/renderer/components/notes/blocks/mermaidTemplates.ts`

- [ ] **Step 1: Create template file**

```typescript
export const FLOWCHART_TEMPLATE = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]`

export const SEQUENCE_TEMPLATE = `sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi`

export const GANTT_TEMPLATE = `gantt
    title Project Plan
    section Phase 1
    Task A :a1, 2024-01-01, 30d
    Task B :after a1, 20d`

export interface MermaidTemplate {
  label: string
  code: string
}

export const MERMAID_TEMPLATES: MermaidTemplate[] = [
  { label: 'Flowchart', code: FLOWCHART_TEMPLATE },
  { label: 'Sequence', code: SEQUENCE_TEMPLATE },
  { label: 'Gantt', code: GANTT_TEMPLATE },
]
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/chixiao/Documents/work/research/newproject
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to `mermaidTemplates.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/notes/blocks/mermaidTemplates.ts
git commit -m "feat: add mermaid diagram templates"
```

---

### Task 3: MermaidPreview Component

**Files:**
- Create: `packages/app/src/renderer/components/notes/blocks/MermaidPreview.tsx`

- [ ] **Step 1: Create the preview component**

```tsx
import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: 'inherit',
})

let renderCounter = 0

interface Props {
  code: string
}

export default function MermaidPreview({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code.trim()) {
      if (containerRef.current) containerRef.current.innerHTML = ''
      setError(null)
      return
    }

    const id = `mermaid-${++renderCounter}`
    let cancelled = false

    mermaid.render(id, code).then(({ svg }) => {
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = svg
      setError(null)
    }).catch((err) => {
      if (cancelled) return
      setError(err?.message || 'Invalid Mermaid syntax')
      if (containerRef.current) containerRef.current.innerHTML = ''
    })

    return () => { cancelled = true }
  }, [code])

  if (!code.trim()) {
    return (
      <div className="mermaid-preview mermaid-preview--empty">
        Write Mermaid syntax to see diagram
      </div>
    )
  }

  return (
    <div className="mermaid-preview">
      {error && <div className="mermaid-preview__error">{error}</div>}
      <div ref={containerRef} className="mermaid-preview__svg" />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to `MermaidPreview.tsx`.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/notes/blocks/MermaidPreview.tsx
git commit -m "feat: add MermaidPreview component for SVG rendering"
```

---

### Task 4: MermaidCodeEditor Component

**Files:**
- Create: `packages/app/src/renderer/components/notes/blocks/MermaidCodeEditor.tsx`

- [ ] **Step 1: Create the CodeMirror editor wrapper**

```tsx
import React, { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { lineNumbers } from '@codemirror/view'

interface Props {
  code: string
  onChange: (code: string) => void
}

export default function MermaidCodeEditor({ code, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const createUpdateListener = useCallback(() => {
    return EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        oneDark,
        createUpdateListener(),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { minHeight: '120px', fontSize: '13px' },
          '.cm-content': { fontFamily: 'monospace', padding: '8px 0' },
          '.cm-gutters': { minWidth: '32px' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== code) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: code },
      })
    }
  }, [code])

  return <div ref={containerRef} className="mermaid-code-editor" />
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to `MermaidCodeEditor.tsx`. If `@codemirror/commands` is missing, install it:

```bash
cd packages/app && pnpm add @codemirror/commands
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/notes/blocks/MermaidCodeEditor.tsx
git commit -m "feat: add MermaidCodeEditor component with CodeMirror 6"
```

---

### Task 5: MermaidBlock Component

**Files:**
- Create: `packages/app/src/renderer/components/notes/blocks/MermaidBlock.tsx`

This is the main block spec that ties together the toolbar, code editor, and preview.

- [ ] **Step 1: Create the MermaidBlock component**

```tsx
import React, { useState, useCallback, lazy, Suspense } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { FLOWCHART_TEMPLATE, MERMAID_TEMPLATES } from './mermaidTemplates.js'

const MermaidCodeEditor = lazy(() => import('./MermaidCodeEditor.js'))
const MermaidPreview = lazy(() => import('./MermaidPreview.js'))

type ViewMode = 'code' | 'preview' | 'split'

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaidBlock' as const,
    propSchema: {
      code: { default: FLOWCHART_TEMPLATE },
      viewMode: { default: 'split' as const },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { code, viewMode } = props.block.props

      return (
        <MermaidBlockContent
          code={code}
          viewMode={viewMode as ViewMode}
          onCodeChange={(newCode) => {
            props.editor.updateBlock(props.block, {
              props: { code: newCode },
            })
          }}
          onViewModeChange={(mode) => {
            props.editor.updateBlock(props.block, {
              props: { viewMode: mode },
            })
          }}
          readOnly={!props.editor.isEditable}
        />
      )
    },
  }
)()

interface ContentProps {
  code: string
  viewMode: ViewMode
  onCodeChange: (code: string) => void
  onViewModeChange: (mode: ViewMode) => void
  readOnly: boolean
}

function MermaidBlockContent({ code, viewMode, onCodeChange, onViewModeChange, readOnly }: ContentProps) {
  const [localCode, setLocalCode] = useState(code)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>()

  const handleCodeChange = useCallback((newCode: string) => {
    setLocalCode(newCode)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onCodeChange(newCode)
    }, 300)
  }, [onCodeChange])

  const handleTemplateSelect = useCallback((templateCode: string) => {
    setLocalCode(templateCode)
    onCodeChange(templateCode)
  }, [onCodeChange])

  React.useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  React.useEffect(() => {
    setLocalCode(code)
  }, [code])

  if (readOnly) {
    return (
      <div className="mermaid-block" contentEditable={false}>
        <Suspense fallback={<div className="mermaid-loading">Loading diagram...</div>}>
          <MermaidPreview code={localCode} />
        </Suspense>
      </div>
    )
  }

  const activeMode = viewMode || 'split'

  return (
    <div className="mermaid-block" contentEditable={false}>
      <div className="mermaid-toolbar">
        <div className="mermaid-toolbar__modes">
          <button
            className={`mermaid-toolbar__btn ${activeMode === 'code' ? 'mermaid-toolbar__btn--active' : ''}`}
            onClick={() => onViewModeChange('code')}
            title="Code"
          >
            {'</>'}
          </button>
          <button
            className={`mermaid-toolbar__btn ${activeMode === 'split' ? 'mermaid-toolbar__btn--active' : ''}`}
            onClick={() => onViewModeChange('split')}
            title="Split"
          >
            ⬜⬜
          </button>
          <button
            className={`mermaid-toolbar__btn ${activeMode === 'preview' ? 'mermaid-toolbar__btn--active' : ''}`}
            onClick={() => onViewModeChange('preview')}
            title="Preview"
          >
            ▶
          </button>
        </div>
        <div className="mermaid-toolbar__templates">
          {MERMAID_TEMPLATES.map((t) => (
            <button
              key={t.label}
              className="mermaid-toolbar__btn"
              onClick={() => handleTemplateSelect(t.code)}
              title={t.label}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<div className="mermaid-loading">Loading...</div>}>
        <div className={`mermaid-body mermaid-body--${activeMode}`}>
          {(activeMode === 'code' || activeMode === 'split') && (
            <div className="mermaid-body__editor">
              <MermaidCodeEditor code={localCode} onChange={handleCodeChange} />
            </div>
          )}
          {(activeMode === 'preview' || activeMode === 'split') && (
            <div className="mermaid-body__preview">
              <MermaidPreview code={localCode} />
            </div>
          )}
        </div>
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to `MermaidBlock.tsx`.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/notes/blocks/MermaidBlock.tsx
git commit -m "feat: add MermaidBlock component with toolbar and view modes"
```

---

### Task 6: Register Block in Schema and Add Slash Menu Item

**Files:**
- Modify: `packages/app/src/renderer/components/notes/BlockEditor.tsx:1-46` (imports and schema)
- Modify: `packages/app/src/renderer/components/notes/BlockEditor.tsx:363-387` (render section for slash menu)

- [ ] **Step 1: Add import to BlockEditor.tsx**

At the top of `BlockEditor.tsx`, after the existing block imports (line 10, after `import { FileEmbed }`), add:

```typescript
import { MermaidBlock } from './blocks/MermaidBlock.js'
```

- [ ] **Step 2: Register in schema**

In the `BlockNoteSchema.create()` call (around line 34-46), add `mermaidBlock` to `blockSpecs`:

```typescript
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
    noteEmbed: NoteEmbed,
    fileEmbed: FileEmbed,
    mermaidBlock: MermaidBlock,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteLink: NoteLink,
  },
})
```

- [ ] **Step 3: Add slash menu item**

Import `getDefaultReactSlashMenuItems` at the top of BlockEditor.tsx:

```typescript
import { SuggestionMenuController, useCreateBlockNote, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlock } from '@blocknote/core'
```

Add a `getMermaidSlashItem` function before the `BlockEditor` component (after `extractNoteLinks`):

```typescript
function getMermaidSlashItem(editor: any) {
  return {
    title: 'Mermaid Diagram',
    subtext: 'Insert a Mermaid diagram',
    group: 'Media',
    onItemClick: () => {
      insertOrUpdateBlock(editor, {
        type: 'mermaidBlock' as any,
      })
    },
    aliases: ['mermaid', 'diagram', 'flowchart', 'chart'],
  }
}
```

Inside the `BlockEditor` component (around where `getNoteLinkItems` is defined), add a `getSlashMenuItems` callback:

```typescript
const getSlashMenuItems = useCallback(async (query: string) => {
  const defaultItems = getDefaultReactSlashMenuItems(editor)
  const mermaidItem = getMermaidSlashItem(editor)
  return filterSuggestionItems([...defaultItems, mermaidItem], query)
}, [editor])
```

In the JSX return, add a `SuggestionMenuController` for the slash menu (inside the `{!readOnly && (<>...</>)}` block, after the existing `SuggestionMenuController` elements):

```tsx
<SuggestionMenuController
  triggerCharacter="/"
  getItems={getSlashMenuItems}
/>
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors. If `insertOrUpdateBlock` or `getDefaultReactSlashMenuItems` types cause issues, check the BlockNote version and adjust imports accordingly.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/components/notes/BlockEditor.tsx
git commit -m "feat: register MermaidBlock in schema and add slash menu item"
```

---

### Task 7: CSS Styles

**Files:**
- Modify: `packages/app/src/renderer/components/notes/BlockEditor.css`

- [ ] **Step 1: Add Mermaid block styles**

Append the following CSS to the end of `BlockEditor.css`:

```css
/* ── Mermaid Block ── */

.mermaid-block {
  border: 1px solid var(--border, #e1e4e8);
  border-radius: 8px;
  overflow: hidden;
  margin: 8px 0;
}

.mermaid-toolbar {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid var(--border, #e1e4e8);
  background: var(--surface, #f6f8fa);
  gap: 4px;
}

.mermaid-toolbar__modes {
  display: flex;
  gap: 2px;
}

.mermaid-toolbar__templates {
  display: flex;
  gap: 2px;
}

.mermaid-toolbar__btn {
  border: none;
  background: transparent;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-muted, #6a737d);
  line-height: 1;
}

.mermaid-toolbar__btn:hover {
  background: var(--hover, rgba(0, 0, 0, 0.06));
  color: var(--text, #24292e);
}

.mermaid-toolbar__btn--active {
  background: var(--hover, rgba(0, 0, 0, 0.08));
  color: var(--text, #24292e);
  font-weight: 600;
}

.mermaid-body {
  display: flex;
  min-height: 160px;
}

.mermaid-body--code .mermaid-body__editor {
  flex: 1;
}

.mermaid-body--preview .mermaid-body__preview {
  flex: 1;
}

.mermaid-body--split {
  flex-direction: row;
}

.mermaid-body--split .mermaid-body__editor {
  flex: 1;
  border-right: 1px solid var(--border, #e1e4e8);
}

.mermaid-body--split .mermaid-body__preview {
  flex: 1;
}

.mermaid-code-editor {
  height: 100%;
}

.mermaid-code-editor .cm-editor {
  height: 100%;
}

.mermaid-preview {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.mermaid-preview--empty {
  color: var(--text-muted, #6a737d);
  font-size: 13px;
  font-style: italic;
}

.mermaid-preview__svg {
  width: 100%;
  display: flex;
  justify-content: center;
}

.mermaid-preview__svg svg {
  max-width: 100%;
  height: auto;
}

.mermaid-preview__error {
  color: #d73a49;
  font-size: 12px;
  padding: 8px 12px;
  background: rgba(215, 58, 73, 0.06);
  border-radius: 4px;
  width: 100%;
  margin-bottom: 8px;
}

.mermaid-loading {
  color: var(--text-muted, #6a737d);
  font-size: 13px;
  padding: 16px;
  text-align: center;
}
```

- [ ] **Step 2: Verify the app builds**

```bash
cd /Users/chixiao/Documents/work/research/newproject
pnpm --filter @banjuan/app dev &
# Wait a few seconds, then check for build errors in output
# Kill dev server after verification
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/notes/BlockEditor.css
git commit -m "feat: add CSS styles for Mermaid block"
```

---

### Task 8: Manual Testing and Fixes

**Files:**
- Potentially any of the files created/modified above

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/chixiao/Documents/work/research/newproject
pnpm --filter @banjuan/app dev
```

- [ ] **Step 2: Test inserting a Mermaid block**

1. Open the app, create or open a note
2. Type `/` to open the slash menu
3. Search for "Mermaid" or "Diagram"
4. Select "Mermaid Diagram"
5. Verify: A mermaid block appears with the flowchart template in split view

- [ ] **Step 3: Test view modes**

1. Click the code button (`</>`) — verify only the CodeMirror editor shows
2. Click the split button (⬜⬜) — verify editor on left, preview on right
3. Click the preview button (▶) — verify only the SVG preview shows

- [ ] **Step 4: Test code editing**

1. In split mode, modify the Mermaid code in the editor
2. Verify the preview updates after ~300ms debounce
3. Write intentionally invalid syntax — verify an error message shows in the preview area (no crash)

- [ ] **Step 5: Test templates**

1. Click "Sequence" in the toolbar — verify code and preview update to the sequence diagram template
2. Click "Gantt" — verify gantt chart renders
3. Click "Flowchart" — verify it returns to the flowchart template

- [ ] **Step 6: Test read-only mode**

1. Use `![[note_name]]` to embed a note that contains a Mermaid block
2. Verify the embedded version shows only the preview (no toolbar, no code editor)

- [ ] **Step 7: Test persistence**

1. Create a Mermaid block, edit the code, switch to preview mode
2. Close and reopen the note
3. Verify: The code is preserved, and the view mode is preserved

- [ ] **Step 8: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: address issues found in Mermaid block manual testing"
```

---

## Verification Checklist

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] App starts without console errors
- [ ] Mermaid block insertable via `/` slash menu
- [ ] Three view modes (code/preview/split) all work
- [ ] CodeMirror editor has syntax highlighting and line numbers
- [ ] Mermaid SVG renders correctly for flowchart, sequence, gantt
- [ ] Syntax errors display gracefully (no crash)
- [ ] Templates switch the code and re-render
- [ ] Read-only mode shows preview only
- [ ] Block persists code and viewMode across note save/reload
