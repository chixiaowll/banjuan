import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc.js'
import { startApiServer, stopApiServer } from './api-server.js'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  startApiServer().catch(console.error)
  createWindow()
})

app.on('window-all-closed', () => {
  stopApiServer()
  app.quit()
})
