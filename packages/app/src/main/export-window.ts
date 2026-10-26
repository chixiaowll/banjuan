import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { Library } from '@banjuan/core'
import { libraries, assignLibrary, releaseLibrary } from './ipc.js'

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
/**
 * Runs wait their turn: the worker reads through the library assigned to it,
 * and a second run from a window on another library used to switch it under
 * the first one part-way.
 */
const queue: Array<{ job: BatchExportJob; lib: Library; origin: number }> = []
let running = false

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

  const workerId = win.webContents.id
  win.on('closed', () => {
    exportWin = null
    workerReady = false
    pendingJobs = []
    clearIdleTimer()
    // Its hold on the library goes with it (it kept the library open for good).
    void releaseLibrary(workerId)
    // A run cut short by the window going away: tell everyone waiting.
    if (running) sendToOrigin('batch-export:done')
    for (const q of queue.splice(0)) sendTo(q.origin, 'batch-export:done')
    running = false
  })

  // If the background renderer crashes mid-run, unblock the visible window's
  // progress panel instead of leaving it spinning forever.
  win.webContents.on('render-process-gone', () => {
    if (running) sendToOrigin('batch-export:done')
    running = false
    if (!win.isDestroyed()) win.close()
  })

  exportWin = win
  return win
}

function sendTo(id: number | null, channel: string, ...args: unknown[]) {
  if (id == null) return
  const wc = BrowserWindow.getAllWindows()
    .map(w => w.webContents)
    .find(c => c.id === id)
  if (wc && !wc.isDestroyed()) wc.send(channel, ...args)
}

function sendToOrigin(channel: string, ...args: unknown[]) {
  sendTo(originId, channel, ...args)
}

async function runNext(): Promise<void> {
  if (running || queue.length === 0) return
  const next = queue.shift()!
  running = true
  originId = next.origin
  clearIdleTimer()
  const win = getOrCreateExportWindow()
  await assignLibrary(win.webContents.id, next.lib)
  if (workerReady) win.webContents.send('batch-export:job', next.job)
  else pendingJobs.push(next.job) // flushed on 'batch-export:worker-ready'
}

export function registerExportWindowHandlers() {
  ipcMain.handle('batch-export:run', async (event, job: BatchExportJob) => {
    // Reuse the visible window's already-open library instance for the worker
    // (same DB connection) — never re-open, which would reindex and risk locks.
    const lib = libraries.get(event.sender.id)
    if (!lib) throw new Error('No library open')
    queue.push({ job, lib, origin: event.sender.id })
    await runNext()
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
    running = false
    if (queue.length) void runNext()
    else scheduleIdleClose()
  })
}
