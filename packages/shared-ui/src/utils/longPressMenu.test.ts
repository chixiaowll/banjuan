// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installLongPressMenu, LONG_PRESS_MS } from './longPressMenu.js'

function pointer(type: string, target: Element, x: number, y: number, pointerType = 'touch') {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }) as any
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  target.dispatchEvent(e)
}

describe('installLongPressMenu', () => {
  let area: HTMLElement, outside: HTMLElement, item: HTMLElement, uninstall: () => void
  const menus: Array<{ x: number; y: number; on: string }> = []

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div data-long-press-menu><span id="item">Note</span></div><div id="outside">Reader</div>'
    area = document.querySelector('[data-long-press-menu]')!
    item = document.getElementById('item')!
    outside = document.getElementById('outside')!
    menus.length = 0
    document.addEventListener('contextmenu', e => { menus.push({ x: e.clientX, y: e.clientY, on: (e.target as Element).id }) })
    uninstall = installLongPressMenu(window)
  })
  afterEach(() => { uninstall(); vi.useRealTimers() })

  it('opens the context menu at the press point after a long press', () => {
    pointer('pointerdown', item, 40, 50)
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(menus).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(menus).toEqual([{ x: 40, y: 50, on: 'item' }])
  })

  it('does nothing for a tap, a scroll, a mouse, or outside marked areas', () => {
    pointer('pointerdown', item, 40, 50); pointer('pointerup', item, 40, 50)
    pointer('pointerdown', item, 40, 50); pointer('pointermove', item, 40, 80)
    pointer('pointerdown', item, 40, 50, 'mouse')
    pointer('pointerdown', outside, 40, 50)
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(menus).toHaveLength(0)
  })

  it('swallows the click / double-click that ends a long press, but not the next tap', () => {
    const clicks: string[] = []
    item.addEventListener('click', () => clicks.push('click'))
    item.addEventListener('dblclick', () => clicks.push('dblclick'))
    pointer('pointerdown', item, 40, 50)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    pointer('pointerup', item, 40, 50)
    item.click()
    item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(clicks).toEqual([])
    pointer('pointerdown', item, 40, 50); pointer('pointerup', item, 40, 50)
    item.click()
    expect(clicks).toEqual(['click'])
  })
})
