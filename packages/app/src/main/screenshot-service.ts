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
      // Reset the session flag if the last overlay disappears by any path (OS
      // close, renderer load failure) — otherwise `capturing` latches true and
      // silently disables every future trigger.
      win.on('closed', () => { overlays = overlays.filter(w => w !== win); if (overlays.length === 0) capturing = false })
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
