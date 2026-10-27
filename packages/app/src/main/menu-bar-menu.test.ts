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
