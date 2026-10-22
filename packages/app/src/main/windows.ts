import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

const windows = new Set<BrowserWindow>()

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
  return [...windows].find(w => !w.isDestroyed()) ?? null
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

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isNoteLink(url)) {
      const noteId = extractNoteId(url)
      if (noteId) win.webContents.send('navigate-note-link', noteId)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isNoteLink(url)) {
      event.preventDefault()
      const noteId = extractNoteId(url)
      if (noteId) win.webContents.send('navigate-note-link', noteId)
    }
  })

  windows.add(win)
  win.on('focus', () => { lastFocused = win })
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
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
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
