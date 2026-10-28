import { app, protocol, net, Menu, BrowserWindow, ipcMain } from 'electron'
import { registerIpcHandlers, installBundledPlugins, libraries } from './ipc.js'
import { registerExportWindowHandlers } from './export-window.js'
import { startApiServer, stopApiServer } from './api-server.js'
import { startDocTextIndexer, stopDocTextIndexer } from './doc-text-indexer.js'
import { installCli } from './install-cli.js'
import { createWindow, getWindowCount, isLibraryWindow, flushAllWindowsForQuit, showAllWindows } from './windows.js'
import { initScreenshot, disposeScreenshot, triggerCapture } from './screenshot/index.js'
import { initMenuBar } from './menu-bar.js'
import { openDeepLink, registerDeepLinkHandlers } from './deep-link.js'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isInside } from './path-guard.js'
import { fileWindows, openFiles, openFileDialog, registerFileWindowHandlers, flushFileViewState } from './file-window-service.js'
import { filesFromArgv } from './file-windows.js'

// Files opened from the Finder (double-click, Open With, dropped on the Dock
// icon) open on their own (single-file windows). macOS sends them as events,
// the first ones before the app is ready: those wait.
const filesBeforeReady: string[] = []
let ready = false
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (ready) openFiles([path])
  else filesBeforeReady.push(path)
})

// banjuan:// links (macOS sends them as events too; deep-link.ts).
const linksBeforeReady: string[] = []
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (ready) void openDeepLink(url)
  else linksBeforeReady.push(url)
})

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
  { scheme: 'banjuan-attachment', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
])

// Keep the hidden background export window's renderer running at full speed so
// its sequential, one-item-at-a-time export loop never stalls and then bursts.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

// Every page the app shows (library, export, screenshot and PDF-rendering
// windows): no pop-up windows and no navigating away from the page it loaded.
// Library windows add their own handling of note and external links (windows.ts).
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    const current = contents.getURL()
    if (current && url.split('#')[0] === current.split('#')[0]) return   // a reload
    event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

app.whenReady().then(() => {
  // Both schemes serve files to pages that may show other people's content
  // (EPUB/HTML documents, synced notes), so only files inside an open library.
  protocol.handle('local-file', (request) => {
    // A web page's relative links resolve to plain local-file:///dir/name?query URLs.
    const filePath = decodeURIComponent(request.url.replace('local-file://', '').replace(/[?#].*$/, ''))
    if (![...libraries.values()].some(lib => isInside(lib.rootPath, filePath)) && !fileWindows.isServable(filePath)) {
      console.warn('[local-file] refused a path outside the open libraries:', filePath)
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })
  protocol.handle('banjuan-attachment', (request) => {
    const relativePath = decodeURIComponent(request.url.replace('banjuan-attachment://', '')).replace(/[?#].*$/, '')
    // The URL doesn't say which library it belongs to: use the open one that has it.
    for (const lib of libraries.values()) {
      const dir = join(lib.rootPath, '.banjuan')
      const fullPath = join(dir, relativePath)
      if (isInside(dir, fullPath) && existsSync(fullPath)) return net.fetch(pathToFileURL(fullPath).href)
    }
    return new Response('Not found', { status: 404 })
  })
  registerIpcHandlers()
  installBundledPlugins() // refresh global plugins (~/.banjuan/plugins) at startup
  registerExportWindowHandlers()
  startApiServer().catch(console.error)
  // Document text for search, extracted in the background (doc-text-indexer.ts).
  startDocTextIndexer(() => libraries.values())
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
        { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: () => { void openFileDialog() } },
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

  // Started to open files (Finder, command line): just those windows, no library window.
  registerFileWindowHandlers()
  const launchFiles = [...filesBeforeReady, ...filesFromArgv(process.argv, app.isPackaged)]
  registerDeepLinkHandlers()
  ready = true
  if (launchFiles.length > 0) openFiles(launchFiles)
  else if (linksBeforeReady.length === 0) createWindow()   // a link brings its own window
  for (const url of linksBeforeReady) void openDeepLink(url)
  initScreenshot()
  initMenuBar({
    open: () => { if (!showAllWindows()) createWindow() },
    screenshot: () => { void triggerCapture() },
    // From the menu bar the app may not be frontmost (Dock hidden): bring it forward for the dialog.
    openFile: () => { app.focus({ steal: true }); void openFileDialog() },
    quit: () => app.quit(),
  })
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
  void flushAllWindowsForQuit().then(flushFileViewState).finally(() => app.quit())
})

// Remove ~/.banjuan/api-port and api-token on every platform's quit, so clients
// don't mistake a stale port for a running app.
app.on('will-quit', () => { disposeScreenshot(); stopApiServer(); stopDocTextIndexer() })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopApiServer()
    app.quit()
  }
})
