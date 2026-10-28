import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, systemPreferences } from 'electron'
import { join } from 'node:path'
import { trayMenuItems, isLocale, type TrayActions } from './menu-bar-menu.js'
import { getShowInDock, setShowInDock, setLocale, getScreenshotHotkey } from './settings-store.js'
import { currentLocale } from './main-locale.js'

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

// One change at a time, to the setting as it is by then: dock.show() finishes
// later, and a hide() made meanwhile (switched off right after on) would be undone.
let dockChanges = Promise.resolve()
function applyDock(): void {
  const dock = app.dock
  if (!dock) return
  dockChanges = dockChanges.then(async () => {
    const show = getShowInDock()
    if (show === dock.isVisible()) return
    if (show) { await dock.show(); console.log('[menu-bar] dock shown'); return }
    // Right after a show() macOS ignores the hide for a few seconds: repeat it until it holds.
    let tries = 0
    while (dock.isVisible() && !getShowInDock() && tries < 10) {
      dock.hide()
      tries++
      await new Promise(r => setTimeout(r, 500))
    }
    console.log(`[menu-bar] dock ${dock.isVisible() ? 'still shown' : 'hidden'} after ${tries} hide(s)`)
  }).catch(e => console.error('[menu-bar] dock change failed:', e))
}

function changeShowInDock(show: boolean): void {
  setShowInDock(show)
  applyDock()
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('menuBar:showInDockChanged', show)
  }
}

export function initMenuBar(actions: Omit<TrayActions, 'setShowInDock'>): void {
  if (process.platform !== 'darwin') return
  ipcMain.handle('menuBar:getShowInDock', () => getShowInDock())
  ipcMain.handle('menuBar:setShowInDock', (_e, show: unknown) => { changeShowInDock(show !== false); return getShowInDock() })
  ipcMain.on('menuBar:setLocale', (_e, locale: unknown) => { if (isLocale(locale)) setLocale(locale) })

  if (!getShowInDock()) applyDock()

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
