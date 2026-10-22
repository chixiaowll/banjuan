import { dialog, ipcMain, screen, type Display } from 'electron'
import { captureDisplay, listWindows, hasScreenPermission, promptScreenPermission, warmUpCapturer, type Capture } from './capture.js'
import { windowsForDisplay, type RawWindow, type Rect } from './pure.js'
import { prewarmOverlay, presentSession, revealOverlay, hideOverlay, destroyOverlay, setOverlayGoneHandler, isOverlaySender, markPageReady, type SessionPayload } from './overlay-window.js'
import { copyPng, savePng, openPin, initPinIpc, closeAllPins } from './outputs.js'
import { initHotkey, disposeHotkey } from './hotkey.js'
import { getLastFocusedLibraryWindow } from '../windows.js'

type Action = 'copy' | 'save' | 'pin' | 'insert'

interface Session {
  id: number
  display: Display
  started: number
  raw: RawWindow[]
  /** True until the user starts selecting — only then may the overlay follow the cursor to another display. */
  idle: boolean
  switching: boolean
  followTimer: ReturnType<typeof setInterval> | null
  /** Captures by display id (the current one, then the others in the background). */
  cache: Map<number, Capture>
}

const FOLLOW_INTERVAL_MS = 50
const PREWARM_DELAY_MS = 3000

let session: Session | null = null
let nextSessionId = 1
/** webContents id → whether its active tab is a text note (can receive "insert into note"). */
const insertTargets = new Map<number, boolean>()

function displayRect(d: Display): Rect {
  return { x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height }
}

function payloadFor(s: Session, display: Display, cap: Capture): SessionPayload {
  const wa = display.workArea
  const target = getLastFocusedLibraryWindow()
  return {
    sessionId: s.id,
    bitmap: cap.bitmap,
    pixelWidth: cap.pixelWidth,
    pixelHeight: cap.pixelHeight,
    cssWidth: display.bounds.width,
    cssHeight: display.bounds.height,
    scaleFactor: cap.pixelWidth / display.bounds.width,
    workArea: { x: wa.x - display.bounds.x, y: wa.y - display.bounds.y, w: wa.width, h: wa.height },
    windows: windowsForDisplay(s.raw, displayRect(display)),
    canInsertNote: !!target && insertTargets.get(target.webContents.id) === true,
  }
}

function endSession(): void {
  if (session?.followTimer) clearInterval(session.followTimer)
  session = null
  hideOverlay()
}

export async function triggerCapture(): Promise<void> {
  if (session) return
  if (!hasScreenPermission()) { promptScreenPermission(); return }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const s: Session = { id: nextSessionId++, display, started: Date.now(), raw: [], idle: true, switching: false, followTimer: null, cache: new Map() }
  session = s
  try {
    const [cap, raw] = await Promise.all([captureDisplay(display), listWindows()])
    if (session !== s) return
    s.raw = raw
    s.cache.set(display.id, cap)
    console.log(`[screenshot] captured ${cap.pixelWidth}x${cap.pixelHeight} + ${raw.length} windows in ${Date.now() - s.started}ms`)
    await presentSession(display, payloadFor(s, display, cap))
  } catch (err) {
    console.error('[screenshot] capture failed', err)
    if (session === s) endSession()
    dialog.showErrorBox('Screenshot failed', String((err as Error)?.message ?? err))
  }
}

/** Before a selection starts, follow the cursor to another display. */
async function followCursor(s: Session): Promise<void> {
  if (session !== s || !s.idle || s.switching) return
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  if (d.id === s.display.id) return
  s.switching = true
  try {
    const cap = s.cache.get(d.id) ?? await captureDisplay(d)
    if (session !== s) return
    s.cache.set(d.id, cap)
    s.display = d
    s.id = nextSessionId++
    hideOverlay()
    await presentSession(d, payloadFor(s, d, cap))
  } catch (err) {
    console.warn('[screenshot] switching display failed', err)
  } finally {
    s.switching = false
  }
}

/** Capture the other displays once the overlay is up, so following the cursor is instant. */
async function precaptureOthers(s: Session): Promise<void> {
  for (const d of screen.getAllDisplays()) {
    if (session !== s) return
    if (s.cache.has(d.id)) continue
    try { s.cache.set(d.id, await captureDisplay(d)) } catch { /* captured on demand instead */ }
  }
}

async function finish(r: { sessionId: number; action: Action; png: Uint8Array; rect: Rect; fileNamePrefix: string }): Promise<void> {
  const s = session
  if (!s || s.id !== r.sessionId) return
  const display = s.display
  endSession()
  const png = Buffer.from(r.png)
  const target = getLastFocusedLibraryWindow()
  const notify = (result: { action: Action; ok: boolean; detail?: string }) => {
    if (target && !target.isDestroyed()) target.webContents.send('screenshot:done', result)
  }
  try {
    if (r.action === 'copy') {
      copyPng(png)
      notify({ action: 'copy', ok: true })
    } else if (r.action === 'save') {
      const path = await savePng(png, r.fileNamePrefix)
      if (path) notify({ action: 'save', ok: true, detail: path })
    } else if (r.action === 'pin') {
      openPin(png, { x: display.bounds.x + r.rect.x, y: display.bounds.y + r.rect.y, w: r.rect.w, h: r.rect.h })
    } else if (r.action === 'insert' && target && !target.isDestroyed()) {
      target.webContents.send('screenshot:insert-into-note', png)
      target.show()
      target.focus()
    }
  } catch (err) {
    console.error('[screenshot] output failed', r.action, err)
    notify({ action: r.action, ok: false, detail: String((err as Error)?.message ?? err) })
  }
}

export function initScreenshot(): void {
  setOverlayGoneHandler(() => {
    if (session?.followTimer) clearInterval(session.followTimer)
    session = null
  })
  initHotkey(() => { void triggerCapture() })
  initPinIpc()
  ipcMain.handle('screenshot:trigger', () => triggerCapture())
  ipcMain.on('screenshot:page-ready', (e) => markPageReady(e.sender))
  ipcMain.on('screenshot:ready', (e, sessionId: number) => {
    const s = session
    if (!s || !isOverlaySender(e.sender) || s.id !== sessionId) return
    if (!revealOverlay(sessionId)) return
    console.log(`[screenshot] shown ${Date.now() - s.started}ms after the trigger`)
    if (!s.followTimer) {
      s.followTimer = setInterval(() => { void followCursor(s) }, FOLLOW_INTERVAL_MS)
      void precaptureOthers(s)
    }
  })
  ipcMain.on('screenshot:idle', (e, idle: boolean) => {
    if (session && isOverlaySender(e.sender)) session.idle = idle
  })
  ipcMain.on('screenshot:cancel', (e) => { if (isOverlaySender(e.sender)) endSession() })
  ipcMain.on('screenshot:finish', (e, r) => { if (isOverlaySender(e.sender)) void finish(r) })
  ipcMain.on('screenshot:insert-target', (e, ok: boolean) => {
    if (!insertTargets.has(e.sender.id)) e.sender.once('destroyed', () => insertTargets.delete(e.sender.id))
    insertTargets.set(e.sender.id, ok)
  })
  // Pre-warm after startup settles: the overlay page and the capturer.
  setTimeout(() => { prewarmOverlay(); void warmUpCapturer() }, PREWARM_DELAY_MS)
}

export function disposeScreenshot(): void {
  disposeHotkey()
  if (session?.followTimer) clearInterval(session.followTimer)
  session = null
  destroyOverlay()
  closeAllPins()
}
