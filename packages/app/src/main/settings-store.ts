import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

const SETTINGS_FILE = join(homedir(), '.banjuan', 'settings.json')

/**
 * Default screenshot hotkey (Electron accelerator syntax). Not Command+Shift+A
 * on macOS: that is Feishu/Lark's default screenshot key, and macOS global
 * hotkeys are non-exclusive — both overlays open and Feishu's covers ours.
 */
export const DEFAULT_SCREENSHOT_HOTKEY = 'Control+Shift+A'

interface Settings { screenshotHotkey?: string; showInDock?: boolean; locale?: string }

function read(): Settings {
  try { return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Settings } catch { return {} }
}

function write(s: Settings): void {
  try { mkdirSync(dirname(SETTINGS_FILE), { recursive: true }); writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)) } catch { /* best effort */ }
}

export function getScreenshotHotkey(): string {
  return read().screenshotHotkey || DEFAULT_SCREENSHOT_HOTKEY
}

export function setScreenshotHotkey(accelerator: string): void {
  write({ ...read(), screenshotHotkey: accelerator })
}

/** macOS: show the app in the Dock as well as the menu bar (default on). */
export function getShowInDock(): boolean {
  return read().showInDock !== false
}

export function setShowInDock(show: boolean): void {
  write({ ...read(), showInDock: show })
}

/** The UI language the windows last reported (for the menu bar menu before any window is open). */
export function getLocale(): string | undefined {
  return read().locale
}

export function setLocale(locale: string): void {
  if (read().locale !== locale) write({ ...read(), locale })
}
