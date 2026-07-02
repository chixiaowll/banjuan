# Desktop Screenshot (Feishu-style) — Design

**Date:** 2026-07-02
**Scope:** Desktop (Electron) only. Not iOS/iPad (sandbox forbids full-screen capture); not sync.

## Goal

A Feishu-style screenshot tool: trigger a capture, dim the whole screen, drag to
select a region, annotate it, and copy the result to the clipboard.

## Decisions (locked)

| Question | Decision |
|---|---|
| Capture scope | **Whole screen** (system-wide), desktop only |
| Output | **Clipboard only** (`clipboard.writeImage`) |
| Annotation tools | **Rectangle, Arrow, Pen (freehand), Text** + Undo |
| Trigger | **Global hotkey + in-app button** |
| Default hotkey | `⌘⇧A` (macOS) / `Ctrl+Shift+A` (Windows/Linux), configurable |
| Capture method | `desktopCapturer` + transparent overlay window (Approach A) |

### Explicitly out of scope (YAGNI)

Insert-into-note, save-to-file, pin-to-screen, mosaic/blur, highlighter, step
numbers, ellipse, OCR. May be added later; not in this iteration.

## Architecture

Three units, each independently understandable:

### 1. Main process — `packages/app/src/main/screenshot-service.ts`

Owns OS-level concerns: hotkey, screen capture, overlay windows, clipboard.

- **Hotkey:** register the configured accelerator with `globalShortcut` on app
  `ready`; re-register when the setting changes; unregister on `will-quit`.
- **`triggerCapture()`** (called by hotkey and by the in-app IPC):
  1. macOS: if `systemPreferences.getMediaAccessStatus('screen') !== 'granted'`,
     show a dialog explaining the Screen Recording permission and open the
     System Settings pane (`openSystemPreferences`-style deep link); abort.
  2. For each `screen.getAllDisplays()`, capture via
     `desktopCapturer.getSources({ types: ['screen'], thumbnailSize })` at the
     display's **device-pixel** size (`bounds × scaleFactor`).
  3. For each display, create a frameless, transparent, `alwaysOnTop`,
     `fullscreen`/`setBounds(display.bounds)` overlay `BrowserWindow` loading the
     renderer at hash route `#screenshot-overlay` (mirrors `export-window.ts`).
     Pass the captured image (data URL) + `{ bounds, scaleFactor }` to it.
- **IPC handlers:**
  - `screenshot:trigger` → `triggerCapture()` (from the in-app button).
  - `screenshot:confirm` (payload: PNG data URL) →
    `clipboard.writeImage(nativeImage.createFromDataURL(...))` → close all
    overlays.
  - `screenshot:cancel` → close all overlays.
- **Guard:** only one capture session at a time (ignore re-trigger while overlays
  are open).

### 2. Overlay renderer — `packages/app/src/renderer/views/ScreenshotOverlay.tsx`

Pure in-page UI, no OS access. Selected by the `#screenshot-overlay` hash in the
renderer entry (`index.tsx`/`App.tsx` branch), same pattern as `#export-worker`.

- Full-viewport captured image, dimmed with a translucent black layer.
- **Region select:** drag a rubber-band rectangle; the selection punches a
  clear "hole" in the dim layer; edges show size readout.
- **Toolbar** (floats near the selection): Rectangle · Arrow · Pen · Text ·
  Undo · ✓ Confirm · ✕ Cancel.
- **Annotation canvas** over the selected region:
  - Rectangle: drag outline.
  - Arrow: drag from tail to head (arrowhead geometry is a pure util).
  - Pen: freehand polyline.
  - Text: click to place a caret, type; commit on blur/Esc.
  - v1 uses a single fixed stroke (red, ~3px CSS). A color picker is deferred.
  - **Undo:** pop the last committed op from an ops stack and re-render.
- **Keys:** `Esc` cancels (→ `screenshot:cancel`); `Enter` or ✓ confirms.
- **Confirm:** render the selected region of the source image + the annotation
  ops into an offscreen canvas at device-pixel resolution → `toDataURL('image/png')`
  → `screenshot:confirm`.
- **Retina:** map CSS px ↔ image px via `scaleFactor` so the copied image is
  full-resolution and crisp.

### 3. Preload + in-app button

- **Preload** (`packages/app/src/preload/index.ts`): expose a `screenshot` API —
  `trigger()`, `onInit(cb)` (receives image + display info), `confirm(dataUrl)`,
  `cancel()`.
- **Button:** a camera/scissors icon in `TitleBar.tsx` (desktop only; hidden on
  mobile via the existing platform split) → `window.electron.screenshot.trigger()`.
- **Setting:** hotkey string persisted in the existing settings store; a field in
  the settings UI to change it. Default per-platform as above. (Thin; the capture
  works with the default even if the UI field is deferred.)

## Data flow

```
hotkey / button
      │
      ▼
main.triggerCapture ── desktopCapturer ──▶ per-display PNG (device px)
      │
      ▼  open overlay window(s), send image + {bounds, scaleFactor}
ScreenshotOverlay (renderer)
      │  drag-select → annotate (rect/arrow/pen/text, undo)
      ▼  Enter/✓
  compose region+annotations → PNG data URL ── IPC screenshot:confirm ──▶ main
      │
      ▼
main: clipboard.writeImage(nativeImage) ; close overlays
```

Cancel path: `Esc`/✕ → `screenshot:cancel` → main closes overlays, nothing copied.

## Multi-monitor

One overlay per display, each showing its own capture. The user drags on
whichever display; that overlay performs the compose+confirm. Confirm/cancel from
any overlay closes all overlays.

## Error handling

- **No Screen Recording permission (macOS):** detected before capture; dialog +
  deep link to System Settings; capture aborts cleanly.
- **Capture failure / empty source:** if `desktopCapturer` returns no usable
  source, show a native error dialog and abort (no overlay).
- **Re-trigger while active:** ignored (single session guard).
- **Empty selection (zero-size):** confirm is a no-op; Esc-like behavior.

## Testing

- **Unit (pure utils):** arrow-head geometry; undo-stack push/pop; CSS↔device-px
  coordinate mapping; region-crop rect math. These are extracted as pure
  functions and unit-tested.
- **Manual checklist** (capture pipeline can't be unit-tested headlessly):
  1. Hotkey triggers overlay; button triggers overlay.
  2. Drag-select + each of the 4 tools draws correctly; undo removes last.
  3. Confirm copies to clipboard; paste elsewhere shows the annotated region at
     full resolution (Retina crisp).
  4. Esc/✕ cancels, nothing copied.
  5. macOS without permission → guidance dialog.
  6. Multi-monitor: select on a secondary display works.

## Files touched

- New: `packages/app/src/main/screenshot-service.ts`
- New: `packages/app/src/renderer/views/ScreenshotOverlay.tsx`
- New: `packages/app/src/renderer/screenshot/*` pure utils (geometry, ops)
- Edit: `packages/app/src/main/index.ts` (wire service on ready/quit)
- Edit: `packages/app/src/main/ipc.ts` (or service self-registers IPC)
- Edit: `packages/app/src/preload/index.ts` (+ `electron.d.ts` types)
- Edit: renderer entry (`index.tsx`/`App.tsx`) — `#screenshot-overlay` branch
- Edit: `packages/app/src/renderer/.../TitleBar.tsx` (button)
- Edit: settings store + settings UI (hotkey field)
- i18n: button tooltip / dialog strings across all 7 languages (per project rule)

## Non-goals / isolation

No changes to `@banjuan/core`, mobile, or sync. Entirely additive on the desktop
app. If the hotkey or capture fails, the rest of the app is unaffected.
