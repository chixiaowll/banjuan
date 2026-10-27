# 菜单栏图标与「在 Dock 中显示」开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 半卷在 macOS 菜单栏常驻一个图标（打开半卷 / 截图 / 打开文件… / 在 Dock 中显示 / 退出），设置里可关掉 Dock 图标。

**Architecture:** 主进程 `menu-bar.ts` 建 `Tray`，每次点击用纯函数 `trayMenuItems()`（`menu-bar-menu.ts`）现做原生菜单；Dock 开关存 `~/.banjuan/settings.json`，`app.dock.hide()/show()` 生效，经 IPC 与设置面板双向同步。菜单文字取 shared-ui 的 7 种语言文件，语言由渲染端上报并记在设置文件里。

**Tech Stack:** Electron 35（Tray、Menu、nativeImage、app.dock）、React（shared-ui）、vitest、Python PIL（一次性生成图标 PNG）。

规格：`docs/superpowers/specs/2026-10-27-menu-bar-icon-design.md`。分支 `feat/menu-bar-icon`。

## File Structure

- Create `packages/app/resources/trayTemplate.png`、`trayTemplate@2x.png`：菜单栏单色模板图标（22×22 / 44×44）。
- Create `packages/shared-ui/src/i18n/locale.ts`（+ test）：`Locale` 类型、`LOCALES`、`localeFromLanguage()`（从 `i18n/index.ts` 抽出，主进程也要用）。
- Modify `packages/shared-ui/src/i18n/{zh,en,ja,ko,fr,de,es}.ts`：5 个新键。
- Modify `packages/app/src/main/settings-store.ts`：`showInDock`、`locale`。
- Create `packages/app/src/main/menu-bar-menu.ts`（+ test）：纯函数，菜单内容。
- Create `packages/app/src/main/menu-bar.ts`：Tray、Dock 生效、IPC。
- Modify `packages/app/src/main/windows.ts`：`showAllWindows()`。
- Modify `packages/app/src/main/index.ts`：启动时 `initMenuBar(...)`。
- Modify `packages/app/src/preload/index.ts`、`packages/shared-ui/src/api.ts`：可选的 `menuBar` 接口（仅 macOS）。
- Create `packages/shared-ui/src/components/DockSetting.tsx`；Modify `SettingsPanel.tsx`、`packages/shared-ui/src/index.ts`。
- Modify `packages/app/src/renderer/App.tsx`：`LocaleReporter` 上报语言。

---

### Task 1: 菜单栏图标图片

**Files:** Create `packages/app/resources/trayTemplate.png`, `packages/app/resources/trayTemplate@2x.png`

- [ ] **Step 1: 用 PIL 生成**（脚本放 scratchpad，不进仓库）：五根圆头竖条（高度错落，同应用图标），两道波浪横线；横线先在竖条上“挖”一圈透明缝再画，交叉处看得出编织感。只用黑色 + 透明度（模板图）。

```python
from PIL import Image, ImageDraw
import math
def draw(scale):
    S = 22 * scale
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bars = [(4.0, 3.0, 18.5), (7.6, 4.5, 17.0), (11.2, 2.5, 19.5), (14.8, 4.0, 18.0), (18.4, 3.5, 18.8)]
    w = 1.9 * scale
    for x, y0, y1 in bars:
        d.rounded_rectangle([x*scale - w/2, y0*scale, x*scale + w/2, y1*scale], radius=w/2, fill=(0, 0, 0, 255))
    def wave(y):
        return [((2.5 + i*0.25)*scale, (y + 0.45*math.sin((2.5 + i*0.25)*0.9))*scale) for i in range(69)]
    for y in (8.0, 13.5):
        d.line(wave(y), fill=(0, 0, 0, 0), width=int(3.4*scale), joint='curve')   # gap
        d.line(wave(y), fill=(0, 0, 0, 255), width=int(1.5*scale), joint='curve')
    return img
draw(1).save('packages/app/resources/trayTemplate.png')
draw(2).save('packages/app/resources/trayTemplate@2x.png')
```

- [ ] **Step 2: 看一眼**（Read 两张图，必要时放大到深浅两种底色上），图形清楚、不糊成一团再继续。
- [ ] **Step 3: Commit** `feat(menu-bar): 菜单栏模板图标`

### Task 2: 语言工具与文案

**Files:** Create `packages/shared-ui/src/i18n/locale.ts`, `packages/shared-ui/src/i18n/locale.test.ts`; Modify `packages/shared-ui/src/i18n/index.ts`, 7 个语言文件

- [ ] **Step 1: 写失败测试** `locale.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { localeFromLanguage, LOCALES } from './locale.js'

describe('localeFromLanguage', () => {
  it('picks the UI language for a system language tag, English otherwise', () => {
    expect(localeFromLanguage('zh-Hans-CN')).toBe('zh')
    expect(localeFromLanguage('zh-TW')).toBe('zh')
    expect(localeFromLanguage('ja-JP')).toBe('ja')
    expect(localeFromLanguage('KO')).toBe('ko')
    expect(localeFromLanguage('fr-CA')).toBe('fr')
    expect(localeFromLanguage('de')).toBe('de')
    expect(localeFromLanguage('es-419')).toBe('es')
    expect(localeFromLanguage('pt-BR')).toBe('en')
    expect(localeFromLanguage('')).toBe('en')
    expect(LOCALES).toEqual(['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es'])
  })
})
```

- [ ] **Step 2:** `cd packages/shared-ui && npx vitest run src/i18n/locale.test.ts` → FAIL（模块不存在）
- [ ] **Step 3: 实现** `locale.ts`

```ts
/** The UI languages, and which one a system language tag maps to (renderer and main process). */
export type Locale = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es'

export const LOCALES: Locale[] = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es']

/** The UI language for a BCP 47 tag (navigator.language, the system's preferred language). */
export function localeFromLanguage(lang: string): Locale {
  const l = lang.toLowerCase()
  for (const loc of ['zh', 'ja', 'ko', 'fr', 'de', 'es'] as const) if (l.startsWith(loc)) return loc
  return 'en'
}
```

`i18n/index.ts`：删掉本地的 `export type Locale = ...`，改为 `import { localeFromLanguage, type Locale } from './locale.js'` + `export type { Locale }`；`getInitialLocale()` 末尾七行 `if (lang.startsWith…)` 换成 `return localeFromLanguage(navigator.language)`。

- [ ] **Step 4: 加 5 个文案键**（每个语言文件，插在 `'settings.hotkeyReset'` 行后）：

| 键 | zh | en | ja | ko | fr | de | es |
|---|---|---|---|---|---|---|---|
| `settings.showInDock` | 在 Dock 中显示 | Show in Dock | Dock に表示 | Dock에 표시 | Afficher dans le Dock | Im Dock anzeigen | Mostrar en el Dock |
| `settings.showInDockHint` | 关掉后半卷只留在菜单栏图标里，Dock 和 ⌘Tab 里都不再出现；窗口从菜单栏图标打开。 | When off, Banjuan stays only in the menu bar — not in the Dock or ⌘Tab. Open its windows from the menu bar icon. | オフにすると半巻はメニューバーのアイコンだけになり、Dock と ⌘Tab には表示されません。ウインドウはメニューバーのアイコンから開きます。 | 끄면 Banjuan은 메뉴 막대 아이콘으로만 남고 Dock과 ⌘Tab에 나타나지 않습니다. 창은 메뉴 막대 아이콘에서 엽니다. | Désactivé, Banjuan reste uniquement dans la barre des menus, ni dans le Dock ni dans ⌘Tab. Ouvrez ses fenêtres depuis l’icône de la barre des menus. | Wenn aus, bleibt Banjuan nur in der Menüleiste – nicht im Dock und nicht in ⌘Tab. Fenster öffnen Sie über das Menüleistensymbol. | Si está desactivado, Banjuan queda solo en la barra de menús, sin aparecer en el Dock ni en ⌘Tab. Abre sus ventanas desde el icono de la barra de menús. |
| `tray.open` | 打开半卷 | Open Banjuan | 半巻を開く | Banjuan 열기 | Ouvrir Banjuan | Banjuan öffnen | Abrir Banjuan |
| `tray.openFile` | 打开文件… | Open File… | ファイルを開く… | 파일 열기… | Ouvrir un fichier… | Datei öffnen… | Abrir archivo… |
| `tray.quit` | 退出半卷 | Quit Banjuan | 半巻を終了 | Banjuan 종료 | Quitter Banjuan | Banjuan beenden | Salir de Banjuan |

“截图”复用已有的 `screenshot.button`。

- [ ] **Step 5:** `npx vitest run src/i18n` 通过；`cd ../.. && pnpm --filter @banjuan/shared-ui exec tsc --noEmit` 无错（缺键会编译报错）。
- [ ] **Step 6: Commit** `feat(menu-bar): 语言选择规则抽出供主进程用；菜单栏与 Dock 开关文案（七种语言）`

### Task 3: 菜单内容（纯函数）

**Files:** Create `packages/app/src/main/menu-bar-menu.ts`, `packages/app/src/main/menu-bar-menu.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from 'vitest'
import { trayMenuItems, isLocale } from './menu-bar-menu.js'

const actions = () => ({ open: vi.fn(), screenshot: vi.fn(), openFile: vi.fn(), setShowInDock: vi.fn(), quit: vi.fn() })
const labels = (items: ReturnType<typeof trayMenuItems>) => items.map(i => i.type === 'separator' ? '—' : i.label)

describe('trayMenuItems', () => {
  it('lists open, screenshot (its hotkey shown, not registered), open file, the Dock switch and quit, in the UI language', () => {
    const items = trayMenuItems({ locale: 'zh', showInDock: true, hotkey: 'Control+Shift+A' }, actions())
    expect(labels(items)).toEqual(['打开半卷', '截图', '打开文件…', '—', '在 Dock 中显示', '—', '退出半卷'])
    expect(items[1]).toMatchObject({ accelerator: 'Control+Shift+A', registerAccelerator: false })
    expect(items[4]).toMatchObject({ type: 'checkbox', checked: true })
    expect(labels(trayMenuItems({ locale: 'en', showInDock: false, hotkey: 'Alt+S' }, actions())))
      .toEqual(['Open Banjuan', 'Screenshot', 'Open File…', '—', 'Show in Dock', '—', 'Quit Banjuan'])
  })

  it('each item does its action; the Dock item turns the switch the other way', () => {
    const a = actions()
    const items = trayMenuItems({ locale: 'zh', showInDock: true, hotkey: 'Control+Shift+A' }, a)
    const click = (i: number) => (items[i].click as () => void)()
    click(0); click(1); click(2); click(4); click(6)
    expect([a.open, a.screenshot, a.openFile, a.quit].map(f => f.mock.calls.length)).toEqual([1, 1, 1, 1])
    expect(a.setShowInDock).toHaveBeenCalledWith(false)
    const b = actions()
    ;(trayMenuItems({ locale: 'zh', showInDock: false, hotkey: 'x' }, b)[4].click as () => void)()
    expect(b.setShowInDock).toHaveBeenCalledWith(true)
  })

  it('knows the UI languages', () => {
    expect(isLocale('ja')).toBe(true)
    expect(isLocale('pt')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2:** `cd packages/app && npx vitest run src/main/menu-bar-menu.test.ts` → FAIL
- [ ] **Step 3: 实现**

```ts
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
```

- [ ] **Step 4:** 测试通过。
- [ ] **Step 5: Commit** `feat(menu-bar): 菜单栏菜单内容（按语言、Dock 开关、截图快捷键）`

### Task 4: 设置存储与窗口调前

**Files:** Modify `packages/app/src/main/settings-store.ts`, `packages/app/src/main/windows.ts`

- [ ] **Step 1: settings-store**

```ts
interface Settings { screenshotHotkey?: string; showInDock?: boolean; locale?: string }
...
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
```

- [ ] **Step 2: windows.ts** 加

```ts
/**
 * Bring every library and file window forward, the last focused library window
 * on top (menu bar “Open Banjuan”). False when there are none.
 */
export function showAllWindows(): boolean {
  if (windows.size === 0) return false
  app.focus({ steal: true })
  for (const w of windows) {
    if (w.isMinimized()) w.restore()
    w.show()
  }
  const top = lastFocused && !lastFocused.isDestroyed() ? lastFocused : [...windows].at(-1)
  top?.focus()
  return true
}
```

- [ ] **Step 3:** `pnpm --filter @banjuan/app exec tsc --noEmit` 无错。
- [ ] **Step 4: Commit** `feat(menu-bar): 设置里记 Dock 开关与界面语言；把所有窗口调到最前`

### Task 5: 菜单栏图标与 Dock 生效（主进程）

**Files:** Create `packages/app/src/main/menu-bar.ts`; Modify `packages/app/src/main/index.ts`

- [ ] **Step 1: 实现** `menu-bar.ts`

```ts
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import { localeFromLanguage } from '@banjuan/shared-ui/src/i18n/locale'
import { trayMenuItems, isLocale, type TrayActions } from './menu-bar-menu.js'
import { getShowInDock, setShowInDock, getLocale, setLocale, getScreenshotHotkey } from './settings-store.js'

/**
 * macOS: the app's icon in the menu bar, always there, and whether the app also
 * shows in the Dock (settings; off = menu bar only, also out of ⌘Tab).
 */

let tray: Tray | null = null   // kept: a collected Tray disappears from the menu bar

function applyDock(show: boolean): void {
  if (!app.dock) return
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

  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip(app.getName())
  const popUp = () => {
    const state = { locale: currentLocale(), showInDock: getShowInDock(), hotkey: getScreenshotHotkey() }
    tray?.popUpContextMenu(Menu.buildFromTemplate(trayMenuItems(state, { ...actions, setShowInDock: changeShowInDock })))
  }
  tray.on('click', popUp)
  tray.on('right-click', popUp)
}
```

- [ ] **Step 2: 接到 index.ts**（`initScreenshot()` 之后）

```ts
  initMenuBar({
    open: () => { if (!showAllWindows()) createWindow() },
    screenshot: () => { void triggerCapture() },
    // From the menu bar the app may not be frontmost (Dock hidden): bring it forward for the dialog.
    openFile: () => { app.focus({ steal: true }); void openFileDialog() },
    quit: () => app.quit(),
  })
```

（`import { initMenuBar } from './menu-bar.js'`，`showAllWindows` 从 `./windows.js`，`triggerCapture` 从 `./screenshot/index.js`。）

- [ ] **Step 3: 实测摸底**（开发版，隔离 HOME/--user-data-dir）：菜单栏出现图标；把 `settings.json` 写 `showInDock:false` 启动，`lsappinfo info -only ApplicationType <pid>` 为 UIElement；隐藏后已开窗口是否仍在最前、能否输入；系统按键（osascript System Events）⌘C/⌘V 是否生效。发现窗口被挤到后面，就在 `applyDock(false)` 后把原先聚焦的窗口 `show()+focus()`。
- [ ] **Step 4: Commit** `feat(menu-bar): 菜单栏图标；Dock 开关生效（macOS）`

### Task 6: 渲染端接口、设置行、语言上报

**Files:** Modify `packages/app/src/preload/index.ts`, `packages/shared-ui/src/api.ts`, `packages/shared-ui/src/views/library/SettingsPanel.tsx`, `packages/shared-ui/src/index.ts`, `packages/app/src/renderer/App.tsx`; Create `packages/shared-ui/src/components/DockSetting.tsx`

- [ ] **Step 1: api.ts**（`screenshot?` 后）

```ts
  /** Desktop, macOS only: the menu bar icon — whether the app also shows in the Dock, and the language its menu uses. */
  menuBar?: {
    getShowInDock(): Promise<boolean>
    setShowInDock(show: boolean): Promise<boolean>
    onShowInDockChanged(cb: (show: boolean) => void): () => void
    /** The UI language, for the menu bar menu. */
    setLocale(locale: string): void
  }
```

- [ ] **Step 2: preload**（`screenshot:` 块后）

```ts
  menuBar: process.platform === 'darwin' ? {
    getShowInDock: () => ipcRenderer.invoke('menuBar:getShowInDock') as Promise<boolean>,
    setShowInDock: (show: boolean) => ipcRenderer.invoke('menuBar:setShowInDock', show) as Promise<boolean>,
    onShowInDockChanged: (cb: (show: boolean) => void) => listen('menuBar:showInDockChanged', cb),
    setLocale: (locale: string) => ipcRenderer.send('menuBar:setLocale', locale),
  } : undefined,
```

- [ ] **Step 3: DockSetting.tsx**（样式照抄截图快捷键那行：13px、下边距 28、提示 12px 灰字）

```tsx
import React, { useEffect, useState } from 'react'
import { useBanjuanAPI } from '../api.js'
import { useT } from '../i18n/index.js'

/** Settings row: show the app in the Dock as well as the menu bar (macOS). Renders nothing elsewhere. */
export function DockSetting() {
  const api = useBanjuanAPI()
  const t = useT()
  const mb = api.menuBar
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    if (!mb) return
    mb.getShowInDock().then(setShow).catch(() => {})
    return mb.onShowInDockChanged(setShow)   // also switched from the menu bar menu
  }, [mb])

  if (!mb || show === null) return null

  return (
    <div style={{ fontSize: 13, marginBottom: 28 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          data-show-in-dock
          checked={show}
          onChange={(e) => { const v = e.target.checked; setShow(v); void mb.setShowInDock(v).then(setShow) }}
        />
        <span>{t('settings.showInDock')}</span>
      </label>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>{t('settings.showInDockHint')}</div>
    </div>
  )
}
```

SettingsPanel：`<ScreenshotHotkeySetting />` 下一行加 `<DockSetting />`（import 同目录写法）。

- [ ] **Step 4: 语言上报**：`packages/shared-ui/src/index.ts` 已导出 `useI18n`。`App.tsx` 加

```tsx
/** Tells main the UI language (the menu bar menu uses it). */
function LocaleReporter() {
  const { locale } = useI18n()
  useEffect(() => { electronAPI.menuBar?.setLocale(locale) }, [locale])
  return null
}
```

放进书库窗口（就绪后那棵树）和 `FileWindowRoot` 的 `<I18nProvider>` 里。

- [ ] **Step 5:** `pnpm verify` 全过。
- [ ] **Step 6: Commit** `feat(menu-bar): 设置面板“在 Dock 中显示”开关，与菜单栏菜单同步；渲染端上报界面语言`

### Task 7: 实测、打包、安装

- [ ] **Step 1: E2E 脚本** `scratchpad/e2e/menubar.mjs` + `menubar.sh`（隔离 HOME 与 `--user-data-dir`，开书库窗口）：
  1. 设置面板里有 `[data-show-in-dock]`，默认勾选，`lsappinfo` 为 Foreground；
  2. 点掉 → UIElement，`settings.json` 里 `showInDock:false`，库窗口仍可见；
  3. 再点上 → Foreground；
  4. 切到英文界面 → `settings.json` 的 `locale` 为 `en`；
  5. 写 `showInDock:false` 后重启 → 启动后为 UIElement，设置面板里未勾选；
  6. Dock 隐藏时用 osascript 发 ⌘A ⌘C / ⌘V 到笔记编辑器，内容被复制粘贴（若终端无辅助功能权限则记为未验证并说明）。
- [ ] **Step 2:** 截菜单栏右侧区域图，确认图标在、深浅色下清楚；能点开时截菜单。
- [ ] **Step 3:** 打包（`pnpm run build && node scripts/bundle-cli.mjs && npx electron-builder --dir --mac --arm64`），安装到 /Applications，用安装版重跑 E2E；回归 sfw、sec。
- [ ] **Step 4:** 合入 `integrate/local-test`，不推送。
