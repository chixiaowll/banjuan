# EPUB Viewer Zotero-Style Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the EPUB viewer to match the PDF viewer's 3-column layout with toolbar, left sidebar (outline/annotations/notes), content area with highlight annotations, right sidebar (metadata), and search.

**Architecture:** Context-driven state management mirroring PdfViewerContext. epub.js handles rendering in an iframe; highlights are injected via `rendition.annotations.highlight()`. Text selection produces CFI ranges for annotation persistence. The `useAnnotations` hook, `AnnotationPanel`, and `NotesPanel` components are reused from the PDF viewer.

**Tech Stack:** React, epub.js (epubjs@0.3.93), Electron IPC, existing annotation/note APIs

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/app/src/renderer/components/viewers/EpubViewerContext.tsx` | Shared state: sidebars, font size, highlight tool, search, book/rendition refs |
| Create | `packages/app/src/renderer/components/viewers/EpubToolbar.tsx` | Toolbar: nav, font size, highlight tool, color picker, search toggle, sidebar toggles |
| Create | `packages/app/src/renderer/components/viewers/EpubLeftSidebar.tsx` | Left sidebar with 3 tabs: outline, annotations, notes |
| Create | `packages/app/src/renderer/components/viewers/EpubOutlinePanel.tsx` | TOC tree using epub.js NavItem with subitems |
| Create | `packages/app/src/renderer/components/viewers/EpubContentArea.tsx` | epub.js rendition host, text selection → highlight, annotation rendering |
| Create | `packages/app/src/renderer/components/viewers/EpubInfoSidebar.tsx` | Right sidebar: document metadata display/edit |
| Create | `packages/app/src/renderer/components/viewers/EpubSearchPopup.tsx` | Search using epub.js Section.find() |
| Rewrite | `packages/app/src/renderer/components/viewers/EpubViewer.tsx` | Layout orchestrator wrapping all above in context provider |
| Modify | `packages/app/src/renderer/components/viewers/DocumentViewer.tsx` | Pass `doc` and `onOpenNote` props to EpubViewer |
| Modify | `packages/app/src/renderer/i18n/zh.ts` | Add epub-specific i18n keys |
| Modify | `packages/app/src/renderer/i18n/en.ts` | Add epub-specific i18n keys |

Reused without modification:
- `packages/app/src/renderer/hooks/useAnnotations.ts`
- `packages/app/src/renderer/components/viewers/AnnotationPanel.tsx`
- `packages/app/src/renderer/components/viewers/NotesPanel.tsx`

---

### Task 1: Add i18n keys for EPUB viewer

**Files:**
- Modify: `packages/app/src/renderer/i18n/zh.ts`
- Modify: `packages/app/src/renderer/i18n/en.ts`

- [ ] **Step 1: Add EPUB i18n keys to zh.ts**

Add after the `// PDF info sidebar` section, before the `// Note creation from PDF` section:

```typescript
  // EPUB viewer
  'epub.outline': '目录',
  'epub.annotations': '标注',
  'epub.notes': '笔记',
  'epub.noAnnotations': '暂无标注',
  'epub.noNotes': '暂无笔记',
  'epub.noOutline': '此文档无目录',
  'epub.newNote': '+ 新建笔记',
  'epub.chapter': '章节',
```

- [ ] **Step 2: Add EPUB i18n keys to en.ts**

Add at the same location:

```typescript
  // EPUB viewer
  'epub.outline': 'Outline',
  'epub.annotations': 'Annotations',
  'epub.notes': 'Notes',
  'epub.noAnnotations': 'No annotations',
  'epub.noNotes': 'No notes',
  'epub.noOutline': 'No outline available',
  'epub.newNote': '+ New Note',
  'epub.chapter': 'Chapter',
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/i18n/zh.ts packages/app/src/renderer/i18n/en.ts
git commit -m "feat(epub): add i18n keys for epub viewer"
```

---

### Task 2: Create EpubViewerContext

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubViewerContext.tsx`

- [ ] **Step 1: Create EpubViewerContext.tsx**

```tsx
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import type { Book, Rendition, NavItem } from 'epubjs'

export type EpubLeftSidebarTab = 'outline' | 'annotations' | 'notes'

export const ANNOTATION_COLORS = [
  { name: 'yellow', value: '#fde68a' },
  { name: 'red', value: '#fca5a5' },
  { name: 'green', value: '#86efac' },
  { name: 'blue', value: '#93c5fd' },
  { name: 'purple', value: '#c4b5fd' },
]

interface EpubViewerContextValue {
  book: Book | null
  rendition: Rendition | null
  toc: NavItem[]
  currentHref: string

  fontSize: number
  setFontSize: (size: number | ((prev: number) => number)) => void

  leftSidebarOpen: boolean
  leftSidebarTab: EpubLeftSidebarTab
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarTab: (tab: EpubLeftSidebarTab) => void
  rightSidebarOpen: boolean
  setRightSidebarOpen: (open: boolean) => void

  highlightActive: boolean
  setHighlightActive: (active: boolean) => void
  activeColor: string
  setActiveColor: (color: string) => void

  searchOpen: boolean
  setSearchOpen: (open: boolean) => void

  navigateTo: (href: string) => void
  goNext: () => void
  goPrev: () => void
}

const EpubViewerContext = createContext<EpubViewerContextValue | null>(null)

export function useEpubViewer(): EpubViewerContextValue {
  const ctx = useContext(EpubViewerContext)
  if (!ctx) throw new Error('useEpubViewer must be used within EpubViewerProvider')
  return ctx
}

interface ProviderProps {
  book: Book | null
  rendition: Rendition | null
  toc: NavItem[]
  currentHref: string
  children: React.ReactNode
}

export function EpubViewerProvider({ book, rendition, toc, currentHref, children }: ProviderProps) {
  const [fontSize, setFontSize] = useState(100)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarTab, setLeftSidebarTab] = useState<EpubLeftSidebarTab>('outline')
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [highlightActive, setHighlightActive] = useState(false)
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value)
  const [searchOpen, setSearchOpen] = useState(false)

  const navigateTo = useCallback((href: string) => {
    rendition?.display(href)
  }, [rendition])

  const goNext = useCallback(() => { rendition?.next() }, [rendition])
  const goPrev = useCallback(() => { rendition?.prev() }, [rendition])

  const value = useMemo<EpubViewerContextValue>(() => ({
    book, rendition, toc, currentHref,
    fontSize, setFontSize,
    leftSidebarOpen, leftSidebarTab, setLeftSidebarOpen, setLeftSidebarTab,
    rightSidebarOpen, setRightSidebarOpen,
    highlightActive, setHighlightActive, activeColor, setActiveColor,
    searchOpen, setSearchOpen,
    navigateTo, goNext, goPrev,
  }), [
    book, rendition, toc, currentHref,
    fontSize,
    leftSidebarOpen, leftSidebarTab,
    rightSidebarOpen,
    highlightActive, activeColor,
    searchOpen,
    navigateTo, goNext, goPrev,
  ])

  return (
    <EpubViewerContext.Provider value={value}>
      {children}
    </EpubViewerContext.Provider>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubViewerContext.tsx
git commit -m "feat(epub): create EpubViewerContext with shared state"
```

---

### Task 3: Create EpubToolbar

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubToolbar.tsx`

- [ ] **Step 1: Create EpubToolbar.tsx**

```tsx
import React, { useState, useRef, useEffect } from 'react'
import { useEpubViewer, ANNOTATION_COLORS } from './EpubViewerContext.js'
import { useT } from '../../i18n/index.js'

export default function EpubToolbar() {
  const t = useT()
  const ctx = useEpubViewer()
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showColorPicker) return
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColorPicker])

  const btnStyle: React.CSSProperties = {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 4,
    fontSize: 14,
    color: 'var(--text)',
    lineHeight: 1,
  }

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--selected)',
  }

  const sepStyle: React.CSSProperties = {
    width: 1,
    height: 20,
    background: 'var(--border)',
    margin: '0 4px',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: 36,
      padding: '0 8px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      flexShrink: 0,
      gap: 2,
      fontSize: 13,
    }}>
      <button style={btnStyle} onClick={() => ctx.setLeftSidebarOpen(!ctx.leftSidebarOpen)} title="Toggle left sidebar">
        ☰
      </button>
      <div style={sepStyle} />

      <button style={btnStyle} onClick={() => ctx.setFontSize(s => Math.max(50, s - 10))} title="Decrease font">
        A−
      </button>
      <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
        {ctx.fontSize}%
      </span>
      <button style={btnStyle} onClick={() => ctx.setFontSize(s => Math.min(200, s + 10))} title="Increase font">
        A+
      </button>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <button style={btnStyle} onClick={ctx.goPrev} title="Previous">
          ◀
        </button>
        <button style={btnStyle} onClick={ctx.goNext} title="Next">
          ▶
        </button>

        <div style={sepStyle} />

        <button
          style={ctx.highlightActive ? activeBtnStyle : btnStyle}
          onClick={() => ctx.setHighlightActive(!ctx.highlightActive)}
          title={t('tool.highlight' as any)}
        >
          🖍
        </button>

        <div ref={colorRef} style={{ position: 'relative' }}>
          <button
            style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 3 }}
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Color"
          >
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: ctx.activeColor, border: '1px solid var(--border)',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {showColorPicker && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: 6, display: 'flex', gap: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              {ANNOTATION_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => { ctx.setActiveColor(c.value); setShowColorPicker(false) }}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: c.value, border: ctx.activeColor === c.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer', padding: 0,
                  }}
                  title={c.name}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        style={ctx.searchOpen ? activeBtnStyle : btnStyle}
        onClick={() => ctx.setSearchOpen(!ctx.searchOpen)}
        title="Search (Cmd+F)"
      >
        🔍
      </button>
      <button style={btnStyle} onClick={() => ctx.setRightSidebarOpen(!ctx.rightSidebarOpen)} title="Toggle right sidebar">
        ☰
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubToolbar.tsx
git commit -m "feat(epub): create EpubToolbar with nav, font, highlight, search controls"
```

---

### Task 4: Create EpubOutlinePanel

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubOutlinePanel.tsx`

- [ ] **Step 1: Create EpubOutlinePanel.tsx**

```tsx
import React, { useState } from 'react'
import type { NavItem } from 'epubjs'
import { useEpubViewer } from './EpubViewerContext.js'
import { useT } from '../../i18n/index.js'

interface TreeNodeProps {
  item: NavItem
  depth: number
  currentHref: string
  onNavigate: (href: string) => void
}

function TreeNode({ item, depth, currentHref, onNavigate }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = item.subitems && item.subitems.length > 0
  const isActive = currentHref.includes(item.href)

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          padding: '4px 8px', paddingLeft: 8 + depth * 16,
          cursor: 'pointer', fontSize: 12,
          color: 'var(--text)', gap: 4,
          background: isActive ? 'var(--hover)' : 'transparent',
        }}
        onClick={() => onNavigate(item.href)}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--hover)' }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{ width: 12, flexShrink: 0, fontSize: 10, textAlign: 'center' }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label.trim()}
        </span>
      </div>
      {hasChildren && expanded && item.subitems!.map((child, i) => (
        <TreeNode key={child.id || i} item={child} depth={depth + 1} currentHref={currentHref} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

export default function EpubOutlinePanel() {
  const t = useT()
  const { toc, currentHref, navigateTo } = useEpubViewer()

  if (toc.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>{t('epub.noOutline' as any)}</div>
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {toc.map((item, i) => (
        <TreeNode key={item.id || i} item={item} depth={0} currentHref={currentHref} onNavigate={navigateTo} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubOutlinePanel.tsx
git commit -m "feat(epub): create EpubOutlinePanel with tree navigation"
```

---

### Task 5: Create EpubLeftSidebar

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubLeftSidebar.tsx`

- [ ] **Step 1: Create EpubLeftSidebar.tsx**

```tsx
import React from 'react'
import { useEpubViewer, type EpubLeftSidebarTab } from './EpubViewerContext.js'
import EpubOutlinePanel from './EpubOutlinePanel.js'
import AnnotationPanel from './AnnotationPanel.js'
import NotesPanel from './NotesPanel.js'
import { useT } from '../../i18n/index.js'

const TAB_IDS: Array<{ id: EpubLeftSidebarTab; icon: string; key: string }> = [
  { id: 'outline', icon: '☰', key: 'epub.outline' },
  { id: 'annotations', icon: '🖍', key: 'epub.annotations' },
  { id: 'notes', icon: '📝', key: 'epub.notes' },
]

interface Props {
  docId: string
  annotations: any[]
  onAnnotationClick: (cfi: string) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
  onOpenNote: (note: any) => void
  onCreateNote: () => void
}

export default function EpubLeftSidebar({
  docId, annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate,
  onOpenNote, onCreateNote,
}: Props) {
  const t = useT()
  const { leftSidebarTab, setLeftSidebarTab, leftSidebarOpen } = useEpubViewer()

  if (!leftSidebarOpen) return null

  const handleAnnotationClick = (page: number, yFraction?: number) => {
    const ann = annotations.find(a => a.page === page)
    if (ann?.position?.cfi) {
      onAnnotationClick(ann.position.cfi)
    }
  }

  return (
    <div style={{
      width: 240, borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TAB_IDS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setLeftSidebarTab(tab.id)}
            title={t(tab.key as any)}
            style={{
              flex: 1, padding: '8px 0', border: 'none',
              background: leftSidebarTab === tab.id ? 'var(--bg)' : 'var(--surface)',
              borderBottom: leftSidebarTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer', fontSize: 14,
              color: leftSidebarTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {leftSidebarTab === 'outline' && <EpubOutlinePanel />}
        {leftSidebarTab === 'annotations' && (
          <AnnotationPanel annotations={annotations} onAnnotationClick={handleAnnotationClick}
            onAnnotationDelete={onAnnotationDelete} onAnnotationUpdate={onAnnotationUpdate} />
        )}
        {leftSidebarTab === 'notes' && (
          <NotesPanel docId={docId} onOpenNote={onOpenNote} onCreateNote={onCreateNote} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubLeftSidebar.tsx
git commit -m "feat(epub): create EpubLeftSidebar with outline, annotations, notes tabs"
```

---

### Task 6: Create EpubInfoSidebar

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubInfoSidebar.tsx`

- [ ] **Step 1: Create EpubInfoSidebar.tsx**

```tsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useEpubViewer } from './EpubViewerContext.js'
import { useT } from '../../i18n/index.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  doc: DocInfo
  onDocUpdated: (doc: DocInfo) => void
}

function EditableField({ label, value, readOnly, onSave }: {
  label: string; value: string; readOnly?: boolean; onSave?: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(value)

  useEffect(() => { setEditVal(value) }, [value])

  if (readOnly || !onSave) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <span style={{ color: 'var(--text)', wordBreak: 'break-all' }} title={value}>{value}</span>
      </div>
    )
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <input
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => { onSave(editVal); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onSave(editVal); setEditing(false) } }}
          style={{
            flex: 1, fontSize: 12, border: '1px solid var(--border)',
            borderRadius: 3, padding: '1px 4px', color: 'var(--text)',
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8, cursor: 'pointer' }}
      onClick={() => setEditing(true)}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )
}

export default function EpubInfoSidebar({ doc, onDocUpdated }: Props) {
  const t = useT()
  const { rightSidebarOpen } = useEpubViewer()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [metadata, setMetadata] = useState<Array<{ key: string; value: string }>>(
    Object.entries(doc.metadata).map(([k, v]) => ({ key: k, value: String(v) }))
  )

  useEffect(() => {
    setMetadata(Object.entries(doc.metadata).map(([k, v]) => ({ key: k, value: String(v) })))
  }, [doc.metadata])

  const saveDoc = useCallback((updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const result = await window.electronAPI.documents.update(doc.id, updates)
      if (result) onDocUpdated(result)
    }, 500)
  }, [doc.id, onDocUpdated])

  const saveMetadata = useCallback((entries: Array<{ key: string; value: string }>) => {
    const obj: Record<string, unknown> = {}
    for (const { key, value } of entries) {
      if (key.trim()) obj[key.trim()] = value
    }
    saveDoc({ metadata: obj })
  }, [saveDoc])

  const updateMetaRow = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...metadata]
    next[index] = { ...next[index], [field]: val }
    setMetadata(next)
    saveMetadata(next)
  }

  const removeMetaRow = (index: number) => {
    const next = metadata.filter((_, i) => i !== index)
    setMetadata(next)
    saveMetadata(next)
  }

  const addMetaRow = () => {
    setMetadata(prev => [...prev, { key: '', value: '' }])
  }

  if (!rightSidebarOpen) return null

  return (
    <div style={{
      width: 280, borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'auto',
    }}>
      <div style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
        {doc.title}
      </div>
      <div style={{ padding: '8px 0' }}>
        <EditableField label="Title" value={doc.title} onSave={(val) => saveDoc({ title: val })} />
        <EditableField label="Authors" value={doc.authors.join(', ')} onSave={(val) => saveDoc({ authors: val.split(',').map(a => a.trim()).filter(Boolean) })} />
        <EditableField label="Type" value={doc.type.toUpperCase()} readOnly />
        <EditableField label="Path" value={doc.path} readOnly />
        <EditableField label="Created" value={new Date(doc.createdAt).toLocaleString()} readOnly />
        <EditableField label="Updated" value={new Date(doc.updatedAt).toLocaleString()} readOnly />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
        <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
          Metadata
        </div>
        {metadata.map((entry, i) => (
          <div key={i} style={{ display: 'flex', padding: '2px 12px', fontSize: 12, gap: 4, alignItems: 'center' }}>
            <input value={entry.key} onChange={(e) => updateMetaRow(i, 'key', e.target.value)} placeholder="key"
              style={{ width: 70, fontSize: 11, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', color: 'var(--text-muted)' }} />
            <input value={entry.value} onChange={(e) => updateMetaRow(i, 'value', e.target.value)} placeholder="value"
              style={{ flex: 1, fontSize: 11, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', color: 'var(--text)' }} />
            <button onClick={() => removeMetaRow(i)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px' }}>×</button>
          </div>
        ))}
        <button onClick={addMetaRow}
          style={{ margin: '6px 12px', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {t('info.addField' as any)}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubInfoSidebar.tsx
git commit -m "feat(epub): create EpubInfoSidebar with editable metadata"
```

---

### Task 7: Create EpubSearchPopup

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubSearchPopup.tsx`

- [ ] **Step 1: Create EpubSearchPopup.tsx**

epub.js provides `book.spine.each()` to iterate sections and `section.find(query)` returns matching excerpts. We use `rendition.display(cfi)` to navigate to results.

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useEpubViewer } from './EpubViewerContext.js'
import { useT } from '../../i18n/index.js'

interface SearchResult {
  cfi: string
  excerpt: string
}

export default function EpubSearchPopup() {
  const t = useT()
  const ctx = useEpubViewer()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (ctx.searchOpen) inputRef.current?.focus()
  }, [ctx.searchOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        ctx.setSearchOpen(true)
      }
      if (e.key === 'Escape' && ctx.searchOpen) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ctx.searchOpen])

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim() || !ctx.book) {
      setResults([])
      setCurrentIndex(-1)
      return
    }
    const allResults: SearchResult[] = []
    const spine = ctx.book.spine as any
    spine.each((section: any) => {
      section.load(ctx.book!.load.bind(ctx.book)).then((contents: any) => {
        const found = section.find(q)
        for (const item of found) {
          allResults.push({ cfi: item.cfi, excerpt: item.excerpt })
        }
        setResults([...allResults])
        if (allResults.length > 0 && currentIndex < 0) {
          setCurrentIndex(0)
          ctx.rendition?.display(allResults[0].cfi)
        }
      })
    })
  }, [ctx.book, ctx.rendition])

  const handleQueryChange = (q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => performSearch(q), 500)
  }

  const goToResult = (index: number) => {
    if (index >= 0 && index < results.length) {
      setCurrentIndex(index)
      ctx.rendition?.display(results[index].cfi)
    }
  }

  const handleNext = () => {
    const next = currentIndex + 1 >= results.length ? 0 : currentIndex + 1
    goToResult(next)
  }

  const handlePrev = () => {
    const prev = currentIndex - 1 < 0 ? results.length - 1 : currentIndex - 1
    goToResult(prev)
  }

  const handleClose = () => {
    ctx.setSearchOpen(false)
    setQuery('')
    setResults([])
    setCurrentIndex(-1)
  }

  if (!ctx.searchOpen) return null

  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, zIndex: 200,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      minWidth: 280, fontSize: 12,
    }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.shiftKey ? handlePrev() : handleNext() }}
          placeholder={t('search.placeholder' as any)}
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)',
          }}
        />
        <button onClick={handlePrev} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>▲</button>
        <button onClick={handleNext} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>▼</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          {results.length > 0 ? `${currentIndex + 1}/${results.length}` : query ? '0/0' : ''}
        </span>
        <button onClick={handleClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', color: 'var(--text-muted)' }}>×</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubSearchPopup.tsx
git commit -m "feat(epub): create EpubSearchPopup with spine-based text search"
```

---

### Task 8: Create EpubContentArea

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubContentArea.tsx`

This is the core component. It hosts the epub.js rendition, handles text selection for highlighting, and renders persisted annotations back via `rendition.annotations.highlight()`.

- [ ] **Step 1: Create EpubContentArea.tsx**

```tsx
import React, { useEffect, useRef, useCallback } from 'react'
import { useEpubViewer } from './EpubViewerContext.js'

interface Props {
  annotations: Array<{
    id: string
    position: any
    color: string
    type: string
  }>
  docId: string
  onHighlightCreated: (cfiRange: string, text: string) => void
}

export default function EpubContentArea({ annotations, docId, onHighlightCreated }: Props) {
  const ctx = useEpubViewer()
  const containerRef = useRef<HTMLDivElement>(null)
  const renderedAnnotations = useRef(new Set<string>())

  useEffect(() => {
    if (!ctx.rendition) return
    ctx.rendition.themes.fontSize(`${ctx.fontSize}%`)
  }, [ctx.fontSize, ctx.rendition])

  // Render persisted annotations as highlights
  useEffect(() => {
    if (!ctx.rendition) return
    const rendition = ctx.rendition

    for (const ann of annotations) {
      if (ann.type !== 'highlight' || !ann.position?.cfi) continue
      if (renderedAnnotations.current.has(ann.id)) continue
      try {
        rendition.annotations.highlight(
          ann.position.cfi,
          { id: ann.id },
          undefined,
          undefined,
          { fill: ann.color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' },
        )
        renderedAnnotations.current.add(ann.id)
      } catch {
        // Section not yet loaded — will be rendered on relocation
      }
    }
  }, [annotations, ctx.rendition])

  // Re-apply highlights when section changes
  useEffect(() => {
    if (!ctx.rendition) return
    const handler = () => {
      renderedAnnotations.current.clear()
      for (const ann of annotations) {
        if (ann.type !== 'highlight' || !ann.position?.cfi) continue
        try {
          ctx.rendition!.annotations.highlight(
            ann.position.cfi,
            { id: ann.id },
            undefined,
            undefined,
            { fill: ann.color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' },
          )
          renderedAnnotations.current.add(ann.id)
        } catch {
          // Ignore — different section
        }
      }
    }
    ctx.rendition.on('relocated', handler)
    return () => { ctx.rendition?.off('relocated', handler) }
  }, [ctx.rendition, annotations])

  // Handle text selection for highlighting
  useEffect(() => {
    if (!ctx.rendition) return
    const handler = (cfiRange: string, contents: any) => {
      if (!ctx.highlightActive) return
      const range = contents.range(cfiRange)
      const text = range?.toString() || ''
      if (!text.trim()) return
      onHighlightCreated(cfiRange, text)
      contents.window.getSelection()?.removeAllRanges()
    }
    ctx.rendition.on('selected', handler)
    return () => { ctx.rendition?.off('selected', handler) }
  }, [ctx.rendition, ctx.highlightActive, onHighlightCreated])

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
      id="epub-content-area"
    />
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubContentArea.tsx
git commit -m "feat(epub): create EpubContentArea with highlight annotations and text selection"
```

---

### Task 9: Rewrite EpubViewer as layout orchestrator

**Files:**
- Rewrite: `packages/app/src/renderer/components/viewers/EpubViewer.tsx`

- [ ] **Step 1: Rewrite EpubViewer.tsx**

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import ePub, { Book, Rendition, NavItem } from 'epubjs'
import { EpubViewerProvider, useEpubViewer } from './EpubViewerContext.js'
import EpubToolbar from './EpubToolbar.js'
import EpubLeftSidebar from './EpubLeftSidebar.js'
import EpubInfoSidebar from './EpubInfoSidebar.js'
import EpubContentArea from './EpubContentArea.js'
import EpubSearchPopup from './EpubSearchPopup.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import { useT } from '../../i18n/index.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  data: ArrayBuffer
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function EpubViewerInner({ doc: initialDoc, onOpenNote }: Omit<Props, 'data'>) {
  const t = useT()
  const ctx = useEpubViewer()
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)
  const [doc, setDoc] = useState<DocInfo>(initialDoc)

  const handleHighlightCreated = useCallback(async (cfiRange: string, text: string) => {
    await create({
      type: 'highlight',
      position: { type: 'epub', cfi: cfiRange, text },
      selectedText: text,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor])

  const handleAnnotationClick = useCallback((cfi: string) => {
    ctx.rendition?.display(cfi)
  }, [ctx.rendition])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    const ann = annotations.find(a => a.id === id)
    if (ann?.position?.cfi && ctx.rendition) {
      try { ctx.rendition.annotations.remove(ann.position.cfi, 'highlight') } catch {}
    }
    await remove(id)
  }, [remove, annotations, ctx.rendition])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const handleCreateNote = useCallback(async () => {
    const note = await window.electronAPI.notes.create({
      title: t('note.defaultTitle' as any, doc.title),
      docId: doc.id,
      content: '',
    })
    onOpenNote?.(note)
  }, [doc, onOpenNote, t])

  const handleOpenNote = useCallback((note: any) => {
    onOpenNote?.(note)
  }, [onOpenNote])

  const handleDocUpdated = useCallback((updated: DocInfo) => {
    setDoc(updated)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <EpubToolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <EpubLeftSidebar
          docId={doc.id}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onOpenNote={handleOpenNote}
          onCreateNote={handleCreateNote}
        />
        <EpubContentArea
          annotations={annotations}
          docId={doc.id}
          onHighlightCreated={handleHighlightCreated}
        />
        <EpubInfoSidebar
          doc={doc}
          onDocUpdated={handleDocUpdated}
        />
        <EpubSearchPopup />
      </div>
    </div>
  )
}

export default function EpubViewer({ data, doc, onOpenNote }: Props) {
  const [book, setBook] = useState<Book | null>(null)
  const [rendition, setRendition] = useState<Rendition | null>(null)
  const [toc, setToc] = useState<NavItem[]>([])
  const [currentHref, setCurrentHref] = useState('')
  const containerReady = useRef(false)

  useEffect(() => {
    const container = document.getElementById('epub-content-area')
    if (!container) {
      containerReady.current = false
      return
    }

    const epubBook = ePub(data as any)
    setBook(epubBook)

    const rend = epubBook.renderTo(container, {
      width: '100%',
      height: '100%',
      spread: 'none',
    })
    setRendition(rend)
    rend.display()

    epubBook.loaded.navigation.then((nav) => {
      setToc(nav.toc)
    })

    rend.on('relocated', (location: { start: { href: string } }) => {
      setCurrentHref(location.start.href)
    })

    return () => {
      epubBook.destroy()
      setBook(null)
      setRendition(null)
      setToc([])
      setCurrentHref('')
    }
  }, [data])

  return (
    <EpubViewerProvider book={book} rendition={rendition} toc={toc} currentHref={currentHref}>
      <EpubViewerInner doc={doc} onOpenNote={onOpenNote} />
    </EpubViewerProvider>
  )
}
```

**Important note:** The `epub-content-area` div is rendered by `EpubContentArea` inside `EpubViewerInner`, but `renderTo` is called in the parent `EpubViewer` effect. This creates a timing issue — the container must exist before `renderTo`. To fix this, we need a two-phase approach: render the layout first, then initialize epub.js once the container mounts. Let's use a ref callback pattern instead.

Actually, let's restructure: move the epub.js initialization into `EpubContentArea` and pass the `data` prop down through context or directly. This is cleaner.

**Revised approach:** Pass `data` into context, let `EpubContentArea` own the epub.js lifecycle, and update context state from there.

Let me revise — we'll update `EpubViewerContext` to include a setter for book/rendition/toc/currentHref, and `EpubContentArea` will initialize epub.js and push state up.

**Actually simplest approach**: Keep initialization in `EpubViewer` but use a ref callback to get the container element. Replace `document.getElementById` with a shared ref.

Let me write the correct version. We'll add a `contentRef` to context.

- [ ] **Step 1 (revised): Update EpubViewerContext to include contentRef**

In `EpubViewerContext.tsx`, add to the interface and provider:

Add `contentRef: React.RefObject<HTMLDivElement | null>` to `EpubViewerContextValue`.

Add `const contentRef = useRef<HTMLDivElement | null>(null)` to the provider and include it in the value.

The full updated `EpubViewerContext.tsx`:

```tsx
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import type { Book, Rendition, NavItem } from 'epubjs'

export type EpubLeftSidebarTab = 'outline' | 'annotations' | 'notes'

export const ANNOTATION_COLORS = [
  { name: 'yellow', value: '#fde68a' },
  { name: 'red', value: '#fca5a5' },
  { name: 'green', value: '#86efac' },
  { name: 'blue', value: '#93c5fd' },
  { name: 'purple', value: '#c4b5fd' },
]

interface EpubViewerContextValue {
  book: Book | null
  rendition: Rendition | null
  toc: NavItem[]
  currentHref: string
  contentRef: React.RefObject<HTMLDivElement | null>

  fontSize: number
  setFontSize: (size: number | ((prev: number) => number)) => void

  leftSidebarOpen: boolean
  leftSidebarTab: EpubLeftSidebarTab
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarTab: (tab: EpubLeftSidebarTab) => void
  rightSidebarOpen: boolean
  setRightSidebarOpen: (open: boolean) => void

  highlightActive: boolean
  setHighlightActive: (active: boolean) => void
  activeColor: string
  setActiveColor: (color: string) => void

  searchOpen: boolean
  setSearchOpen: (open: boolean) => void

  navigateTo: (href: string) => void
  goNext: () => void
  goPrev: () => void
}

const EpubViewerContext = createContext<EpubViewerContextValue | null>(null)

export function useEpubViewer(): EpubViewerContextValue {
  const ctx = useContext(EpubViewerContext)
  if (!ctx) throw new Error('useEpubViewer must be used within EpubViewerProvider')
  return ctx
}

interface ProviderProps {
  book: Book | null
  rendition: Rendition | null
  toc: NavItem[]
  currentHref: string
  children: React.ReactNode
}

export function EpubViewerProvider({ book, rendition, toc, currentHref, children }: ProviderProps) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [fontSize, setFontSize] = useState(100)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarTab, setLeftSidebarTab] = useState<EpubLeftSidebarTab>('outline')
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [highlightActive, setHighlightActive] = useState(false)
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value)
  const [searchOpen, setSearchOpen] = useState(false)

  const navigateTo = useCallback((href: string) => {
    rendition?.display(href)
  }, [rendition])

  const goNext = useCallback(() => { rendition?.next() }, [rendition])
  const goPrev = useCallback(() => { rendition?.prev() }, [rendition])

  const value = useMemo<EpubViewerContextValue>(() => ({
    book, rendition, toc, currentHref, contentRef,
    fontSize, setFontSize,
    leftSidebarOpen, leftSidebarTab, setLeftSidebarOpen, setLeftSidebarTab,
    rightSidebarOpen, setRightSidebarOpen,
    highlightActive, setHighlightActive, activeColor, setActiveColor,
    searchOpen, setSearchOpen,
    navigateTo, goNext, goPrev,
  }), [
    book, rendition, toc, currentHref,
    fontSize,
    leftSidebarOpen, leftSidebarTab,
    rightSidebarOpen,
    highlightActive, activeColor,
    searchOpen,
    navigateTo, goNext, goPrev,
  ])

  return (
    <EpubViewerContext.Provider value={value}>
      {children}
    </EpubViewerContext.Provider>
  )
}
```

- [ ] **Step 2: Update EpubContentArea to use contentRef**

Update `EpubContentArea.tsx` — replace the local `containerRef` with `ctx.contentRef`:

```tsx
import React, { useEffect, useRef } from 'react'
import { useEpubViewer } from './EpubViewerContext.js'

interface Props {
  annotations: Array<{
    id: string
    position: any
    color: string
    type: string
  }>
  docId: string
  onHighlightCreated: (cfiRange: string, text: string) => void
}

export default function EpubContentArea({ annotations, docId, onHighlightCreated }: Props) {
  const ctx = useEpubViewer()
  const renderedAnnotations = useRef(new Set<string>())

  useEffect(() => {
    if (!ctx.rendition) return
    ctx.rendition.themes.fontSize(`${ctx.fontSize}%`)
  }, [ctx.fontSize, ctx.rendition])

  useEffect(() => {
    if (!ctx.rendition) return
    const rendition = ctx.rendition

    for (const ann of annotations) {
      if (ann.type !== 'highlight' || !ann.position?.cfi) continue
      if (renderedAnnotations.current.has(ann.id)) continue
      try {
        rendition.annotations.highlight(
          ann.position.cfi,
          { id: ann.id },
          undefined,
          undefined,
          { fill: ann.color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' },
        )
        renderedAnnotations.current.add(ann.id)
      } catch {
        // Section not yet loaded
      }
    }
  }, [annotations, ctx.rendition])

  useEffect(() => {
    if (!ctx.rendition) return
    const handler = () => {
      renderedAnnotations.current.clear()
      for (const ann of annotations) {
        if (ann.type !== 'highlight' || !ann.position?.cfi) continue
        try {
          ctx.rendition!.annotations.highlight(
            ann.position.cfi,
            { id: ann.id },
            undefined,
            undefined,
            { fill: ann.color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' },
          )
          renderedAnnotations.current.add(ann.id)
        } catch {
          // Different section
        }
      }
    }
    ctx.rendition.on('relocated', handler)
    return () => { ctx.rendition?.off('relocated', handler) }
  }, [ctx.rendition, annotations])

  useEffect(() => {
    if (!ctx.rendition) return
    const handler = (cfiRange: string, contents: any) => {
      if (!ctx.highlightActive) return
      const range = contents.range(cfiRange)
      const text = range?.toString() || ''
      if (!text.trim()) return
      onHighlightCreated(cfiRange, text)
      contents.window.getSelection()?.removeAllRanges()
    }
    ctx.rendition.on('selected', handler)
    return () => { ctx.rendition?.off('selected', handler) }
  }, [ctx.rendition, ctx.highlightActive, onHighlightCreated])

  return (
    <div
      ref={ctx.contentRef}
      style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
    />
  )
}
```

- [ ] **Step 3: Write EpubViewer.tsx**

```tsx
import React, { useEffect, useState, useCallback, useRef } from 'react'
import ePub, { Book, Rendition, NavItem } from 'epubjs'
import { EpubViewerProvider, useEpubViewer } from './EpubViewerContext.js'
import EpubToolbar from './EpubToolbar.js'
import EpubLeftSidebar from './EpubLeftSidebar.js'
import EpubInfoSidebar from './EpubInfoSidebar.js'
import EpubContentArea from './EpubContentArea.js'
import EpubSearchPopup from './EpubSearchPopup.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import { useT } from '../../i18n/index.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  data: ArrayBuffer
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function EpubViewerInner({ doc: initialDoc, onOpenNote }: { doc: DocInfo; onOpenNote?: (note: any) => void }) {
  const t = useT()
  const ctx = useEpubViewer()
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)
  const [doc, setDoc] = useState<DocInfo>(initialDoc)

  const handleHighlightCreated = useCallback(async (cfiRange: string, text: string) => {
    await create({
      type: 'highlight',
      position: { type: 'epub', cfi: cfiRange, text },
      selectedText: text,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor])

  const handleAnnotationClick = useCallback((cfi: string) => {
    ctx.rendition?.display(cfi)
  }, [ctx.rendition])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    const ann = annotations.find(a => a.id === id)
    if (ann?.position?.cfi && ctx.rendition) {
      try { ctx.rendition.annotations.remove(ann.position.cfi, 'highlight') } catch {}
    }
    await remove(id)
  }, [remove, annotations, ctx.rendition])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const handleCreateNote = useCallback(async () => {
    const note = await window.electronAPI.notes.create({
      title: t('note.defaultTitle' as any, doc.title),
      docId: doc.id,
      content: '',
    })
    onOpenNote?.(note)
  }, [doc, onOpenNote, t])

  const handleOpenNote = useCallback((note: any) => {
    onOpenNote?.(note)
  }, [onOpenNote])

  const handleDocUpdated = useCallback((updated: DocInfo) => {
    setDoc(updated)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <EpubToolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <EpubLeftSidebar
          docId={doc.id}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onOpenNote={handleOpenNote}
          onCreateNote={handleCreateNote}
        />
        <EpubContentArea
          annotations={annotations}
          docId={doc.id}
          onHighlightCreated={handleHighlightCreated}
        />
        <EpubInfoSidebar
          doc={doc}
          onDocUpdated={handleDocUpdated}
        />
        <EpubSearchPopup />
      </div>
    </div>
  )
}

export default function EpubViewer({ data, doc, onOpenNote }: Props) {
  const [book, setBook] = useState<Book | null>(null)
  const [rendition, setRendition] = useState<Rendition | null>(null)
  const [toc, setToc] = useState<NavItem[]>([])
  const [currentHref, setCurrentHref] = useState('')
  const initDone = useRef(false)

  // epub.js initialization happens after the provider+inner tree mounts
  // so the contentRef div exists. We use a short RAF delay to ensure mount.
  useEffect(() => {
    let cancelled = false

    const init = () => {
      const container = document.querySelector('[data-epub-container]') as HTMLElement | null
      if (!container || cancelled) return

      const epubBook = ePub(data as any)
      const rend = epubBook.renderTo(container, {
        width: '100%',
        height: '100%',
        spread: 'none',
      })

      setBook(epubBook)
      setRendition(rend)
      rend.display()

      epubBook.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc)
      })

      rend.on('relocated', (location: { start: { href: string } }) => {
        if (!cancelled) setCurrentHref(location.start.href)
      })

      initDone.current = true
    }

    // Wait for next frame so child components mount first
    const raf = requestAnimationFrame(() => {
      init()
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (book) {
        book.destroy()
      }
      setBook(null)
      setRendition(null)
      setToc([])
      setCurrentHref('')
      initDone.current = false
    }
  }, [data])

  return (
    <EpubViewerProvider book={book} rendition={rendition} toc={toc} currentHref={currentHref}>
      <EpubViewerInner doc={doc} onOpenNote={onOpenNote} />
    </EpubViewerProvider>
  )
}
```

And update `EpubContentArea.tsx` to use `data-epub-container` attribute instead of ref (since the ref from context won't be set before the parent effect runs):

In `EpubContentArea.tsx`, change the return div to:
```tsx
  return (
    <div
      data-epub-container
      style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
    />
  )
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/components/viewers/EpubViewer.tsx \
       packages/app/src/renderer/components/viewers/EpubViewerContext.tsx \
       packages/app/src/renderer/components/viewers/EpubContentArea.tsx
git commit -m "feat(epub): rewrite EpubViewer as layout orchestrator with 3-column layout"
```

---

### Task 10: Update DocumentViewer to pass doc props to EpubViewer

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

- [ ] **Step 1: Update the epub case in DocumentViewer**

Change:
```tsx
    case 'epub':
      return <EpubViewer data={fileData!} />
```

To:
```tsx
    case 'epub':
      return <EpubViewer data={fileData!} doc={doc} onOpenNote={onOpenNote} />
```

The `EpubViewer` component's `Props` interface expects `data: ArrayBuffer`, `doc: DocInfo`, and `onOpenNote?: (note: any) => void`. The `DocumentViewer` already has `doc` and `onOpenNote` available as props.

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit 2>&1 | grep -v zotero-pdfjs`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/DocumentViewer.tsx
git commit -m "feat(epub): pass doc and onOpenNote props to EpubViewer"
```

---

### Task 11: Integration test and polish

- [ ] **Step 1: Run the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Test EPUB viewer in browser**

1. Open the app and import an EPUB file
2. Verify the 3-column layout renders: left sidebar with TOC, content area, right sidebar toggle
3. Verify TOC navigation works — click a chapter, content navigates
4. Verify font size controls (A−/A+) work
5. Verify prev/next navigation works
6. Verify left sidebar tabs switch: outline → annotations → notes
7. Toggle right sidebar — verify metadata panel shows and edits save
8. Enable highlight tool, select text — verify highlight annotation is created and rendered
9. Check annotations panel — verify new highlight appears in list
10. Click annotation in panel — verify content navigates to highlight location
11. Delete annotation — verify highlight is removed
12. Test search — open search popup, enter a term, verify results navigation
13. Test keyboard shortcut: Cmd+F opens search, Escape closes it

- [ ] **Step 3: Fix any issues found during testing**

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(epub): polish epub viewer after integration testing"
```
