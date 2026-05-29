import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { libraries } from './ipc.js'

interface BatchExportJob {
  runId: string
  format: 'markdown' | 'pdf' | 'png' | 'svg' | 'json'
  outputDir: string
  folder?: string | null
  noteIds?: string[]
  pageIndex?: number
}

/**
 * Manages a single hidden background window that runs batch exports in its own
 * renderer process. Heavy mindmap rendering and html-to-image rasterization run
 * there, so the visible window stays responsive (Chrome-style background work).
 */
let exportWin: BrowserWindow | null = null
let workerReady = false
/** Jobs received before the worker finished loading (cold start). */
let pendingJobs: BatchExportJob[] = []
/** webContents id of the visible window that requested the active run. */
let originId: number | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null

const IDLE_CLOSE_MS = 2 * 60 * 1000

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
}

function scheduleIdleClose() {
  clearIdleTimer()
  idleTimer = setTimeout(() => {
    if (exportWin && !exportWin.isDestroyed()) exportWin.close()
  }, IDLE_CLOSE_MS)
}

function getOrCreateExportWindow(): BrowserWindow {
  if (exportWin && !exportWin.isDestroyed()) return exportWin

  workerReady = false
  const win = new BrowserWindow({
    show: false,
    width: 1600,
    height: 1000,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // A never-shown window has its timers / rAF / React scheduler throttled or
      // suspended by Chromium, which stalls the per-item export loop. We keep it
      // alive by showing it fully transparent and non-focusable (below), but also
      // disable throttling here as a second guard.
      backgroundThrottling: false,
    },
  })

  // Show the window so Chromium treats it as "visible" (timers/rAF run at full
  // speed), but make it invisible and click-through so the user never sees it.
  win.setOpacity(0)
  win.setIgnoreMouseEvents(true)
  win.showInactive()

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#export-worker`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'export-worker' })
  }

  win.on('closed', () => {
    exportWin = null
    workerReady = false
    pendingJobs = []
    clearIdleTimer()
  })

  // If the background renderer crashes mid-run, unblock the visible window's
  // progress panel instead of leaving it spinning forever.
  win.webContents.on('render-process-gone', () => {
    sendToOrigin('batch-export:done')
    if (!win.isDestroyed()) win.close()
  })

  exportWin = win
  return win
}

function sendToOrigin(channel: string, ...args: unknown[]) {
  if (originId == null) return
  const wc = BrowserWindow.getAllWindows()
    .map(w => w.webContents)
    .find(c => c.id === originId)
  if (wc && !wc.isDestroyed()) wc.send(channel, ...args)
}

export function registerExportWindowHandlers() {
  ipcMain.handle('batch-export:run', (event, job: BatchExportJob) => {
    // Reuse the visible window's already-open library instance for the worker
    // (same DB connection) — never re-open, which would reindex and risk locks.
    const lib = libraries.get(event.sender.id)
    if (!lib) throw new Error('No library open')

    originId = event.sender.id
    clearIdleTimer()

    const win = getOrCreateExportWindow()
    libraries.set(win.webContents.id, lib)

    if (workerReady) {
      win.webContents.send('batch-export:job', job)
    } else {
      pendingJobs.push(job) // flushed on 'batch-export:worker-ready'
    }
  })

  ipcMain.on('batch-export:worker-ready', (event) => {
    if (!exportWin || event.sender.id !== exportWin.webContents.id) return
    workerReady = true
    for (const job of pendingJobs) exportWin.webContents.send('batch-export:job', job)
    pendingJobs = []
  })

  ipcMain.on('batch-export:progress', (event, msg) => {
    if (!exportWin || event.sender.id !== exportWin.webContents.id) return
    sendToOrigin('batch-export:progress', msg)
  })

  ipcMain.on('batch-export:done', (event) => {
    if (!exportWin || event.sender.id !== exportWin.webContents.id) return
    sendToOrigin('batch-export:done')
    scheduleIdleClose()
  })
}
