import { BrowserWindow, dialog, type Display, type WebContents } from 'electron'
import { join } from 'node:path'
import type { Rect } from './pure.js'

export interface SessionPayload {
  sessionId: number
  bitmap: Buffer
  pixelWidth: number
  pixelHeight: number
  cssWidth: number
  cssHeight: number
  scaleFactor: number
  workArea: Rect
  windows: Rect[]
  canInsertNote: boolean
}

const SHOW_FALLBACK_MS = 3000

let win: BrowserWindow | null = null
/** Resolves when the page reports its listeners are registered (did-finish-load is too early: React mounts later). */
let pageReady: Promise<void> | null = null
let resolvePageReady: (() => void) | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let shownSession = 0
let onGone: () => void = () => {}

/** Called when the overlay renderer crashes or hangs (the session must end). */
export function setOverlayGoneHandler(fn: () => void): void { onGone = fn }

function clearShowTimer(): void {
  if (showTimer) clearTimeout(showTimer)
  showTimer = null
}

function load(w: BrowserWindow): Promise<void> {
  if (process.env.VITE_DEV_SERVER_URL) return w.loadURL(`${process.env.VITE_DEV_SERVER_URL}screenshot.html`)
  return w.loadFile(join(__dirname, '../renderer/screenshot.html'))
}

/**
 * The overlay is created once (pre-warmed) and reused: hidden between
 * screenshots, never destroyed unless its renderer dies. backgroundThrottling
 * must be off — otherwise a hidden window gets no animation frames, the page
 * can't report `ready`, and every screenshot waits for the 3s fallback.
 */
function getOverlay(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  const w = new BrowserWindow({
    show: false,
    // Opaque, not transparent: it's covered by the capture anyway, and
    // transparent always-on-top windows + heavy canvas work crash macOS's GPU.
    frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false, enableLargerThanScreen: true, fullscreenable: false,
    alwaysOnTop: true, backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    },
  })
  // 'floating' stays above normal windows without covering the menu bar or
  // blocking Mission Control / Cmd-Tab — a glitch can never trap the user.
  w.setAlwaysOnTop(true, 'floating')
  w.webContents.on('render-process-gone', (_e, d) => {
    destroyOverlay()
    onGone()
    dialog.showErrorBox('Screenshot overlay crashed', `reason: ${d.reason}, exitCode: ${d.exitCode}`)
  })
  w.on('unresponsive', () => { destroyOverlay(); onGone() })
  w.on('closed', () => { if (win === w) { win = null; pageReady = null } })
  pageReady = new Promise(res => { resolvePageReady = res })
  load(w).catch(err => { console.error('[screenshot] overlay page failed to load', err) })
  win = w
  return w
}

/** The overlay page has registered its session listeners. */
export function markPageReady(sender: WebContents): void {
  if (isOverlaySender(sender)) { resolvePageReady?.(); resolvePageReady = null }
}

export function prewarmOverlay(): void { getOverlay() }

export function destroyOverlay(): void {
  clearShowTimer()
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  pageReady = null
}

/** Place the overlay on `display` and hand it the session; it shows once the page reports `ready`. */
export async function presentSession(display: Display, payload: SessionPayload): Promise<void> {
  const w = getOverlay()
  // Normally long resolved (pre-warmed); bounded so a broken page can't stall the screenshot forever.
  await Promise.race([pageReady, new Promise(res => setTimeout(res, SHOW_FALLBACK_MS))])
  if (w.isDestroyed()) return
  w.setBounds(display.bounds)
  w.webContents.send('screenshot:session', payload)
  clearShowTimer()
  // If `ready` never comes (renderer error), show anyway: the page's error panel and Esc must be reachable.
  showTimer = setTimeout(() => revealOverlay(payload.sessionId), SHOW_FALLBACK_MS)
  shownSession = payload.sessionId
}

/** Show the overlay for `sessionId` (ignored for a stale session). */
export function revealOverlay(sessionId: number): boolean {
  if (!win || win.isDestroyed() || sessionId !== shownSession) return false
  clearShowTimer()
  if (!win.isVisible()) {
    win.show()
    win.focus()
  }
  return true
}

/** End of a screenshot: hide and tell the page to drop its state (the window is kept for the next one). */
export function hideOverlay(): void {
  clearShowTimer()
  shownSession = 0
  if (!win || win.isDestroyed()) return
  win.hide()
  win.webContents.send('screenshot:reset')
}

export function isOverlaySender(sender: WebContents): boolean {
  return !!win && !win.isDestroyed() && win.webContents === sender
}
