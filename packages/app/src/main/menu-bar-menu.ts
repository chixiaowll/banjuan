import type { MenuItemConstructorOptions } from 'electron'
import zh from '@banjuan/shared-ui/src/i18n/zh'
import en from '@banjuan/shared-ui/src/i18n/en'
import ja from '@banjuan/shared-ui/src/i18n/ja'
import ko from '@banjuan/shared-ui/src/i18n/ko'
import fr from '@banjuan/shared-ui/src/i18n/fr'
import de from '@banjuan/shared-ui/src/i18n/de'
import es from '@banjuan/shared-ui/src/i18n/es'
import { LOCALES, type Locale } from '@banjuan/shared-ui/src/i18n/locale'

/** The menu bar icon's menu (macOS), made fresh each time it opens. Pure: tested without Electron. */

const MESSAGES = { zh, en, ja, ko, fr, de, es }

export function isLocale(s: unknown): s is Locale {
  return typeof s === 'string' && (LOCALES as string[]).includes(s)
}

export interface TrayState {
  locale: Locale
  showInDock: boolean
  /** The screenshot hotkey (accelerator), shown beside “Screenshot”. */
  hotkey: string
}

export interface TrayActions {
  open(): void
  screenshot(): void
  openFile(): void
  setShowInDock(show: boolean): void
  quit(): void
}

export function trayMenuItems(state: TrayState, actions: TrayActions): MenuItemConstructorOptions[] {
  const m = MESSAGES[state.locale]
  return [
    { label: m['tray.open'], click: () => actions.open() },
    // Shown only: the global shortcut is registered by the screenshot module.
    { label: m['screenshot.button'], accelerator: state.hotkey, registerAccelerator: false, click: () => actions.screenshot() },
    { label: m['tray.openFile'], click: () => actions.openFile() },
    { type: 'separator' },
    { label: m['settings.showInDock'], type: 'checkbox', checked: state.showInDock, click: () => actions.setShowInDock(!state.showInDock) },
    { type: 'separator' },
    { label: m['tray.quit'], click: () => actions.quit() },
  ]
}
