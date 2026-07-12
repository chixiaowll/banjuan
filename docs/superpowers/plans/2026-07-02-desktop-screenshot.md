# Desktop Screenshot (Feishu-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop (Electron) Feishu-style screenshot: global hotkey / in-app button → full-screen capture → drag-select a region → annotate (rectangle, arrow, pen, text) with undo → copy the result to the clipboard.

**Architecture:** Main process captures each display with `desktopCapturer` and opens a transparent, always-on-top overlay `BrowserWindow` per display (reusing the existing `#hash` renderer-route pattern from `export-window.ts`). The overlay renderer (`ScreenshotOverlay`) does selection + canvas annotation, composes a PNG, and hands it back over IPC; main writes it to the clipboard. Pure geometry / ops logic is extracted into unit-tested utilities.

**Tech Stack:** Electron (`desktopCapturer`, `globalShortcut`, `clipboard`, `nativeImage`, `systemPreferences`), React (overlay UI), HTML5 Canvas, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-desktop-screenshot-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/app/src/renderer/screenshot/geometry.ts` | Pure helpers: arrow-head points, CSS↔device-px scaling, crop rect normalization. Unit-tested. |
| `packages/app/src/renderer/screenshot/ops.ts` | `AnnotationOp` types + `renderOps(ctx, ops)` + undo helper. Unit-tested for the pure parts. |
| `packages/app/src/renderer/screenshot/geometry.test.ts` | Tests for geometry.ts |
| `packages/app/src/renderer/screenshot/ops.test.ts` | Tests for the pure ops helpers |
| `packages/app/src/renderer/views/ScreenshotOverlay.tsx` | Overlay UI: dim, drag-select, toolbar, annotation canvas, compose+confirm. |
| `packages/app/src/main/screenshot-service.ts` | Capture, overlay windows, hotkey, permission, IPC, clipboard write, hotkey settings. |
| `packages/app/src/main/settings-store.ts` | Tiny JSON settings store under `~/.banjuan/settings.json` (hotkey). |
| `packages/app/src/main/index.ts` | Wire `initScreenshot()` on ready, `disposeScreenshot()` on quit. |
| `packages/app/src/preload/index.ts` | Expose `screenshot` + `settings` APIs. |
| `packages/app/electron.d.ts` | Types for the new preload APIs. |
| `packages/app/src/renderer/App.tsx` | `#screenshot-overlay` hash branch. |
| `packages/shared-ui/src/api.ts` | Add optional `screenshot?` to `BanjuanAPI` (desktop-only). |
| `packages/shared-ui/src/components/TitleBar.tsx` | Screenshot button (rendered only when `api.screenshot` exists). |
| `packages/app/package.json` | Add `"test": "vitest run"`. |
| `packages/shared-ui/src/i18n/*.ts` | Button tooltip + permission dialog strings (7 languages). |

---

## Task 1: Pure geometry utilities (TDD)

**Files:**
- Create: `packages/app/src/renderer/screenshot/geometry.ts`
- Test: `packages/app/src/renderer/screenshot/geometry.test.ts`
- Modify: `packages/app/package.json` (add test script)

- [ ] **Step 1: Add the test script**

In `packages/app/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing test**

Create `packages/app/src/renderer/screenshot/geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeRect, arrowHead, toDevicePx, type Rect } from './geometry.js'

describe('normalizeRect', () => {
  it('orders corners so width/height are positive when dragged up-left', () => {
    const r = normalizeRect({ x: 100, y: 100 }, { x: 40, y: 30 })
    expect(r).toEqual({ x: 40, y: 30, w: 60, h: 70 })
  })
  it('handles a normal down-right drag', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 60, y: 80 })).toEqual({ x: 10, y: 20, w: 50, h: 60 })
  })
})

describe('toDevicePx', () => {
  it('scales a rect by the device pixel ratio', () => {
    const r: Rect = { x: 10, y: 20, w: 30, h: 40 }
    expect(toDevicePx(r, 2)).toEqual({ x: 20, y: 40, w: 60, h: 80 })
  })
})

describe('arrowHead', () => {
  it('returns two barb points behind the head for a rightward arrow', () => {
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
    // barbs sit left of the head (smaller x) and straddle the axis (±y)
    expect(a.x).toBeLessThan(100)
    expect(b.x).toBeLessThan(100)
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y))
    expect(Math.abs(a.y)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @banjuan/app exec vitest run src/renderer/screenshot/geometry.test.ts`
Expected: FAIL — `Cannot find module './geometry.js'`.

- [ ] **Step 4: Implement `geometry.ts`**

Create `packages/app/src/renderer/screenshot/geometry.ts`:
```ts
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Build a positive-width/height rect from any two drag corners. */
export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

/** Scale a rect from CSS px to device px (multiply by scaleFactor). */
export function toDevicePx(r: Rect, scale: number): Rect {
  return { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }
}

/**
 * Two barb points for an arrowhead at `head`, given the line from `tail`.
 * `size` is the barb length in the same units as the points.
 */
export function arrowHead(tail: Point, head: Point, size: number): [Point, Point] {
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x)
  const spread = Math.PI / 7
  return [
    { x: head.x - size * Math.cos(angle - spread), y: head.y - size * Math.sin(angle - spread) },
    { x: head.x - size * Math.cos(angle + spread), y: head.y - size * Math.sin(angle + spread) },
  ]
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @banjuan/app exec vitest run src/renderer/screenshot/geometry.test.ts`
Expected: PASS (3 files? no — 1 file, 4 tests pass).

- [ ] **Step 6: Commit**

```bash
git add packages/app/package.json packages/app/src/renderer/screenshot/geometry.ts packages/app/src/renderer/screenshot/geometry.test.ts
git commit -m "feat(screenshot): pure geometry utils for overlay annotation"
```

---

## Task 2: Annotation ops model + renderer (TDD for the pure parts)

**Files:**
- Create: `packages/app/src/renderer/screenshot/ops.ts`
- Test: `packages/app/src/renderer/screenshot/ops.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/app/src/renderer/screenshot/ops.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { popOp, type AnnotationOp } from './ops.js'

const rect: AnnotationOp = { kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 } }
const pen: AnnotationOp = { kind: 'pen', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }

describe('popOp', () => {
  it('removes the last op immutably', () => {
    const before = [rect, pen]
    const after = popOp(before)
    expect(after).toEqual([rect])
    expect(before).toHaveLength(2) // original untouched
  })
  it('is a no-op on an empty list', () => {
    expect(popOp([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @banjuan/app exec vitest run src/renderer/screenshot/ops.test.ts`
Expected: FAIL — `Cannot find module './ops.js'`.

- [ ] **Step 3: Implement `ops.ts`**

Create `packages/app/src/renderer/screenshot/ops.ts`:
```ts
import { arrowHead, type Point, type Rect } from './geometry.js'

export type AnnotationOp =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'arrow'; tail: Point; head: Point }
  | { kind: 'pen'; points: Point[] }
  | { kind: 'text'; at: Point; text: string; fontPx: number }

export const STROKE = '#ff3b30'
export const STROKE_WIDTH = 3

/** Immutably drop the last op (undo). */
export function popOp(ops: AnnotationOp[]): AnnotationOp[] {
  return ops.length ? ops.slice(0, -1) : ops
}

/**
 * Draw ops onto a 2D context. `scale` multiplies every coordinate (1 for the
 * on-screen preview which already uses CSS px; scaleFactor for the final
 * device-px compose). Stroke width scales too so lines stay visually constant.
 */
export function renderOps(ctx: CanvasRenderingContext2D, ops: AnnotationOp[], scale = 1): void {
  ctx.strokeStyle = STROKE
  ctx.fillStyle = STROKE
  ctx.lineWidth = STROKE_WIDTH * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const op of ops) {
    if (op.kind === 'rect') {
      ctx.strokeRect(op.rect.x * scale, op.rect.y * scale, op.rect.w * scale, op.rect.h * scale)
    } else if (op.kind === 'arrow') {
      const tail = { x: op.tail.x * scale, y: op.tail.y * scale }
      const head = { x: op.head.x * scale, y: op.head.y * scale }
      ctx.beginPath()
      ctx.moveTo(tail.x, tail.y)
      ctx.lineTo(head.x, head.y)
      const [a, b] = arrowHead(tail, head, 16 * scale)
      ctx.moveTo(head.x, head.y); ctx.lineTo(a.x, a.y)
      ctx.moveTo(head.x, head.y); ctx.lineTo(b.x, b.y)
      ctx.stroke()
    } else if (op.kind === 'pen') {
      ctx.beginPath()
      op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale)))
      ctx.stroke()
    } else if (op.kind === 'text') {
      ctx.font = `${op.fontPx * scale}px -apple-system, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(op.text, op.at.x * scale, op.at.y * scale)
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @banjuan/app exec vitest run src/renderer/screenshot/ops.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/renderer/screenshot/ops.ts packages/app/src/renderer/screenshot/ops.test.ts
git commit -m "feat(screenshot): annotation ops model + canvas renderer"
```

---

## Task 3: Settings store (hotkey persistence)

**Files:**
- Create: `packages/app/src/main/settings-store.ts`

- [ ] **Step 1: Implement the store**

Create `packages/app/src/main/settings-store.ts`:
```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

const SETTINGS_FILE = join(homedir(), '.banjuan', 'settings.json')

/** Default screenshot hotkey per platform (Electron accelerator syntax). */
export const DEFAULT_SCREENSHOT_HOTKEY =
  process.platform === 'darwin' ? 'Command+Shift+A' : 'Control+Shift+A'

interface Settings { screenshotHotkey?: string }

function read(): Settings {
  try { return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Settings } catch { return {} }
}

function write(s: Settings): void {
  try { mkdirSync(dirname(SETTINGS_FILE), { recursive: true }); writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)) } catch { /* best effort */ }
}

export function getScreenshotHotkey(): string {
  return read().screenshotHotkey || DEFAULT_SCREENSHOT_HOTKEY
}

export function setScreenshotHotkey(accelerator: string): void {
  write({ ...read(), screenshotHotkey: accelerator })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/main/settings-store.ts
git commit -m "feat(screenshot): settings store for the capture hotkey"
```

---

## Task 4: Main-process screenshot service

**Files:**
- Create: `packages/app/src/main/screenshot-service.ts`

This owns capture, overlay windows, hotkey, permission, IPC, and clipboard.

- [ ] **Step 1: Implement the service**

Create `packages/app/src/main/screenshot-service.ts`:
```ts
import { BrowserWindow, ipcMain, desktopCapturer, screen, clipboard, nativeImage, globalShortcut, systemPreferences, dialog, shell } from 'electron'
import { join } from 'node:path'
import { getScreenshotHotkey, setScreenshotHotkey } from './settings-store.js'

let overlays: BrowserWindow[] = []
let capturing = false

function closeOverlays(): void {
  for (const w of overlays) { if (!w.isDestroyed()) w.close() }
  overlays = []
  capturing = false
}

/** macOS Screen Recording permission gate. Returns true if capture may proceed. */
function ensureScreenPermission(): boolean {
  if (process.platform !== 'darwin') return true
  if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return true
  dialog.showMessageBox({
    type: 'info',
    message: 'Screen Recording permission needed',
    detail: 'Enable Screen Recording for banjuan in System Settings → Privacy & Security, then try again.',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  })
  return false
}

export async function triggerCapture(): Promise<void> {
  if (capturing) return
  if (!ensureScreenPermission()) return
  capturing = true
  try {
    const displays = screen.getAllDisplays()
    // Capture at device-pixel resolution. Ask for the largest display size so
    // getSources returns full-res thumbnails; we match sources to displays by id.
    const maxW = Math.max(...displays.map(d => d.bounds.width * d.scaleFactor))
    const maxH = Math.max(...displays.map(d => d.bounds.height * d.scaleFactor))
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } })
    if (sources.length === 0) { capturing = false; dialog.showErrorBox('Screenshot failed', 'No screen source available.'); return }

    for (const display of displays) {
      const source =
        sources.find(s => String(s.display_id) === String(display.id)) ??
        sources[displays.indexOf(display)] ?? sources[0]
      const image = source.thumbnail.toDataURL()
      const win = new BrowserWindow({
        x: display.bounds.x, y: display.bounds.y,
        width: display.bounds.width, height: display.bounds.height,
        frame: false, transparent: true, resizable: false, movable: false,
        skipTaskbar: true, hasShadow: false, enableLargerThanScreen: true,
        fullscreenable: false, alwaysOnTop: true,
        webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
      })
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      const payload = { image, width: display.bounds.width, height: display.bounds.height, scaleFactor: display.scaleFactor }
      win.webContents.once('did-finish-load', () => win.webContents.send('screenshot:init', payload))
      if (process.env.VITE_DEV_SERVER_URL) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#screenshot-overlay`)
      else win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'screenshot-overlay' })
      win.on('closed', () => { overlays = overlays.filter(w => w !== win) })
      overlays.push(win)
    }
  } catch (err) {
    capturing = false
    dialog.showErrorBox('Screenshot failed', String(err))
  }
}

let registeredHotkey: string | null = null

function registerHotkey(): void {
  if (registeredHotkey) { globalShortcut.unregister(registeredHotkey); registeredHotkey = null }
  const accel = getScreenshotHotkey()
  try { if (globalShortcut.register(accel, () => { void triggerCapture() })) registeredHotkey = accel } catch { /* invalid accelerator */ }
}

export function initScreenshot(): void {
  registerHotkey()
  ipcMain.handle('screenshot:trigger', () => triggerCapture())
  ipcMain.on('screenshot:confirm', (_e, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    closeOverlays()
  })
  ipcMain.on('screenshot:cancel', () => closeOverlays())
  ipcMain.handle('settings:getScreenshotHotkey', () => getScreenshotHotkey())
  ipcMain.handle('settings:setScreenshotHotkey', (_e, accel: string) => { setScreenshotHotkey(accel); registerHotkey(); return getScreenshotHotkey() })
}

export function disposeScreenshot(): void {
  globalShortcut.unregisterAll()
  registeredHotkey = null
  closeOverlays()
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/main/screenshot-service.ts
git commit -m "feat(screenshot): main-process capture, overlay windows, hotkey, clipboard"
```

---

## Task 5: Wire the service into the app lifecycle

**Files:**
- Modify: `packages/app/src/main/index.ts`

- [ ] **Step 1: Import and initialize**

In `packages/app/src/main/index.ts`, add the import near the other main imports:
```ts
import { initScreenshot, disposeScreenshot } from './screenshot-service.js'
```
After the app is ready and `createWindow()` is called (inside the same `app.whenReady().then(...)` / ready handler where `createWindow()` runs at line ~55), add:
```ts
  initScreenshot()
```
Add a quit handler (near the end of the file, alongside other `app.on(...)` handlers):
```ts
app.on('will-quit', () => { disposeScreenshot() })
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/main/index.ts
git commit -m "feat(screenshot): init/dispose service on app ready/quit"
```

---

## Task 6: Preload + types

**Files:**
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/electron.d.ts`
- Modify: `packages/shared-ui/src/api.ts`

- [ ] **Step 1: Expose the preload API**

In `packages/app/src/preload/index.ts`, add a `screenshot` group to the `api` object (place it alongside the other groups, before the closing `}` of `const api = { ... }`):
```ts
  screenshot: {
    trigger: () => ipcRenderer.invoke('screenshot:trigger'),
    onInit: (cb: (p: { image: string; width: number; height: number; scaleFactor: number }) => void) => {
      const handler = (_e: any, p: any) => cb(p)
      ipcRenderer.on('screenshot:init', handler)
      return () => ipcRenderer.removeListener('screenshot:init', handler)
    },
    confirm: (dataUrl: string) => ipcRenderer.send('screenshot:confirm', dataUrl),
    cancel: () => ipcRenderer.send('screenshot:cancel'),
    getHotkey: () => ipcRenderer.invoke('settings:getScreenshotHotkey') as Promise<string>,
    setHotkey: (accel: string) => ipcRenderer.invoke('settings:setScreenshotHotkey', accel) as Promise<string>,
  },
```

- [ ] **Step 2: Add types in `electron.d.ts`**

In `packages/app/electron.d.ts`, add inside the electron API interface (alongside the other groups):
```ts
    screenshot: {
      trigger: () => Promise<void>
      onInit: (cb: (p: { image: string; width: number; height: number; scaleFactor: number }) => void) => () => void
      confirm: (dataUrl: string) => void
      cancel: () => void
      getHotkey: () => Promise<string>
      setHotkey: (accel: string) => Promise<string>
    }
```

- [ ] **Step 3: Add optional `screenshot` to the shared API type**

In `packages/shared-ui/src/api.ts`, add to the `BanjuanAPI` interface (top level, so the shared `TitleBar` can feature-detect it):
```ts
  /** Desktop only: Feishu-style screen capture. Absent on mobile. */
  screenshot?: {
    trigger: () => Promise<void>
  }
```

- [ ] **Step 4: Expose `screenshot` on the renderer's electron API adapter**

`TitleBar` reads `useBanjuanAPI().screenshot`, and the desktop provides that context value from `packages/app/src/renderer/electron-api.ts` (which wraps `window.electron`). Add a `screenshot` group to the exported object there (alongside the other groups):
```ts
  screenshot: {
    trigger: () => window.electron.screenshot.trigger(),
  },
```

- [ ] **Step 5: Typecheck both packages**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit && pnpm --filter @banjuan/shared-ui exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/preload/index.ts packages/app/electron.d.ts packages/app/src/renderer/electron-api.ts packages/shared-ui/src/api.ts
git commit -m "feat(screenshot): preload API + types + renderer adapter"
```

---

## Task 7: Overlay renderer UI

**Files:**
- Modify: `packages/app/src/renderer/App.tsx`
- Create: `packages/app/src/renderer/views/ScreenshotOverlay.tsx`

- [ ] **Step 1: Branch on the overlay hash in `App.tsx`**

In `packages/app/src/renderer/App.tsx`, add near `IS_EXPORT_WORKER` (line ~16):
```ts
const IS_SCREENSHOT_OVERLAY = window.location.hash === '#screenshot-overlay'
```
Add the import at the top:
```ts
import ScreenshotOverlay from './views/ScreenshotOverlay.js'
```
In the `App()` function, before `return <MainApp />`:
```ts
  if (IS_SCREENSHOT_OVERLAY) return <ScreenshotOverlay />
```

- [ ] **Step 2: Implement the overlay component**

Create `packages/app/src/renderer/views/ScreenshotOverlay.tsx`:
```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { normalizeRect, toDevicePx, type Point, type Rect } from '../screenshot/geometry.js'
import { renderOps, popOp, STROKE, type AnnotationOp } from '../screenshot/ops.js'

type Tool = 'rect' | 'arrow' | 'pen' | 'text'
interface Init { image: string; width: number; height: number; scaleFactor: number }

// The preload bridge is exposed as `window.electronAPI` (see electron-api.ts).
const el = (window as any).electronAPI as {
  screenshot: {
    onInit: (cb: (p: Init) => void) => () => void
    confirm: (dataUrl: string) => void
    cancel: () => void
  }
}

export default function ScreenshotOverlay() {
  const [init, setInit] = useState<Init | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [sel, setSel] = useState<Rect | null>(null)         // selected region, CSS px
  const [selecting, setSelecting] = useState(false)
  const dragStart = useRef<Point | null>(null)
  const [tool, setTool] = useState<Tool>('rect')
  const [ops, setOps] = useState<AnnotationOp[]>([])
  const drawing = useRef<AnnotationOp | null>(null)
  const drawAnchor = useRef<Point | null>(null)              // fixed origin for rect drag
  const [, force] = useState(0)                              // repaint tick during a drag
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [textDraft, setTextDraft] = useState<{ at: Point; value: string } | null>(null)

  // Receive the captured image from main.
  useEffect(() => el.screenshot.onInit(setInit), [])

  // Esc cancels; Enter confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); el.screenshot.cancel() }
      else if (e.key === 'Enter' && sel && !textDraft) { e.preventDefault(); confirm() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // Repaint the annotation canvas whenever ops/selection/live-draw change.
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !sel) return
    c.width = sel.w; c.height = sel.h
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.save(); ctx.translate(-sel.x, -sel.y)             // ops are in overlay coords
    renderOps(ctx, drawing.current ? [...ops, drawing.current] : ops)
    ctx.restore()
  })

  const pt = (e: React.PointerEvent): Point => ({ x: e.clientX, y: e.clientY })

  // --- region selection (before a region exists) ---
  const onDownSelect = (e: React.PointerEvent) => {
    if (sel) return
    dragStart.current = pt(e); setSelecting(true)
  }
  const onMoveSelect = (e: React.PointerEvent) => {
    if (!selecting || !dragStart.current) return
    setSel(normalizeRect(dragStart.current, pt(e)))
  }
  const onUpSelect = () => { setSelecting(false); dragStart.current = null }

  // --- annotation (after a region exists) ---
  const onDownDraw = (e: React.PointerEvent) => {
    if (!sel) return
    e.stopPropagation()
    const p = pt(e)
    if (tool === 'text') { setTextDraft({ at: p, value: '' }); return }
    drawAnchor.current = p
    if (tool === 'rect') drawing.current = { kind: 'rect', rect: { x: p.x, y: p.y, w: 0, h: 0 } }
    else if (tool === 'arrow') drawing.current = { kind: 'arrow', tail: p, head: p }
    else drawing.current = { kind: 'pen', points: [p] }
    force(n => n + 1)
  }
  const onMoveDraw = (e: React.PointerEvent) => {
    const d = drawing.current
    if (!d) return
    const p = pt(e)
    if (d.kind === 'rect') d.rect = normalizeRect(drawAnchor.current!, p)
    else if (d.kind === 'arrow') d.head = p
    else if (d.kind === 'pen') d.points.push(p)
    force(n => n + 1)
  }
  const onUpDraw = () => {
    if (drawing.current) { setOps(o => [...o, drawing.current!]); drawing.current = null }
  }

  const commitText = () => {
    if (textDraft && textDraft.value.trim()) {
      setOps(o => [...o, { kind: 'text', at: textDraft.at, text: textDraft.value, fontPx: 18 }])
    }
    setTextDraft(null)
  }

  const confirm = useCallback(() => {
    if (!init || !sel || sel.w < 2 || sel.h < 2) { el.screenshot.cancel(); return }
    const img = imgRef.current!
    // Derive the true device-px-per-CSS-px from the ACTUAL captured image size,
    // not init.scaleFactor. desktopCapturer uses one thumbnail size for all
    // displays, so a non-primary display's image may not equal bounds×scaleFactor;
    // naturalWidth/init.width is always exact.
    const scale = img.naturalWidth / init.width
    const dev = toDevicePx(sel, scale)
    const out = document.createElement('canvas')
    out.width = Math.round(dev.w); out.height = Math.round(dev.h)
    const ctx = out.getContext('2d')!
    // draw the captured image, cropped to the selection (device px)
    ctx.drawImage(img, dev.x, dev.y, dev.w, dev.h, 0, 0, dev.w, dev.h)
    // draw annotations, translated into the crop's space, scaled to device px
    ctx.save(); ctx.translate(-sel.x * scale, -sel.y * scale)
    renderOps(ctx, ops, scale)
    ctx.restore()
    el.screenshot.confirm(out.toDataURL('image/png'))
  }, [init, sel, ops])

  if (!init) return null

  const stage = sel && !selecting                            // region locked → annotate mode
  const toolBtn = (t: Tool, label: string) => (
    <button onClick={() => setTool(t)} style={{
      padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
      border: '1px solid #0003', background: tool === t ? STROKE : '#fff', color: tool === t ? '#fff' : '#222',
    }}>{label}</button>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, cursor: sel ? 'default' : 'crosshair', userSelect: 'none' }}
      onPointerDown={onDownSelect} onPointerMove={onMoveSelect} onPointerUp={onUpSelect}
    >
      {/* captured screen */}
      <img ref={imgRef} src={init.image} draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {/* dim layer with a transparent hole over the selection */}
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
        clipPath: sel ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${sel.y}px, ${sel.x}px ${sel.y}px, ${sel.x}px ${sel.y + sel.h}px, ${sel.x + sel.w}px ${sel.y + sel.h}px, ${sel.x + sel.w}px ${sel.y}px, 0 ${sel.y}px)` : undefined,
        pointerEvents: 'none',
      }} />
      {sel && (
        <>
          <div style={{ position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h, border: `1px solid ${STROKE}`, pointerEvents: 'none' }} />
          {/* annotation canvas sits exactly over the selection and captures draw events */}
          <canvas ref={canvasRef}
            style={{ position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h, cursor: 'crosshair' }}
            onPointerDown={onDownDraw} onPointerMove={onMoveDraw} onPointerUp={onUpDraw}
          />
          {textDraft && (
            <input autoFocus value={textDraft.value}
              onChange={e => setTextDraft({ ...textDraft, value: e.target.value })}
              onBlur={commitText} onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setTextDraft(null) }}
              style={{ position: 'absolute', left: textDraft.at.x, top: textDraft.at.y, font: '18px sans-serif', color: STROKE, background: 'transparent', border: `1px dashed ${STROKE}`, outline: 'none' }} />
          )}
          {/* toolbar below the selection (or above if near the bottom) */}
          {stage && (
            <div style={{
              position: 'absolute', left: sel.x, top: Math.min(sel.y + sel.h + 8, window.innerHeight - 44),
              display: 'flex', gap: 6, padding: 6, borderRadius: 8, background: '#fff', boxShadow: '0 2px 12px #0004',
            }}>
              {toolBtn('rect', '▭')}{toolBtn('arrow', '↗')}{toolBtn('pen', '✎')}{toolBtn('text', 'T')}
              <button onClick={() => setOps(popOp)} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid #0003', background: '#fff' }}>↶</button>
              <button onClick={() => el.screenshot.cancel()} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid #0003', background: '#fff' }}>✕</button>
              <button onClick={confirm} style={{ padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: 'none', background: STROKE, color: '#fff' }}>✓</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/app exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/App.tsx packages/app/src/renderer/views/ScreenshotOverlay.tsx
git commit -m "feat(screenshot): overlay UI — select, annotate, compose, confirm"
```

---

## Task 8: In-app button + i18n

**Files:**
- Modify: `packages/shared-ui/src/components/TitleBar.tsx`
- Modify: `packages/shared-ui/src/i18n/{en,zh,ja,ko,de,es,fr}.ts`

- [ ] **Step 1: Add i18n strings (all 7 languages)**

Add these two keys after `'app.slogan'` in each file (values below per language):

`en.ts`:
```ts
  'screenshot.button': 'Screenshot',
  'screenshot.permissionNeeded': 'Enable Screen Recording for banjuan in System Settings, then try again.',
```
`zh.ts`:
```ts
  'screenshot.button': '截图',
  'screenshot.permissionNeeded': '请在系统设置里给 banjuan 开启“屏幕录制”权限,再试一次。',
```
`ja.ts`:
```ts
  'screenshot.button': 'スクリーンショット',
  'screenshot.permissionNeeded': 'システム設定で banjuan の画面収録を許可してから、もう一度お試しください。',
```
`ko.ts`:
```ts
  'screenshot.button': '스크린샷',
  'screenshot.permissionNeeded': '시스템 설정에서 banjuan의 화면 기록을 허용한 후 다시 시도하세요.',
```
`de.ts`:
```ts
  'screenshot.button': 'Screenshot',
  'screenshot.permissionNeeded': 'Aktiviere die Bildschirmaufnahme für banjuan in den Systemeinstellungen und versuche es erneut.',
```
`es.ts`:
```ts
  'screenshot.button': 'Captura',
  'screenshot.permissionNeeded': 'Activa la grabación de pantalla para banjuan en Ajustes del sistema e inténtalo de nuevo.',
```
`fr.ts`:
```ts
  'screenshot.button': 'Capture',
  'screenshot.permissionNeeded': "Activez l'enregistrement de l'écran pour banjuan dans les Réglages système, puis réessayez.",
```

- [ ] **Step 2: Add the button to `TitleBar.tsx`**

In `packages/shared-ui/src/components/TitleBar.tsx`:
- Add `Camera` to the lucide import:
```ts
import { X, Library, FileText, StickyNote, Tag, Puzzle, PanelRight, Camera } from 'lucide-react'
```
- Add near the top of the component body (after other hooks):
```ts
  const api = useBanjuanAPI()
  const t = useT()
```
  (Import them if not already: `import { useBanjuanAPI } from '../api.js'` and `import { useT } from '../i18n/index.js'` — check existing imports first and only add what's missing.)
- Render the button just before the rail toggle button (the `PanelRight` button around line 210). Only shows on desktop, where `api.screenshot` exists:
```tsx
        {api.screenshot && (
          <button
            onClick={() => api.screenshot!.trigger()}
            title={t('screenshot.button')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center',
              ['WebkitAppRegion' as any]: 'no-drag',
            }}
          >
            <Camera size={16} />
          </button>
        )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @banjuan/shared-ui exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-ui/src/components/TitleBar.tsx packages/shared-ui/src/i18n
git commit -m "feat(screenshot): in-app title-bar button + i18n"
```

---

## Task 9: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the unit tests**

Run: `pnpm --filter @banjuan/app exec vitest run src/renderer/screenshot`
Expected: geometry (4) + ops (2) tests PASS.

- [ ] **Step 2: Build + launch the desktop app in dev**

Run the desktop dev command (e.g. `pnpm --filter @banjuan/app dev`). Then verify:

- [ ] **Step 3: Verify capture paths**
  - Press the hotkey (`⌘⇧A` on mac): overlay appears with a dimmed screenshot.
  - Click the title-bar Camera button: same overlay appears.
  - (macOS first run) If Screen Recording isn't granted, the permission dialog appears and the "Open System Settings" button deep-links to the pane.

- [ ] **Step 4: Verify select + annotate**
  - Drag to select a region → toolbar appears.
  - Each tool draws: rectangle, arrow (with head), pen (freehand), text (click, type, Enter).
  - Undo (↶) removes the last drawn item.

- [ ] **Step 5: Verify confirm/cancel**
  - ✓ (or Enter): overlay closes; paste into any app → the annotated region appears, crisp on Retina (full device-pixel resolution).
  - ✕ (or Esc): overlay closes; clipboard unchanged.

- [ ] **Step 6: Verify multi-monitor (if available)**
  - Trigger with two displays; selecting on the secondary display composes and copies correctly.

- [ ] **Step 7: Final commit (docs)**

If any small fixes were needed during verification, commit them. Otherwise:
```bash
git commit --allow-empty -m "test(screenshot): manual verification pass"
```

---

## Deferred (not in this plan)

- **Settings UI field to change the hotkey.** The default hotkey works out of the
  box, and the plumbing to change it is already in place (preload
  `screenshot.getHotkey`/`setHotkey` → `settings:*` IPC → `settings-store`). A
  later task can add a text field in the settings view that calls these. Left out
  now per YAGNI; the spec explicitly allowed deferring the UI field.
- Insert-into-note, save-to-file, pin-to-screen, mosaic, highlighter, step
  numbers, ellipse, color picker, OCR (see spec "out of scope").
