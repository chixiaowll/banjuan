import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { screenshotFileName, zoomBounds, type Rect } from './pure.js'

export function copyPng(png: Buffer): void {
  clipboard.writeImage(nativeImage.createFromBuffer(png))
}

/** Save dialog (default: Pictures/"截图 YYYY-MM-DD HHmmss.png"); null when cancelled. */
export async function savePng(png: Buffer, fileNamePrefix: string): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: join(app.getPath('pictures'), screenshotFileName(fileNamePrefix)),
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (canceled || !filePath) return null
  await writeFile(filePath, png)
  return filePath
}

interface PinInfo { png: Buffer; natural: { w: number; h: number } }
const pins = new Map<BrowserWindow, PinInfo>()

/** A small always-on-top window showing the screenshot where it was taken (global CSS px rect). */
export function openPin(png: Buffer, at: Rect): void {
  const natural = { w: Math.max(1, Math.round(at.w)), h: Math.max(1, Math.round(at.h)) }
  const pin = new BrowserWindow({
    x: Math.round(at.x), y: Math.round(at.y), width: natural.w, height: natural.h,
    frame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: true, alwaysOnTop: true, show: false, enableLargerThanScreen: true,
    backgroundColor: '#ffffff',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
  })
  pin.setAlwaysOnTop(true, 'floating')
  pins.set(pin, { png, natural })
  pin.on('closed', () => pins.delete(pin))
  if (process.env.VITE_DEV_SERVER_URL) void pin.loadURL(`${process.env.VITE_DEV_SERVER_URL}screenshot.html#pin`)
  else void pin.loadFile(join(__dirname, '../renderer/screenshot.html'), { hash: 'pin' })
}

function pinOf(sender: Electron.WebContents): [BrowserWindow, PinInfo] | null {
  const w = BrowserWindow.fromWebContents(sender)
  const info = w ? pins.get(w) : undefined
  return w && info ? [w, info] : null
}

export function initPinIpc(): void {
  // The page asks once its listener is registered (sending on did-finish-load can arrive before React mounts).
  ipcMain.on('screenshot:pin-request', (e) => { const p = pinOf(e.sender); if (p) e.sender.send('screenshot:pin-init', { png: p[1].png }) })
  ipcMain.on('screenshot:pin-ready', (e) => { pinOf(e.sender)?.[0].show() })
  ipcMain.on('screenshot:pin-move', (e, dx: number, dy: number) => {
    const p = pinOf(e.sender)
    if (!p) return
    const [x, y] = p[0].getPosition()
    p[0].setPosition(Math.round(x + dx), Math.round(y + dy))
  })
  ipcMain.on('screenshot:pin-zoom', (e, factor: number) => {
    const p = pinOf(e.sender)
    if (!p) return
    const b = p[0].getBounds()
    const n = zoomBounds({ x: b.x, y: b.y, w: b.width, h: b.height }, p[1].natural, factor)
    p[0].setBounds({ x: n.x, y: n.y, width: n.w, height: n.h })
  })
  ipcMain.on('screenshot:pin-close', (e) => { pinOf(e.sender)?.[0].close() })
  // Labels come from the page: main has no i18n.
  ipcMain.on('screenshot:pin-menu', (e, labels: { copy: string; save: string; close: string; fileNamePrefix: string }) => {
    const p = pinOf(e.sender)
    if (!p) return
    const [w, info] = p
    Menu.buildFromTemplate([
      { label: labels.copy, click: () => copyPng(info.png) },
      { label: labels.save, click: () => { void savePng(info.png, labels.fileNamePrefix) } },
      { type: 'separator' },
      { label: labels.close, click: () => w.close() },
    ]).popup({ window: w })
  })
}

export function closeAllPins(): void {
  for (const w of pins.keys()) if (!w.isDestroyed()) w.destroy()
  pins.clear()
}
