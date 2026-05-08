import { BrowserWindow } from 'electron'
import { join } from 'node:path'

const windows = new Set<BrowserWindow>()

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 10 },
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
  win.on('closed', () => windows.delete(win))

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

export function getWindowCount(): number {
  return windows.size
}
