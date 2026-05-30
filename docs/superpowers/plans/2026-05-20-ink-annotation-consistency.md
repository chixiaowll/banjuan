# Ink Annotation Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EPUB and Markdown viewers' ink/handwriting annotation experience match the PDF viewer's polished floating toolbar with presets, highlighter, undo/redo, and draggable positioning.

**Architecture:** Extract shared ink constants (colors, widths, presets) into a common module. Upgrade MarkdownInkToolbar from a basic fixed bar to a floating draggable toolbar matching PdfInkToolbar. Add full ink support to EPUB viewer (context state, canvas overlay, floating toolbar). All three viewers will share identical ink configuration and UI patterns.

**Tech Stack:** React, TypeScript, lucide-react icons, perfect-freehand (via existing renderStrokes.ts), epub.js (EPUB rendering)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `packages/shared-ui/src/components/viewers/inkConfig.ts` | Shared ink constants: colors, widths, presets, types |
| **Modify** | `packages/shared-ui/src/components/viewers/MarkdownInkToolbar.tsx` | Replace with floating draggable toolbar matching PDF |
| **Modify** | `packages/shared-ui/src/components/viewers/MarkdownViewerContext.tsx` | Import shared config, add undo-related state |
| **Modify** | `packages/shared-ui/src/components/viewers/MarkdownInkOverlay.tsx` | Add undo/redo stack support |
| **Modify** | `packages/shared-ui/src/components/viewers/PdfInkToolbar.tsx` | Import shared config instead of local constants |
| **Modify** | `packages/shared-ui/src/components/viewers/EpubViewerContext.tsx` | Add ink tool types and state (inkColor, inkWidth, inkEraserActive) |
| **Create** | `packages/shared-ui/src/components/viewers/EpubInkOverlay.tsx` | Canvas-based ink drawing overlay for EPUB |
| **Create** | `packages/shared-ui/src/components/viewers/EpubInkToolbar.tsx` | Floating draggable ink toolbar for EPUB |
| **Modify** | `packages/shared-ui/src/components/viewers/EpubContentArea.tsx` | Mount ink overlay canvas on top of epub content |
| **Modify** | `packages/shared-ui/src/components/viewers/EpubToolbar.tsx` | Add ink tool toggle button |
| **Modify** | `packages/shared-ui/src/components/viewers/EpubViewer.tsx` | Wire up ink annotation CRUD |

---

### Task 1: Extract Shared Ink Config

**Files:**
- Create: `packages/shared-ui/src/components/viewers/inkConfig.ts`
- Modify: `packages/shared-ui/src/components/viewers/PdfInkToolbar.tsx`
- Modify: `packages/shared-ui/src/components/viewers/MarkdownViewerContext.tsx`

- [ ] **Step 1: Create shared ink config module**

Create `packages/shared-ui/src/components/viewers/inkConfig.ts`:

```typescript
export const INK_COLORS = [
  '#1a1a1a', '#5c5c5c', '#3182ce', '#805ad5',
  '#e53e3e', '#dd6b20', '#d69e2e', '#38a169',
  '#d53f8c', '#ffffff',
]

export const STROKE_WIDTHS = [
  { value: 1, height: 1 },
  { value: 3, height: 2 },
  { value: 6, height: 3 },
]

export interface InkPreset {
  color: string
  width: number
  tool: 'pen' | 'highlighter'
}

export const DEFAULT_PRESETS: InkPreset[] = [
  { color: '#3182ce', width: 2, tool: 'pen' },
  { color: '#1a1a1a', width: 4, tool: 'pen' },
  { color: '#d69e2e', width: 8, tool: 'highlighter' },
]
```

- [ ] **Step 2: Update PdfInkToolbar to use shared config**

In `PdfInkToolbar.tsx`, replace lines 1-27:

Remove the local `INK_COLORS`, `STROKE_WIDTHS`, `InkPreset`, and `DEFAULT_PRESETS` definitions. Import from shared module:

```typescript
import React, { useState, useRef, useCallback } from 'react'
import { Eraser, Lasso, Undo2, Redo2, Trash2, Highlighter, GripVertical } from 'lucide-react'
import { usePdfViewer } from './PdfViewerContext.js'
import { INK_COLORS, STROKE_WIDTHS, DEFAULT_PRESETS, type InkPreset } from './inkConfig.js'
```

Everything else in PdfInkToolbar stays the same — it already uses `INK_COLORS`, `STROKE_WIDTHS`, `DEFAULT_PRESETS`, and `InkPreset` by those exact names.

- [ ] **Step 3: Update MarkdownViewerContext to use shared config**

In `MarkdownViewerContext.tsx`, replace the local `INK_COLORS` and `INK_WIDTHS` exports:

```typescript
// Remove these lines:
// export const INK_COLORS = ['#1a1a1a', '#6b7280', ...]
// export const INK_WIDTHS = [1, 2, 4, 6, 8, 12]

// Add re-export from shared config:
export { INK_COLORS } from './inkConfig.js'
```

Remove `INK_WIDTHS` export entirely — it won't be needed after MarkdownInkToolbar is upgraded to use `STROKE_WIDTHS` from inkConfig (Task 2).

- [ ] **Step 4: Verify the build compiles**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: No type errors. All imports resolve correctly.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-ui/src/components/viewers/inkConfig.ts packages/shared-ui/src/components/viewers/PdfInkToolbar.tsx packages/shared-ui/src/components/viewers/MarkdownViewerContext.tsx
git commit -m "refactor: extract shared ink config (colors, widths, presets)"
```

---

### Task 2: Add Undo/Redo Support to Markdown Ink

**Files:**
- Modify: `packages/shared-ui/src/components/viewers/MarkdownViewerContext.tsx`
- Modify: `packages/shared-ui/src/components/viewers/MarkdownInkOverlay.tsx`

- [ ] **Step 1: Add undo/redo state to MarkdownViewerContext**

Add to the context interface and provider in `MarkdownViewerContext.tsx`:

```typescript
// Add to context interface:
inkUndoStack: Array<{ annotationId: string; strokes: any[] }>
inkRedoStack: Array<{ annotationId: string; strokes: any[] }>
pushInkUndo: (entry: { annotationId: string; strokes: any[] }) => void
popInkUndo: () => { annotationId: string; strokes: any[] } | undefined
pushInkRedo: (entry: { annotationId: string; strokes: any[] }) => void
popInkRedo: () => { annotationId: string; strokes: any[] } | undefined
clearInkRedo: () => void
```

In the provider, add state:

```typescript
const [inkUndoStack, setInkUndoStack] = useState<Array<{ annotationId: string; strokes: any[] }>>([])
const [inkRedoStack, setInkRedoStack] = useState<Array<{ annotationId: string; strokes: any[] }>>([])

const pushInkUndo = useCallback((entry: { annotationId: string; strokes: any[] }) => {
  setInkUndoStack(prev => [...prev, entry])
}, [])
const popInkUndo = useCallback(() => {
  let popped: { annotationId: string; strokes: any[] } | undefined
  setInkUndoStack(prev => {
    if (prev.length === 0) return prev
    popped = prev[prev.length - 1]
    return prev.slice(0, -1)
  })
  return popped
}, [])
const pushInkRedo = useCallback((entry: { annotationId: string; strokes: any[] }) => {
  setInkRedoStack(prev => [...prev, entry])
}, [])
const popInkRedo = useCallback(() => {
  let popped: { annotationId: string; strokes: any[] } | undefined
  setInkRedoStack(prev => {
    if (prev.length === 0) return prev
    popped = prev[prev.length - 1]
    return prev.slice(0, -1)
  })
  return popped
}, [])
const clearInkRedo = useCallback(() => setInkRedoStack([]), [])
```

- [ ] **Step 2: Track undo/redo in MarkdownInkOverlay**

In `MarkdownInkOverlay.tsx`, after a new stroke is saved in `handlePointerUp`, push the previous state to the undo stack:

Before the `api.annotations.update` or `api.annotations.create` call, capture the previous strokes state:

```typescript
// Before saving, push current state to undo stack
if (existing) {
  ctx.pushInkUndo({ annotationId: existing.id, strokes: [...existing.position.strokes] })
} else {
  ctx.pushInkUndo({ annotationId: '__new__', strokes: [] })
}
ctx.clearInkRedo()
```

- [ ] **Step 3: Expose onUndo/onRedo callbacks from MarkdownInkOverlay**

Add `onUndo` and `onRedo` props or implement them inside the overlay. For simplicity, implement them as callbacks passed to the toolbar:

```typescript
const handleUndo = useCallback(async () => {
  const entry = ctx.popInkUndo()
  if (!entry) return
  // Find current state for redo
  const current = inkAnnotations.find(a => a.id === entry.annotationId)
  if (current) {
    ctx.pushInkRedo({ annotationId: current.id, strokes: [...current.position.strokes] })
    if (entry.strokes.length === 0) {
      await api.annotations.delete(current.id)
    } else {
      const bounds = computeBounds(entry.strokes)
      await api.annotations.update(current.id, {
        position: { ...current.position, strokes: entry.strokes, bounds },
      })
    }
  }
  onCreated()
}, [inkAnnotations, onCreated])

const handleRedo = useCallback(async () => {
  const entry = ctx.popInkRedo()
  if (!entry) return
  const current = inkAnnotations.find(a => a.id === entry.annotationId)
  if (current) {
    ctx.pushInkUndo({ annotationId: current.id, strokes: [...current.position.strokes] })
    const bounds = computeBounds(entry.strokes)
    await api.annotations.update(current.id, {
      position: { ...current.position, strokes: entry.strokes, bounds },
    })
  }
  onCreated()
}, [inkAnnotations, onCreated])
```

Export these via new props or a ref.

- [ ] **Step 4: Verify build compiles**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-ui/src/components/viewers/MarkdownViewerContext.tsx packages/shared-ui/src/components/viewers/MarkdownInkOverlay.tsx
git commit -m "feat: add undo/redo support for markdown ink annotations"
```

---

### Task 3: Upgrade MarkdownInkToolbar to Floating Draggable

**Files:**
- Modify: `packages/shared-ui/src/components/viewers/MarkdownInkToolbar.tsx`

This is a full rewrite of `MarkdownInkToolbar.tsx` to match `PdfInkToolbar.tsx`'s design: floating, draggable, preset-based, with undo/redo and highlighter support.

- [ ] **Step 1: Rewrite MarkdownInkToolbar**

Replace entire contents of `MarkdownInkToolbar.tsx` with a floating draggable toolbar. The structure mirrors `PdfInkToolbar.tsx` exactly:

```typescript
import React, { useState, useRef, useCallback } from 'react'
import { Eraser, Lasso, Undo2, Redo2, Trash2, Highlighter, GripVertical } from 'lucide-react'
import { useMarkdownViewer } from './MarkdownViewerContext.js'
import { INK_COLORS, STROKE_WIDTHS, DEFAULT_PRESETS, type InkPreset } from './inkConfig.js'

interface Props {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onClearAll: () => void
}

export default function MarkdownInkToolbar({ onUndo, onRedo, canUndo, canRedo, onClearAll }: Props) {
  const ctx = useMarkdownViewer()
  const [presets, setPresets] = useState<InkPreset[]>(() => DEFAULT_PRESETS.map(p => ({ ...p })))
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const [pos, setPos] = useState({ x: -1, y: 16 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const barRef = useRef<HTMLDivElement>(null)

  const isEraserActive = ctx.activeTool === 'eraser'
  const isLassoActive = ctx.activeTool === 'lasso'
  const isPenLike = !isEraserActive && !isLassoActive

  const closePopups = () => setShowColorPicker(false)

  const activePreset = presets[activePresetIndex]
  const activeColor = isPenLike ? activePreset?.color ?? ctx.inkColor : ctx.inkColor

  const selectPreset = (index: number) => {
    setActivePresetIndex(index)
    const p = presets[index]
    ctx.setInkColor(p.color)
    ctx.setInkWidth(p.width)
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    closePopups()
  }

  const setColor = (c: string) => {
    ctx.setInkColor(c)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], color: c }
      return updated
    })
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    setShowColorPicker(false)
  }

  const setWidth = (w: number) => {
    ctx.setInkWidth(w)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], width: w }
      return updated
    })
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    closePopups()
  }

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    const bar = barRef.current
    const parent = bar?.parentElement
    let px = pos.x, py = pos.y
    if (px === -1 && bar && parent) {
      const pr = parent.getBoundingClientRect()
      const br = bar.getBoundingClientRect()
      px = br.left - pr.left
      py = br.top - pr.top
    }
    dragStart.current = { x: e.clientX, y: e.clientY, px, py }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const parent = barRef.current?.parentElement
      const bar = barRef.current
      if (!parent || !bar) return
      const pr = parent.getBoundingClientRect()
      const bw = bar.offsetWidth
      const bh = bar.offsetHeight
      const rawX = dragStart.current.px + (ev.clientX - dragStart.current.x)
      const rawY = dragStart.current.py + (ev.clientY - dragStart.current.y)
      setPos({
        x: Math.max(0, Math.min(pr.width - bw, rawX)),
        y: Math.max(0, Math.min(pr.height - bh, rawY)),
      })
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [pos])

  const toolBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    active: boolean,
    disabled?: boolean,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(0,0,0,0.08)' : 'transparent',
        border: 'none',
        borderRadius: 8, cursor: disabled ? 'default' : 'pointer', padding: 0,
        color: active ? '#1a1a1a' : '#8e8e93',
        opacity: disabled ? 0.35 : 1,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? 'rgba(0,0,0,0.08)' : 'transparent' }}
    >
      {icon}
    </button>
  )

  const presetIcon = (preset: InkPreset, index: number, size: number) => {
    if (preset.tool === 'highlighter') return <Highlighter size={size} />
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        {index > 0 && <path d="M15 5 19 9" />}
      </svg>
    )
  }

  const sep = () => (
    <div style={{ width: 1, height: 22, background: '#c7c7cc', margin: '0 3px', flexShrink: 0 }} />
  )

  const centeredX = pos.x === -1

  return (
    <div
      ref={barRef}
      style={{
        position: 'absolute',
        top: pos.y,
        ...(centeredX
          ? { left: '50%', transform: 'translateX(-50%)' }
          : { left: pos.x }
        ),
        zIndex: 50,
        display: 'flex', alignItems: 'center',
        padding: '4px 6px',
        background: 'rgba(242,242,247,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
        gap: 2,
        userSelect: 'none',
      }}
    >
      <div
        onPointerDown={handleDragStart}
        style={{
          cursor: 'grab', display: 'flex', alignItems: 'center',
          color: '#c7c7cc', padding: '0 2px', flexShrink: 0,
          touchAction: 'none',
        }}
      >
        <GripVertical size={14} />
      </div>

      {sep()}

      {toolBtn(onUndo, <Undo2 size={16} />, false, !canUndo)}
      {toolBtn(onRedo, <Redo2 size={16} />, false, !canRedo)}

      {sep()}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 1,
        background: 'rgba(0,0,0,0.05)',
        borderRadius: 10, padding: '2px 3px',
      }}>
        {toolBtn(
          () => { ctx.setActiveTool(ctx.activeTool === 'lasso' ? 'ink' : 'lasso'); closePopups() },
          <Lasso size={16} />,
          isLassoActive,
        )}

        {presets.map((preset, i) => {
          const isActive = isPenLike && activePresetIndex === i
          return (
            <button
              key={i}
              onClick={() => selectPreset(i)}
              style={{
                width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? `${preset.color}20` : 'transparent',
                border: 'none',
                borderRadius: 8, cursor: 'pointer', padding: 0,
                color: isActive ? preset.color : '#8e8e93',
                transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${preset.color}20` : 'transparent' }}
            >
              {presetIcon(preset, i, 16)}
              <div style={{
                position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                width: 4, height: 4, borderRadius: '50%',
                background: preset.color,
                border: preset.color === '#ffffff' ? '1px solid #ccc' : 'none',
              }} />
            </button>
          )
        })}

        {toolBtn(
          () => {
            ctx.setActiveTool(ctx.activeTool === 'eraser' ? 'ink' : 'eraser')
            closePopups()
          },
          <Eraser size={16} />,
          isEraserActive,
        )}
      </div>

      {sep()}

      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {STROKE_WIDTHS.map(sw => {
          const isActive = ctx.inkWidth === sw.value
          return (
            <button
              key={sw.value}
              onClick={() => setWidth(sw.value)}
              style={{
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'rgba(0,0,0,0.08)' : 'transparent',
                border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(0,0,0,0.08)' : 'transparent' }}
            >
              <div style={{
                width: 14,
                height: sw.height + 1,
                background: isActive ? activeColor : '#8e8e93',
                borderRadius: 1,
              }} />
            </button>
          )
        })}
      </div>

      {sep()}

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowColorPicker(v => !v)}
          style={{
            width: 24, height: 24, borderRadius: '50%',
            border: `2px solid ${showColorPicker ? '#007aff' : 'rgba(0,0,0,0.12)'}`,
            background: activeColor, cursor: 'pointer',
            transition: 'border-color 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        />
        {showColorPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowColorPicker(false)} />
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: 8, zIndex: 100,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 12, padding: 10, display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}>
              {INK_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: c === activeColor ? '3px solid #007aff' : c === '#ffffff' ? '2px solid #d1d1d6' : '2px solid transparent',
                    background: c, cursor: 'pointer', padding: 0,
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {sep()}

      {toolBtn(onClearAll, <Trash2 size={16} />, false)}
    </div>
  )
}
```

- [ ] **Step 2: Update MarkdownInkToolbar call site**

Find where `MarkdownInkToolbar` is mounted (likely in the markdown viewer layout). Update the props to include `onUndo`, `onRedo`, `canUndo`, `canRedo`. These should come from the overlay's undo/redo state in the context:

```tsx
<MarkdownInkToolbar
  onUndo={handleUndo}
  onRedo={handleRedo}
  canUndo={ctx.inkUndoStack.length > 0}
  canRedo={ctx.inkRedoStack.length > 0}
  onClearAll={handleClearAll}
/>
```

The toolbar must now be rendered inside the content area's relative-positioned container (not as a fixed header bar), since it's `position: absolute`.

- [ ] **Step 3: Verify build compiles**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-ui/src/components/viewers/MarkdownInkToolbar.tsx
git commit -m "feat: upgrade markdown ink toolbar to floating draggable with presets"
```

---

### Task 4: Add Ink State to EPUB Context

**Files:**
- Modify: `packages/shared-ui/src/components/viewers/EpubViewerContext.tsx`

- [ ] **Step 1: Expand EpubAnnotationTool type and add ink state**

In `EpubViewerContext.tsx`:

```typescript
// Change line 5:
export type EpubAnnotationTool = 'none' | 'highlight' | 'note' | 'ink' | 'eraser' | 'lasso'

// Add to EpubViewerContextValue interface:
inkColor: string
setInkColor: (color: string) => void
inkWidth: number
setInkWidth: (w: number) => void
inkEraserActive: boolean
setInkEraserActive: (active: boolean) => void
inkUndoStack: Array<{ annotationId: string; strokes: any[] }>
inkRedoStack: Array<{ annotationId: string; strokes: any[] }>
pushInkUndo: (entry: { annotationId: string; strokes: any[] }) => void
popInkUndo: () => { annotationId: string; strokes: any[] } | undefined
pushInkRedo: (entry: { annotationId: string; strokes: any[] }) => void
popInkRedo: () => { annotationId: string; strokes: any[] } | undefined
clearInkRedo: () => void
```

In the provider, add the corresponding state and callbacks:

```typescript
const [inkColor, setInkColor] = useState('#1a1a1a')
const [inkWidth, setInkWidth] = useState(2)
const [inkEraserActive, setInkEraserActive] = useState(false)
const [inkUndoStack, setInkUndoStack] = useState<Array<{ annotationId: string; strokes: any[] }>>([])
const [inkRedoStack, setInkRedoStack] = useState<Array<{ annotationId: string; strokes: any[] }>>([])

const pushInkUndo = useCallback((entry: { annotationId: string; strokes: any[] }) => {
  setInkUndoStack(prev => [...prev, entry])
}, [])
const popInkUndo = useCallback(() => {
  let popped: { annotationId: string; strokes: any[] } | undefined
  setInkUndoStack(prev => {
    if (prev.length === 0) return prev
    popped = prev[prev.length - 1]
    return prev.slice(0, -1)
  })
  return popped
}, [])
const pushInkRedo = useCallback((entry: { annotationId: string; strokes: any[] }) => {
  setInkRedoStack(prev => [...prev, entry])
}, [])
const popInkRedo = useCallback(() => {
  let popped: { annotationId: string; strokes: any[] } | undefined
  setInkRedoStack(prev => {
    if (prev.length === 0) return prev
    popped = prev[prev.length - 1]
    return prev.slice(0, -1)
  })
  return popped
}, [])
const clearInkRedo = useCallback(() => setInkRedoStack([]), [])
```

Add all new properties to the `value` useMemo and its dependency array.

- [ ] **Step 2: Verify build compiles**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ui/src/components/viewers/EpubViewerContext.tsx
git commit -m "feat: add ink annotation state to EPUB viewer context"
```

---

### Task 5: Create EPUB Ink Overlay

**Files:**
- Create: `packages/shared-ui/src/components/viewers/EpubInkOverlay.tsx`

The EPUB ink overlay works differently from Markdown because epub.js renders content inside an iframe. The overlay canvas sits on top of the `[data-epub-container]` div. Coordinates are relative to the container, and strokes are stored per-location (using epub CFI or location index as the section key).

- [ ] **Step 1: Create EpubInkOverlay component**

Create `packages/shared-ui/src/components/viewers/EpubInkOverlay.tsx`:

```typescript
import React, { useRef, useEffect, useState, useCallback } from 'react'
import { renderStroke, renderAllStrokes } from '../handwriting/renderStrokes.js'
import type { Stroke, StrokePoint } from '@banjuan/core'
import { useEpubViewer } from './EpubViewerContext.js'
import { useBanjuanAPI } from '../../api.js'

interface InkStroke {
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

interface InkAnnotation {
  id: string
  position: {
    type: 'ink'
    page?: number
    strokes: InkStroke[]
    bounds: { x: number; y: number; w: number; h: number }
  }
  color: string
}

interface Props {
  docId: string
  annotations: any[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onCreated: () => void
}

let inkIdCounter = 0

function toAbsoluteStrokes(strokes: InkStroke[], w: number, h: number): Stroke[] {
  return strokes.map(s => ({
    id: `epub-ink-${++inkIdCounter}`,
    points: s.points.map(p => ({ x: p.x * w, y: p.y * h })),
    color: s.color,
    width: s.width,
    opacity: 1,
  }))
}

function computeBounds(strokes: InkStroke[]) {
  const allPts = strokes.flatMap(s => s.points)
  const xs = allPts.map(p => p.x)
  const ys = allPts.map(p => p.y)
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  }
}

export default function EpubInkOverlay({ docId, annotations, containerRef, onCreated }: Props) {
  const api = useBanjuanAPI()
  const ctx = useEpubViewer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentPointsRef = useRef<StrokePoint[]>([])
  const isActive = ctx.activeTool === 'ink' || ctx.activeTool === 'eraser'

  const inkAnnotations: InkAnnotation[] = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.type === 'ink' && a.position?.page === ctx.currentLocation
  )

  const allInkAnnotations: InkAnnotation[] = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.type === 'ink'
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)

    for (const ann of inkAnnotations) {
      const absStrokes = toAbsoluteStrokes(ann.position.strokes, rect.width, rect.height)
      renderAllStrokes(c, absStrokes, rect.width, rect.height)
    }
  }, [inkAnnotations, containerRef])

  useEffect(() => { redraw() }, [redraw])

  // Redraw on location change
  useEffect(() => { redraw() }, [ctx.currentLocation])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (ctx.activeTool === 'eraser') {
      handleErase(e)
      return
    }
    if (ctx.activeTool !== 'ink') return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrawing(true)
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    currentPointsRef.current = [{ x, y }]
  }, [ctx.activeTool, containerRef])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing || ctx.activeTool !== 'ink') return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    currentPointsRef.current.push({ x, y })

    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const c = canvas.getContext('2d')!
    c.scale(dpr, dpr)

    for (const ann of inkAnnotations) {
      const absStrokes = toAbsoluteStrokes(ann.position.strokes, rect.width, rect.height)
      renderAllStrokes(c, absStrokes, rect.width, rect.height)
    }

    const liveStroke: Stroke = {
      id: 'live',
      points: currentPointsRef.current.map(p => ({ x: p.x * rect.width, y: p.y * rect.height })),
      color: ctx.inkColor,
      width: ctx.inkWidth,
      opacity: 1,
    }
    renderStroke(c, liveStroke)
  }, [drawing, ctx.activeTool, ctx.inkColor, ctx.inkWidth, inkAnnotations, containerRef])

  const handlePointerUp = useCallback(async () => {
    if (!drawing) return
    setDrawing(false)
    const points = currentPointsRef.current
    if (points.length < 2) return

    const newStroke: InkStroke = {
      points: points.map(p => ({ x: p.x, y: p.y })),
      color: ctx.inkColor,
      width: ctx.inkWidth,
    }

    const page = ctx.currentLocation
    const existing = inkAnnotations[0]
    const allStrokes = existing
      ? [...existing.position.strokes, newStroke]
      : [newStroke]

    const bounds = computeBounds(allStrokes)
    const position = { type: 'ink' as const, page, strokes: allStrokes, bounds }

    if (existing) {
      ctx.pushInkUndo({ annotationId: existing.id, strokes: [...existing.position.strokes] })
      await api.annotations.update(existing.id, { position })
    } else {
      ctx.pushInkUndo({ annotationId: '__new__', strokes: [] })
      await api.annotations.create({
        docId, type: 'ink', page, position, color: ctx.inkColor,
      })
    }
    ctx.clearInkRedo()
    currentPointsRef.current = []
    onCreated()
  }, [drawing, docId, ctx.inkColor, ctx.inkWidth, ctx.currentLocation, onCreated, inkAnnotations])

  const handleErase = useCallback(async (e: React.PointerEvent) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const clickX = (e.clientX - rect.left) / rect.width
    const clickY = (e.clientY - rect.top) / rect.height
    const threshold = 20

    for (const ann of inkAnnotations) {
      for (let si = 0; si < ann.position.strokes.length; si++) {
        const stroke = ann.position.strokes[si]
        for (const pt of stroke.points) {
          const dx = (pt.x - clickX) * rect.width
          const dy = (pt.y - clickY) * rect.height
          if (Math.sqrt(dx * dx + dy * dy) < threshold) {
            const remaining = ann.position.strokes.filter((_, i) => i !== si)
            if (remaining.length === 0) {
              await api.annotations.delete(ann.id)
            } else {
              const bounds = computeBounds(remaining)
              await api.annotations.update(ann.id, {
                position: { type: 'ink', page: ann.position.page, strokes: remaining, bounds },
              })
            }
            onCreated()
            return
          }
        }
      }
    }
  }, [inkAnnotations, containerRef, onCreated])

  const handleUndo = useCallback(async () => {
    const entry = ctx.popInkUndo()
    if (!entry) return
    const current = allInkAnnotations.find(a => a.id === entry.annotationId)
    if (current) {
      ctx.pushInkRedo({ annotationId: current.id, strokes: [...current.position.strokes] })
      if (entry.strokes.length === 0) {
        await api.annotations.delete(current.id)
      } else {
        const bounds = computeBounds(entry.strokes)
        await api.annotations.update(current.id, {
          position: { ...current.position, strokes: entry.strokes, bounds },
        })
      }
    }
    onCreated()
  }, [allInkAnnotations, onCreated])

  const handleRedo = useCallback(async () => {
    const entry = ctx.popInkRedo()
    if (!entry) return
    const current = allInkAnnotations.find(a => a.id === entry.annotationId)
    if (current) {
      ctx.pushInkUndo({ annotationId: current.id, strokes: [...current.position.strokes] })
      const bounds = computeBounds(entry.strokes)
      await api.annotations.update(current.id, {
        position: { ...current.position, strokes: entry.strokes, bounds },
      })
    }
    onCreated()
  }, [allInkAnnotations, onCreated])

  if (!isActive && inkAnnotations.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: isActive ? 'auto' : 'none',
        cursor: ctx.activeTool === 'ink' ? 'crosshair' : ctx.activeTool === 'eraser' ? 'pointer' : 'default',
        zIndex: isActive ? 10 : 2,
        touchAction: 'none',
      }}
    />
  )
}
```

Note: The `handleUndo` and `handleRedo` functions need to be exposed to the toolbar. Export them via a ref pattern or pass them up through the parent. The simplest approach is to have the parent component hold references to these.

- [ ] **Step 2: Verify build compiles**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ui/src/components/viewers/EpubInkOverlay.tsx
git commit -m "feat: create EPUB ink overlay with drawing, eraser, undo/redo"
```

---

### Task 6: Create EPUB Ink Toolbar

**Files:**
- Create: `packages/shared-ui/src/components/viewers/EpubInkToolbar.tsx`

This is essentially the same floating draggable toolbar as PdfInkToolbar but wired to EpubViewerContext.

- [ ] **Step 1: Create EpubInkToolbar**

Create `packages/shared-ui/src/components/viewers/EpubInkToolbar.tsx`:

```typescript
import React, { useState, useRef, useCallback } from 'react'
import { Eraser, Lasso, Undo2, Redo2, Trash2, Highlighter, GripVertical } from 'lucide-react'
import { useEpubViewer } from './EpubViewerContext.js'
import { INK_COLORS, STROKE_WIDTHS, DEFAULT_PRESETS, type InkPreset } from './inkConfig.js'

interface Props {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onClearPage: () => void
}

export default function EpubInkToolbar({ onUndo, onRedo, canUndo, canRedo, onClearPage }: Props) {
  const ctx = useEpubViewer()
  const [presets, setPresets] = useState<InkPreset[]>(() => DEFAULT_PRESETS.map(p => ({ ...p })))
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const [pos, setPos] = useState({ x: -1, y: 16 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const barRef = useRef<HTMLDivElement>(null)

  const isEraserActive = ctx.inkEraserActive
  const isLassoActive = ctx.activeTool === 'lasso'
  const isPenLike = !isEraserActive && !isLassoActive

  const closePopups = () => setShowColorPicker(false)

  const activePreset = presets[activePresetIndex]
  const activeColor = isPenLike ? activePreset?.color ?? ctx.inkColor : ctx.inkColor

  const selectPreset = (index: number) => {
    setActivePresetIndex(index)
    const p = presets[index]
    ctx.setInkColor(p.color)
    ctx.setInkWidth(p.width)
    ctx.setInkEraserActive(false)
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    closePopups()
  }

  const setColor = (c: string) => {
    ctx.setInkColor(c)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], color: c }
      return updated
    })
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    setShowColorPicker(false)
  }

  const setWidth = (w: number) => {
    ctx.setInkWidth(w)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], width: w }
      return updated
    })
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    closePopups()
  }

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    const bar = barRef.current
    const parent = bar?.parentElement
    let px = pos.x, py = pos.y
    if (px === -1 && bar && parent) {
      const pr = parent.getBoundingClientRect()
      const br = bar.getBoundingClientRect()
      px = br.left - pr.left
      py = br.top - pr.top
    }
    dragStart.current = { x: e.clientX, y: e.clientY, px, py }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const parent = barRef.current?.parentElement
      const bar = barRef.current
      if (!parent || !bar) return
      const pr = parent.getBoundingClientRect()
      const bw = bar.offsetWidth
      const bh = bar.offsetHeight
      const rawX = dragStart.current.px + (ev.clientX - dragStart.current.x)
      const rawY = dragStart.current.py + (ev.clientY - dragStart.current.y)
      setPos({
        x: Math.max(0, Math.min(pr.width - bw, rawX)),
        y: Math.max(0, Math.min(pr.height - bh, rawY)),
      })
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [pos])

  const toolBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    active: boolean,
    disabled?: boolean,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(0,0,0,0.08)' : 'transparent',
        border: 'none',
        borderRadius: 8, cursor: disabled ? 'default' : 'pointer', padding: 0,
        color: active ? '#1a1a1a' : '#8e8e93',
        opacity: disabled ? 0.35 : 1,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? 'rgba(0,0,0,0.08)' : 'transparent' }}
    >
      {icon}
    </button>
  )

  const presetIcon = (preset: InkPreset, index: number, size: number) => {
    if (preset.tool === 'highlighter') return <Highlighter size={size} />
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        {index > 0 && <path d="M15 5 19 9" />}
      </svg>
    )
  }

  const sep = () => (
    <div style={{ width: 1, height: 22, background: '#c7c7cc', margin: '0 3px', flexShrink: 0 }} />
  )

  const centeredX = pos.x === -1

  return (
    <div
      ref={barRef}
      style={{
        position: 'absolute',
        top: pos.y,
        ...(centeredX
          ? { left: '50%', transform: 'translateX(-50%)' }
          : { left: pos.x }
        ),
        zIndex: 50,
        display: 'flex', alignItems: 'center',
        padding: '4px 6px',
        background: 'rgba(242,242,247,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
        gap: 2,
        userSelect: 'none',
      }}
    >
      <div
        onPointerDown={handleDragStart}
        style={{
          cursor: 'grab', display: 'flex', alignItems: 'center',
          color: '#c7c7cc', padding: '0 2px', flexShrink: 0,
          touchAction: 'none',
        }}
      >
        <GripVertical size={14} />
      </div>

      {sep()}

      {toolBtn(onUndo, <Undo2 size={16} />, false, !canUndo)}
      {toolBtn(onRedo, <Redo2 size={16} />, false, !canRedo)}

      {sep()}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 1,
        background: 'rgba(0,0,0,0.05)',
        borderRadius: 10, padding: '2px 3px',
      }}>
        {toolBtn(
          () => { ctx.setActiveTool(ctx.activeTool === 'lasso' ? 'ink' : 'lasso'); closePopups() },
          <Lasso size={16} />,
          isLassoActive,
        )}

        {presets.map((preset, i) => {
          const isActive = isPenLike && activePresetIndex === i
          return (
            <button
              key={i}
              onClick={() => selectPreset(i)}
              style={{
                width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? `${preset.color}20` : 'transparent',
                border: 'none',
                borderRadius: 8, cursor: 'pointer', padding: 0,
                color: isActive ? preset.color : '#8e8e93',
                transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${preset.color}20` : 'transparent' }}
            >
              {presetIcon(preset, i, 16)}
              <div style={{
                position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                width: 4, height: 4, borderRadius: '50%',
                background: preset.color,
                border: preset.color === '#ffffff' ? '1px solid #ccc' : 'none',
              }} />
            </button>
          )
        })}

        {toolBtn(
          () => { ctx.setInkEraserActive(!ctx.inkEraserActive); closePopups() },
          <Eraser size={16} />,
          isEraserActive,
        )}
      </div>

      {sep()}

      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {STROKE_WIDTHS.map(sw => {
          const isActive = ctx.inkWidth === sw.value
          return (
            <button
              key={sw.value}
              onClick={() => setWidth(sw.value)}
              style={{
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'rgba(0,0,0,0.08)' : 'transparent',
                border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(0,0,0,0.08)' : 'transparent' }}
            >
              <div style={{
                width: 14,
                height: sw.height + 1,
                background: isActive ? activeColor : '#8e8e93',
                borderRadius: 1,
              }} />
            </button>
          )
        })}
      </div>

      {sep()}

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowColorPicker(v => !v)}
          style={{
            width: 24, height: 24, borderRadius: '50%',
            border: `2px solid ${showColorPicker ? '#007aff' : 'rgba(0,0,0,0.12)'}`,
            background: activeColor, cursor: 'pointer',
            transition: 'border-color 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        />
        {showColorPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowColorPicker(false)} />
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: 8, zIndex: 100,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 12, padding: 10, display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}>
              {INK_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: c === activeColor ? '3px solid #007aff' : c === '#ffffff' ? '2px solid #d1d1d6' : '2px solid transparent',
                    background: c, cursor: 'pointer', padding: 0,
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {sep()}

      {toolBtn(onClearPage, <Trash2 size={16} />, false)}
    </div>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ui/src/components/viewers/EpubInkToolbar.tsx
git commit -m "feat: create floating draggable ink toolbar for EPUB viewer"
```

---

### Task 7: Wire EPUB Ink into Viewer

**Files:**
- Modify: `packages/shared-ui/src/components/viewers/EpubToolbar.tsx`
- Modify: `packages/shared-ui/src/components/viewers/EpubContentArea.tsx`
- Modify: `packages/shared-ui/src/components/viewers/EpubViewer.tsx`

- [ ] **Step 1: Add ink toggle to EpubToolbar**

In `EpubToolbar.tsx`, add a `Pen` icon import and an ink tool button:

```typescript
import { PanelLeft, Minus as MinusIcon, Plus as PlusIcon, ChevronLeft, ChevronRight, ChevronDown, Search, PanelRight, Highlighter, StickyNote, ScrollText, BookOpen, Clock, Pen } from 'lucide-react'
```

Add the ink toggle button after the flow mode buttons (after line 100, before the flex spacer):

```tsx
<div style={sepStyle} />
<button
  style={ctx.activeTool === 'ink' || ctx.activeTool === 'eraser' || ctx.activeTool === 'lasso' ? activeBtnStyle : btnStyle}
  onClick={() => {
    const isInk = ctx.activeTool === 'ink' || ctx.activeTool === 'eraser' || ctx.activeTool === 'lasso'
    ctx.setActiveTool(isInk ? 'none' : 'ink')
    if (isInk) ctx.setInkEraserActive(false)
  }}
  title="Ink annotation"
>
  <Pen size={16} />
</button>
```

- [ ] **Step 2: Mount ink overlay and toolbar in EpubContentArea**

In `EpubContentArea.tsx`, add imports and mount the overlay + toolbar:

```typescript
import EpubInkOverlay from './EpubInkOverlay.js'
import EpubInkToolbar from './EpubInkToolbar.js'
import { useEpubViewer } from './EpubViewerContext.js'
```

Add props for ink support:

```typescript
interface Props {
  annotations: Array<{...}>
  docId: string
  onHighlightCreated: (cfiRange: string, text: string) => void
  onNoteCreated: (cfiRange: string, text: string, noteContent: string) => void
  onInkCreated: () => void
  onInkUndo: () => void
  onInkRedo: () => void
  onInkClearPage: () => void
  inkCanUndo: boolean
  inkCanRedo: boolean
}
```

Inside the return JSX, add the ink overlay canvas and toolbar after the epub container content:

```tsx
return (
  <div
    ref={containerRef}
    data-epub-container
    style={{
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
      background: 'var(--bg)',
    }}
  >
    {/* Existing selection/note popups... */}

    {/* Ink overlay */}
    <EpubInkOverlay
      docId={docId}
      annotations={annotations}
      containerRef={containerRef}
      onCreated={onInkCreated}
    />

    {/* Ink toolbar - only shown when ink mode active */}
    {(ctx.activeTool === 'ink' || ctx.activeTool === 'eraser' || ctx.activeTool === 'lasso') && (
      <EpubInkToolbar
        onUndo={onInkUndo}
        onRedo={onInkRedo}
        canUndo={inkCanUndo}
        canRedo={inkCanRedo}
        onClearPage={onInkClearPage}
      />
    )}
  </div>
)
```

- [ ] **Step 3: Wire up ink handlers in EpubViewer**

In `EpubViewer.tsx` (`EpubViewerInner`), add ink-related handlers:

```typescript
const handleInkCreated = useCallback(() => {
  reload()
}, [reload])

const handleInkClearPage = useCallback(async () => {
  const inkAnns = annotations.filter(
    (a: any) => a.type === 'ink' && a.position?.page === ctx.currentLocation
  )
  for (const ann of inkAnns) {
    await api.annotations.delete(ann.id)
  }
  reload()
}, [annotations, ctx.currentLocation, reload])
```

Pass these props to `EpubContentArea`:

```tsx
<EpubContentArea
  annotations={annotations}
  docId={doc.id}
  onHighlightCreated={handleHighlightCreated}
  onNoteCreated={handleNoteCreated}
  onInkCreated={handleInkCreated}
  onInkUndo={/* wire to overlay's handleUndo */}
  onInkRedo={/* wire to overlay's handleRedo */}
  onInkClearPage={handleInkClearPage}
  inkCanUndo={ctx.inkUndoStack.length > 0}
  inkCanRedo={ctx.inkRedoStack.length > 0}
/>
```

For the undo/redo wiring, the simplest approach is to implement the undo/redo logic directly in the `EpubViewerInner` component (same as how `handleInkClearPage` works), using the context's undo/redo stacks and the annotations array. This avoids needing to lift callbacks from the overlay.

```typescript
const handleInkUndo = useCallback(async () => {
  const entry = ctx.popInkUndo()
  if (!entry) return
  const current = annotations.find((a: any) => a.id === entry.annotationId)
  if (current) {
    ctx.pushInkRedo({ annotationId: current.id, strokes: [...(current as any).position.strokes] })
    if (entry.strokes.length === 0) {
      await api.annotations.delete(current.id)
    } else {
      const allPts = entry.strokes.flatMap((s: any) => s.points)
      const xs = allPts.map((p: any) => p.x)
      const ys = allPts.map((p: any) => p.y)
      const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      await api.annotations.update(current.id, {
        position: { ...(current as any).position, strokes: entry.strokes, bounds },
      })
    }
  }
  reload()
}, [annotations, reload])

const handleInkRedo = useCallback(async () => {
  const entry = ctx.popInkRedo()
  if (!entry) return
  const current = annotations.find((a: any) => a.id === entry.annotationId)
  if (current) {
    ctx.pushInkUndo({ annotationId: current.id, strokes: [...(current as any).position.strokes] })
    const allPts = entry.strokes.flatMap((s: any) => s.points)
    const xs = allPts.map((p: any) => p.x)
    const ys = allPts.map((p: any) => p.y)
    const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    await api.annotations.update(current.id, {
      position: { ...(current as any).position, strokes: entry.strokes, bounds },
    })
  }
  reload()
}, [annotations, reload])
```

- [ ] **Step 4: Verify build compiles**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Test in browser**

1. Open an EPUB file
2. Click the pen icon in the toolbar - should enter ink mode
3. Floating toolbar should appear, centered at top
4. Draw strokes on the page
5. Switch presets (pen 1, pen 2, highlighter)
6. Test eraser by clicking on a stroke
7. Test undo/redo
8. Test dragging the toolbar
9. Navigate to different pages - strokes should persist per-location
10. Exit ink mode by clicking pen icon again

- [ ] **Step 6: Commit**

```bash
git add packages/shared-ui/src/components/viewers/EpubToolbar.tsx packages/shared-ui/src/components/viewers/EpubContentArea.tsx packages/shared-ui/src/components/viewers/EpubViewer.tsx
git commit -m "feat: wire EPUB ink overlay and toolbar into viewer"
```

---

### Task 8: Final Verification and Cleanup

- [ ] **Step 1: Verify all three viewers have consistent ink experience**

Open each viewer type and verify:

| Feature | PDF | Markdown | EPUB |
|---------|-----|----------|------|
| Floating toolbar | ✓ | ✓ | ✓ |
| Draggable | ✓ | ✓ | ✓ |
| 3 presets (2 pen + 1 highlighter) | ✓ | ✓ | ✓ |
| Same 10 colors | ✓ | ✓ | ✓ |
| Same 3 widths (1/3/6) | ✓ | ✓ | ✓ |
| Undo/Redo | ✓ | ✓ | ✓ |
| Eraser | ✓ | ✓ | ✓ |
| Lasso | ✓ | ✓ | ✓ |
| Clear/Trash | ✓ | ✓ | ✓ |

- [ ] **Step 2: Remove unused INK_WIDTHS references**

Check if `INK_WIDTHS` from `MarkdownViewerContext` is still imported anywhere. If not, it was already cleaned up in Task 1 Step 3. If any file still imports it, update the import to use `STROKE_WIDTHS` from `inkConfig.ts`.

Run: `grep -r "INK_WIDTHS" packages/shared-ui/src/`
Expected: No results (all migrated to STROKE_WIDTHS).

- [ ] **Step 3: Full build check**

Run: `cd packages/shared-ui && npx tsc --noEmit`
Expected: Clean build with no errors.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore: clean up unused ink config references"
```
