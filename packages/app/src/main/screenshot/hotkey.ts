import { globalShortcut, ipcMain } from 'electron'
import { getScreenshotHotkey, setScreenshotHotkey, DEFAULT_SCREENSHOT_HOTKEY } from '../settings-store.js'

let registeredHotkey: string | null = null
let onTrigger: () => void = () => {}

function tryRegister(accel: string): boolean {
  try { return globalShortcut.register(accel, () => onTrigger()) } catch { return false /* invalid accelerator */ }
}

/**
 * Swap the global hotkey to `accel`. If it can't be registered (invalid, or
 * reserved by the system / another app), the previous hotkey stays active.
 * macOS hotkeys are non-exclusive: a clash with an app that registered the
 * same keys (e.g. Feishu ⌘⇧A) still "succeeds" here — both apps fire.
 */
function applyHotkey(accel: string): boolean {
  if (accel === registeredHotkey) return true
  const prev = registeredHotkey
  if (prev) globalShortcut.unregister(prev)
  if (tryRegister(accel)) { registeredHotkey = accel; return true }
  registeredHotkey = prev && tryRegister(prev) ? prev : null
  return false
}

function hotkeyState(): { hotkey: string; registered: boolean } {
  const hotkey = getScreenshotHotkey()
  return { hotkey, registered: registeredHotkey === hotkey }
}

export function initHotkey(trigger: () => void): void {
  onTrigger = trigger
  applyHotkey(getScreenshotHotkey())
  ipcMain.handle('settings:getScreenshotHotkey', () => hotkeyState())
  // An empty accelerator resets to the default.
  ipcMain.handle('settings:setScreenshotHotkey', (_e, accel: string) => {
    const ok = applyHotkey(accel || DEFAULT_SCREENSHOT_HOTKEY)
    if (ok) setScreenshotHotkey(accel)
    return { ok, ...hotkeyState() }
  })
}

export function disposeHotkey(): void {
  globalShortcut.unregisterAll()
  registeredHotkey = null
}
