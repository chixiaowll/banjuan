import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, systemPreferences } from 'electron'
import { join } from 'node:path'
import { localeFromLanguage } from '@banjuan/shared-ui/src/i18n/locale'
import { trayMenuItems, isLocale, type TrayActions } from './menu-bar-menu.js'
import { getShowInDock, setShowInDock, getLocale, setLocale, getScreenshotHotkey } from './settings-store.js'

/**
 * macOS: the app's icon in the menu bar, always there, and whether the app also
 * shows in the Dock (settings; off = menu bar only, also out of ⌘Tab).
 */

let tray: Tray | null = null   // kept: a collected Tray disappears from the menu bar

// macOS puts a new menu bar item leftmost, and on a full menu bar (notched
// screens) that spot is under the notch: the item is never shown. The first
// time, start it beside Control Center's items (Battery 340, Wi-Fi 304, …;
// higher is further left); a ⌘-drag moves it and macOS keeps that instead.
const POSITION_KEY = 'NSStatusItem Preferred Position Item-0'
const FIRST_POSITION = 345

function applyDock(show: boolean): void {
  if (!app.dock) return
  console.log(`[menu-bar] dock ${show ? 'shown' : 'hidden'}`)
  if (show) void app.dock.show()
  else app.dock.hide()
}

function changeShowInDock(show: boolean): void {
  setShowInDock(show)
  applyDock(show)
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('menuBar:showInDockChanged', show)
  }
}

function currentLocale() {
  const saved = getLocale()
  return isLocale(saved) ? saved : localeFromLanguage(app.getPreferredSystemLanguages()[0] ?? app.getLocale())
}

export function initMenuBar(actions: Omit<TrayActions, 'setShowInDock'>): void {
  if (process.platform !== 'darwin') return
  ipcMain.handle('menuBar:getShowInDock', () => getShowInDock())
  ipcMain.handle('menuBar:setShowInDock', (_e, show: unknown) => { changeShowInDock(show !== false); return getShowInDock() })
  ipcMain.on('menuBar:setLocale', (_e, locale: unknown) => { if (isLocale(locale)) setLocale(locale) })

  if (!getShowInDock()) applyDock(false)

  if (!(systemPreferences.getUserDefault(POSITION_KEY, 'float') > 0)) {
    systemPreferences.setUserDefault(POSITION_KEY, 'float', FIRST_POSITION)
  }
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip(app.getName())
  // Where it landed: a full menu bar (notched screens) hides the items that don't fit.
  setTimeout(() => console.log('[menu-bar] tray icon', icon.isEmpty() ? 'EMPTY' : JSON.stringify(icon.getSize()), 'at', JSON.stringify(tray?.getBounds())), 2000)
  const popUp = () => {
    const state = { locale: currentLocale(), showInDock: getShowInDock(), hotkey: getScreenshotHotkey() }
    tray?.popUpContextMenu(Menu.buildFromTemplate(trayMenuItems(state, { ...actions, setShowInDock: changeShowInDock })))
  }
  tray.on('click', popUp)
  tray.on('right-click', popUp)
}
