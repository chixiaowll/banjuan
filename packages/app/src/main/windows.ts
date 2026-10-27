import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'

const windows = new Set<BrowserWindow>()
/** Single-file windows (a file opened on its own): never the "library window" for screenshots or notices. */
const fileWindows = new WeakSet<BrowserWindow>()

// Unsaved edits wait behind timers in the renderer (debounced note saves,
// handwriting stroke batching). Before a library window closes or the app
// quits, ask the renderer to write them and wait — up to a few seconds, so a
// hung renderer can't block closing forever.
const FLUSH_TIMEOUT_MS = 3000
let nextFlushId = 1
let quitFlushed = false
let lastFocused: BrowserWindow | null = null

/** The library window the user used last — target for "insert into note" and screenshot notices. */
export function getLastFocusedLibraryWindow(): BrowserWindow | null {
  if (lastFocused && !lastFocused.isDestroyed()) return lastFocused
  return [...windows].find(w => !w.isDestroyed() && !fileWindows.has(w)) ?? null
}

function flushWindow(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve()
  const id = nextFlushId++
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); ipcMain.removeListener('app:flush-done', onDone); resolve() }
    const onDone = (_e: unknown, doneId: number) => { if (doneId === id) finish() }
    const timer = setTimeout(() => { console.warn('[flush] renderer did not confirm in time; closing anyway'); finish() }, FLUSH_TIMEOUT_MS)
    ipcMain.on('app:flush-done', onDone)
    win.webContents.send('app:flush', id)
  })
}

/** Flush every library window before quitting; afterwards windows close without asking again. */
export function flushAllWindowsForQuit(): Promise<void> {
  quitFlushed = true
  return Promise.all([...windows].map(flushWindow)).then(() => {})
}

/**
 * A library window, or (`kind: 'file'`) a single-file window. `hash` is handed
 * to the page (it picks what to show from it). Both kinds write pending edits
 * before closing and before the app quits.
 */
export function createWindow(opts: { hash?: string; kind?: 'library' | 'file' } = {}): BrowserWindow {
  const isFile = opts.kind === 'file'
  const win = new BrowserWindow({
    width: isFile ? 1000 : 1200,
    height: isFile ? 760 : 800,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isNoteLink = (url: string) => url.includes('#note/') || url.startsWith('note://')

  const extractNoteId = (url: string): string | null => {
    const idx = url.indexOf('#note/')
    if (idx !== -1) return url.substring(idx + '#note/'.length)
    if (url.startsWith('note://')) return url.replace('note://', '')
    return null
  }

  // The window only ever shows the app. A link (in a note, an EPUB, an HTML
  // document) never opens inside it or in a new app window — which would get
  // this preload and with it the whole library API — but in the browser.
  const openOutside = (url: string) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    else console.warn('[window] blocked navigation to', url)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isNoteLink(url)) {
      const noteId = extractNoteId(url)
      if (noteId) win.webContents.send('navigate-note-link', noteId)
    } else {
      openOutside(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isNoteLink(url)) {
      event.preventDefault()
      const noteId = extractNoteId(url)
      if (noteId) win.webContents.send('navigate-note-link', noteId)
      return
    }
    // Reloading the app itself (settings do) is fine; anything else — a link, a
    // file dropped outside a drop zone — must not replace it.
    if (url.split('#')[0] === win.webContents.getURL().split('#')[0]) return
    event.preventDefault()
    openOutside(url)
  })

  windows.add(win)
  if (isFile) fileWindows.add(win)
  else win.on('focus', () => { lastFocused = win })
  win.on('closed', () => {
    windows.delete(win)
    if (lastFocused === win) lastFocused = null
    // The pre-warmed screenshot overlay is a hidden window that never closes,
    // so 'window-all-closed' no longer fires on Windows/Linux: quit here.
    if (process.platform !== 'darwin' && windows.size === 0) app.quit()
  })
  let flushed = false
  win.on('close', (e) => {
    if (flushed || quitFlushed) return
    e.preventDefault()
    flushed = true
    void flushWindow(win).finally(() => { if (!win.isDestroyed()) win.close() })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL + (opts.hash ? `#${opts.hash}` : ''))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), opts.hash ? { hash: opts.hash } : undefined)
  }

  return win
}

/** True for library windows (not the screenshot overlay or hidden export window). */
export function isLibraryWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
  return !!win && windows.has(win)
}

export function getWindowCount(): number {
  return windows.size
}
