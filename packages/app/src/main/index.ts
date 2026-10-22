import { app, protocol, net, Menu, BrowserWindow, ipcMain } from 'electron'
import { registerIpcHandlers, getLibraryRootPath, installBundledPlugins } from './ipc.js'
import { registerExportWindowHandlers } from './export-window.js'
import { startApiServer, stopApiServer } from './api-server.js'
import { installCli } from './install-cli.js'
import { createWindow, getWindowCount, isLibraryWindow, flushAllWindowsForQuit } from './windows.js'
import { initScreenshot, disposeScreenshot } from './screenshot/index.js'
import { join } from 'node:path'

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
  { scheme: 'banjuan-attachment', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
])

// Keep the hidden background export window's renderer running at full speed so
// its sequential, one-item-at-a-time export loop never stalls and then bursts.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

app.whenReady().then(() => {
  protocol.handle('local-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-file://', ''))
    return net.fetch(`file://${filePath}`)
  })
  protocol.handle('banjuan-attachment', (request) => {
    const relativePath = request.url.replace('banjuan-attachment://', '')
    const rootPath = getLibraryRootPath()
    if (!rootPath) return new Response('Library not open', { status: 404 })
    const fullPath = join(rootPath, '.banjuan', relativePath)
    return net.fetch(`file://${fullPath}`)
  })
  registerIpcHandlers()
  installBundledPlugins() // refresh global plugins (~/.banjuan/plugins) at startup
  registerExportWindowHandlers()
  startApiServer().catch(console.error)
  installCli().catch(console.error)

  const isMac = process.platform === 'darwin'
  // ⌘W closes the current tab: the renderer decides, and when it has no tab to
  // close (welcome screen, library tab) it sends window:close back. ⇧⌘W always
  // closes the window. Other windows (screenshot overlay) are left alone.
  const closeTab = () => {
    const win = BrowserWindow.getFocusedWindow()
    if (isLibraryWindow(win)) win.webContents.send('menu:close-tab')
  }
  ipcMain.on('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (isLibraryWindow(win)) win.close()
  })
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Another Library', click: () => createWindow() },
        { type: 'separator' as const },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: closeTab },
        isMac ? { role: 'close' as const, accelerator: 'CmdOrCtrl+Shift+W' } : { role: 'quit' as const },
      ],
    },
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  createWindow()
  initScreenshot()
})

app.on('activate', () => {
  if (getWindowCount() === 0) createWindow()
})

// Quit waits until every library window has written its pending edits (a
// debounced save still on a timer would otherwise die with the renderer).
let quitReady = false
app.on('before-quit', (e) => {
  if (quitReady) return
  e.preventDefault()
  quitReady = true
  void flushAllWindowsForQuit().finally(() => app.quit())
})

// Remove ~/.banjuan/api-port and api-token on every platform's quit, so clients
// don't mistake a stale port for a running app.
app.on('will-quit', () => { disposeScreenshot(); stopApiServer() })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopApiServer()
    app.quit()
  }
})
