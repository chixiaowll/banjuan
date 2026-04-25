# Phase 4: Note System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add note-taking capabilities — a Milkdown-based Markdown editor, note list/management UI, note IPC bridge, and integration with annotations so users can create notes linked to their highlights.

**Architecture:** Notes are stored as Markdown files on disk with metadata in SQLite (already built in @banjuan/core NoteService). The app needs IPC handlers, a note list view in the sidebar, a note editor view using Milkdown, and the ability to create notes from annotation context.

**Tech Stack:** Milkdown (ProseMirror), React, Electron IPC, existing @banjuan/core NoteService

---

## File Structure

```
packages/app/src/
├── main/
│   └── ipc.ts                          # Add note IPC handlers
├── preload/
│   └── index.ts                        # Add notes namespace
├── renderer/
│   ├── App.tsx                         # Add note viewing state
│   ├── components/
│   │   ├── notes/
│   │   │   ├── NoteEditor.tsx         # Milkdown editor wrapper
│   │   │   ├── NoteList.tsx           # Note list panel
│   │   │   └── NoteCard.tsx           # Single note card in list
│   │   ├── annotations/
│   │   │   └── AnnotationSidebar.tsx  # Add "create note" button per annotation
│   │   └── viewers/
│   │       └── DocumentViewer.tsx      # Add note creation from annotations
│   └── views/
│       ├── LibraryView.tsx            # Add notes section in sidebar
│       └── NoteView.tsx               # Full note editor view
├── electron.d.ts                       # Add notes types
```

---

## Task 1: Note IPC Bridge

**Files:**
- Modify: `packages/app/src/main/ipc.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/electron.d.ts`

- [ ] **Step 1: Add note IPC handlers in ipc.ts**

Add after the annotation handlers:

```typescript
ipcMain.handle('notes:create', async (_event, input: {
  title: string; docId?: string; annotationIds?: string[]; content?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.notes.create(input)
})

ipcMain.handle('notes:list', async (_event, options?: {
  docId?: string; tag?: string; sort?: string; order?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.notes.list(options as any)
})

ipcMain.handle('notes:get', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.notes.get(id)
})

ipcMain.handle('notes:update', async (_event, id: string, updates: {
  title?: string; content?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.notes.update(id, updates)
})

ipcMain.handle('notes:delete', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.notes.delete(id)
})

ipcMain.handle('notes:getAnnotations', async (_event, noteId: string) => {
  if (!library) throw new Error('No library open')
  return library.notes.getAnnotations(noteId)
})
```

- [ ] **Step 2: Add notes to preload**

```typescript
notes: {
  create: (input: { title: string; docId?: string; annotationIds?: string[]; content?: string }) =>
    ipcRenderer.invoke('notes:create', input),
  list: (options?: { docId?: string; tag?: string; sort?: string; order?: string }) =>
    ipcRenderer.invoke('notes:list', options),
  get: (id: string) => ipcRenderer.invoke('notes:get', id),
  update: (id: string, updates: { title?: string; content?: string }) =>
    ipcRenderer.invoke('notes:update', id, updates),
  delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
  getAnnotations: (noteId: string) => ipcRenderer.invoke('notes:getAnnotations', noteId),
},
```

- [ ] **Step 3: Update electron.d.ts**

Add to ElectronAPI interface:

```typescript
notes: {
  create: (input: { title: string; docId?: string; annotationIds?: string[]; content?: string }) => Promise<any>
  list: (options?: { docId?: string; tag?: string; sort?: string; order?: string }) => Promise<any[]>
  get: (id: string) => Promise<any>
  update: (id: string, updates: { title?: string; content?: string }) => Promise<any>
  delete: (id: string) => Promise<void>
  getAnnotations: (noteId: string) => Promise<any[]>
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): add note IPC handlers"
```

---

## Task 2: Install Milkdown + Create NoteEditor Component

**Files:**
- Create: `packages/app/src/renderer/components/notes/NoteEditor.tsx`

- [ ] **Step 1: Install Milkdown packages**

```bash
pnpm --filter @banjuan/app add @milkdown/kit @milkdown/plugin-listener @milkdown/theme-nord
```

`@milkdown/kit` bundles the core editor, commonmark syntax, and ProseMirror essentials. `@milkdown/plugin-listener` enables content change callbacks. `@milkdown/theme-nord` provides a dark theme that fits our Catppuccin-style UI.

- [ ] **Step 2: Create NoteEditor component**

A Milkdown WYSIWYG Markdown editor that:
- Renders existing markdown content
- Calls `onChange` when content changes (debounced)
- Supports standard Markdown (headings, bold, italic, links, code, lists, blockquotes)

```typescript
// NoteEditor.tsx
import React, { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { nord } from '@milkdown/theme-nord'
import '@milkdown/theme-nord/style.css'

interface Props {
  initialContent: string
  onChange: (markdown: string) => void
  readOnly?: boolean
}

export default function NoteEditor({ initialContent, onChange, readOnly }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const editorInstance = useRef<Editor | null>(null)

  useEffect(() => {
    if (!editorRef.current) return

    const setupEditor = async () => {
      const editor = await Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, editorRef.current!)
          ctx.set(defaultValueCtx, initialContent)
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChange(markdown)
          })
        })
        .use(commonmark)
        .use(history)
        .use(listener)
        .create()

      editorInstance.current = editor

      if (readOnly) {
        const view = editor.ctx.get(editorViewCtx)
        view.setProps({ editable: () => false })
      }
    }

    setupEditor()

    return () => {
      editorInstance.current?.destroy()
      editorInstance.current = null
    }
  }, [])

  return (
    <div
      ref={editorRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px 24px',
        fontSize: 14,
        lineHeight: 1.7,
      }}
    />
  )
}
```

Note: The Milkdown API may vary slightly between versions. The key imports from `@milkdown/kit` bundle the core, and `@milkdown/plugin-listener` provides the `markdownUpdated` callback. If the API differs at install time, adjust accordingly — the goal is a working WYSIWYG Markdown editor with a change callback.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): Milkdown-based note editor component"
```

---

## Task 3: NoteView — Full Note Editing Screen

**Files:**
- Create: `packages/app/src/renderer/views/NoteView.tsx`

- [ ] **Step 1: Create NoteView**

A full-screen view for editing a note, with title, editor, and auto-save.

```typescript
// NoteView.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react'
import NoteEditor from '../components/notes/NoteEditor.js'

interface NoteInfo {
  id: string
  title: string
  docId: string | null
}

interface Props {
  note: NoteInfo
  onBack: () => void
}

export default function NoteView({ note, onBack }: Props) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electronAPI.notes.get(note.id).then((full) => {
      if (full) setContent(full.content)
    })
  }, [note.id])

  const saveContent = useCallback((markdown: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await window.electronAPI.notes.update(note.id, { content: markdown })
      setSaving(false)
    }, 800)
  }, [note.id])

  const saveTitle = useCallback(async () => {
    if (title !== note.title) {
      await window.electronAPI.notes.update(note.id, { title })
    }
  }, [note.id, title, note.title])

  if (content === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      Loading...
    </div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={onBack}>← 返回</button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          style={{
            flex: 1, fontWeight: 600, fontSize: 16,
            background: 'transparent', border: 'none', color: 'var(--text)',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {saving ? '保存中...' : '已保存'}
        </span>
      </div>
      <NoteEditor initialContent={content} onChange={saveContent} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): NoteView with auto-save Milkdown editor"
```

---

## Task 4: Note List + Navigation Integration

**Files:**
- Create: `packages/app/src/renderer/components/notes/NoteList.tsx`
- Modify: `packages/app/src/renderer/App.tsx`
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

- [ ] **Step 1: Create NoteList component**

A sidebar panel listing all notes with create/delete.

```typescript
// NoteList.tsx
import React, { useEffect, useState } from 'react'

interface Note {
  id: string
  title: string
  docId: string | null
  createdAt: string
}

interface Props {
  onOpenNote: (note: Note) => void
}

export default function NoteList({ onOpenNote }: Props) {
  const [notes, setNotes] = useState<Note[]>([])

  const loadNotes = async () => {
    const list = await window.electronAPI.notes.list()
    setNotes(list)
  }

  useEffect(() => { loadNotes() }, [])

  const handleCreate = async () => {
    const title = prompt('笔记标题：')
    if (!title) return
    const note = await window.electronAPI.notes.create({ title, content: '' })
    await loadNotes()
    onOpenNote(note)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await window.electronAPI.notes.delete(id)
    await loadNotes()
  }

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>笔记</h3>
        <button onClick={handleCreate} style={{ fontSize: 12 }}>+ 新建</button>
      </div>
      {notes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>还没有笔记</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              onClick={() => onOpenNote(note)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{note.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(note.createdAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                style={{ fontSize: 11, color: '#f38ba8', borderColor: '#f38ba8' }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx for note navigation**

Add state for viewing a note and route to NoteView:

```typescript
// App.tsx
import React, { useState } from 'react'
import WelcomeView from './views/WelcomeView.js'
import LibraryView from './views/LibraryView.js'
import DocumentViewer from './components/viewers/DocumentViewer.js'
import NoteView from './views/NoteView.js'

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [viewingDoc, setViewingDoc] = useState<any>(null)
  const [viewingNote, setViewingNote] = useState<any>(null)

  if (!libraryPath) return <WelcomeView onOpen={setLibraryPath} />
  if (viewingNote) return <NoteView note={viewingNote} onBack={() => setViewingNote(null)} />
  if (viewingDoc) return <DocumentViewer doc={viewingDoc} onBack={() => setViewingDoc(null)} />
  return <LibraryView rootPath={libraryPath} onOpenDoc={setViewingDoc} onOpenNote={setViewingNote} />
}
```

- [ ] **Step 3: Update LibraryView to show notes**

Add `onOpenNote` prop and render `NoteList` in the sidebar below the import button:

In LibraryView, add `onOpenNote` to Props interface and render:

```typescript
// After the import button in the sidebar
<div style={{ marginTop: 24 }}>
  <NoteList onOpenNote={onOpenNote} />
</div>
```

Import NoteList at top of file.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): note list and navigation to note editor"
```

---

## Task 5: Create Note from Annotation

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

- [ ] **Step 1: Add note creation from annotation sidebar**

Update the DocumentViewer to support creating a note from the annotation flow. When a user clicks the "批注" button in the selection toolbar, instead of using `prompt()`, we create a note linked to the annotation:

Update `handleNote` in DocumentViewer to:
1. Create a highlight annotation first
2. Then create a note linked to that annotation
3. Navigate to the note editor (via a new `onOpenNote` prop)

Add `onOpenNote` to the Props interface of DocumentViewer:

```typescript
interface Props {
  doc: DocInfo
  onBack: () => void
  onOpenNote?: (note: any) => void
}
```

Update `handleNote`:

```typescript
const handleNote = useCallback(async () => {
  if (!selection) return
  const ann = await create({
    type: 'highlight',
    page: selection.page,
    position: { type: 'pdf', page: selection.page, rects: selection.rects, text: selection.text },
    selectedText: selection.text,
    color: '#fde68a',
  })
  const title = `${doc.title} — 笔记`
  const content = `> ${selection.text}\n\n`
  const note = await window.electronAPI.notes.create({
    title,
    docId: doc.id,
    annotationIds: [ann.id],
    content,
  })
  setSelection(null)
  window.getSelection()?.removeAllRanges()
  onOpenNote?.(note)
}, [selection, create, doc, onOpenNote])
```

- [ ] **Step 2: Update App.tsx to pass onOpenNote to DocumentViewer**

```typescript
if (viewingDoc) return (
  <DocumentViewer
    doc={viewingDoc}
    onBack={() => setViewingDoc(null)}
    onOpenNote={(note) => { setViewingDoc(null); setViewingNote(note) }}
  />
)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): create notes from annotation context"
```

---

## Task 6: Final Integration + Verification

- [ ] **Step 1: Run core tests**

```bash
pnpm --filter @banjuan/core test
```

Expected: All 42 tests pass.

- [ ] **Step 2: Verify TypeScript compiles for both packages**

```bash
pnpm --filter @banjuan/core exec tsc --noEmit
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Manual verification checklist**

Start the app (`pnpm --filter @banjuan/core build && pnpm --filter @banjuan/app dev`):
- Library sidebar shows "笔记" section with "新建" button
- Create a new note → opens Milkdown editor
- Type markdown (headings, bold, lists) → renders as WYSIWYG
- Navigate back → note appears in list
- Open a PDF → select text → click "批注" → creates note with quoted text, opens editor
- Note auto-saves on typing (debounced 800ms)
- Edit note title → saves on blur
- Delete note from list

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: Phase 4 complete — note system with Milkdown editor"
```
