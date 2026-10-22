import { describe, it, expect } from 'vitest'
import { acceleratorFromKeyEvent, formatAccelerator, type KeyLike } from './accelerator.js'

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: '', code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods,
})

describe('acceleratorFromKeyEvent', () => {
  it('builds Control+Shift+<letter> from the physical key code', () => {
    expect(acceleratorFromKeyEvent(key('KeyA', { ctrlKey: true, shiftKey: true }), true)).toBe('Control+Shift+A')
  })
  it('uses the key code, not the typed character (Option+A types "å" on macOS)', () => {
    expect(acceleratorFromKeyEvent({ ...key('KeyA', { altKey: true, metaKey: true }), key: 'å' }, true)).toBe('Command+Alt+A')
  })
  it('maps the meta key to Command on macOS and Super elsewhere', () => {
    expect(acceleratorFromKeyEvent(key('Digit2', { metaKey: true, shiftKey: true }), true)).toBe('Command+Shift+2')
    expect(acceleratorFromKeyEvent(key('Digit2', { metaKey: true, shiftKey: true }), false)).toBe('Super+Shift+2')
  })
  it('returns null while only modifiers are held', () => {
    expect(acceleratorFromKeyEvent(key('ShiftLeft', { shiftKey: true, ctrlKey: true }), true)).toBeNull()
    expect(acceleratorFromKeyEvent(key('MetaLeft', { metaKey: true }), true)).toBeNull()
  })
  it('rejects bare or Shift-only combos (they would hijack normal typing)', () => {
    expect(acceleratorFromKeyEvent(key('KeyA'), true)).toBeNull()
    expect(acceleratorFromKeyEvent(key('KeyA', { shiftKey: true }), true)).toBeNull()
  })
  it('allows function keys without modifiers', () => {
    expect(acceleratorFromKeyEvent(key('F1'), true)).toBe('F1')
    expect(acceleratorFromKeyEvent(key('F12', { shiftKey: true }), false)).toBe('Shift+F12')
  })
  it('maps punctuation, space and arrows to accelerator key names', () => {
    expect(acceleratorFromKeyEvent(key('Space', { ctrlKey: true }), true)).toBe('Control+Space')
    expect(acceleratorFromKeyEvent(key('Slash', { ctrlKey: true }), true)).toBe('Control+/')
    expect(acceleratorFromKeyEvent(key('ArrowUp', { altKey: true }), true)).toBe('Alt+Up')
  })
  it('returns null for keys it cannot express', () => {
    expect(acceleratorFromKeyEvent(key('IntlRo', { ctrlKey: true }), true)).toBeNull()
  })
})

describe('formatAccelerator', () => {
  it('renders macOS symbols in Apple order (⌃⌥⇧⌘)', () => {
    expect(formatAccelerator('Control+Shift+A', true)).toBe('⌃⇧A')
    expect(formatAccelerator('Command+Shift+Alt+Control+K', true)).toBe('⌃⌥⇧⌘K')
    expect(formatAccelerator('CommandOrControl+Shift+A', true)).toBe('⇧⌘A')
  })
  it('renders words joined by + elsewhere', () => {
    expect(formatAccelerator('Control+Shift+A', false)).toBe('Ctrl+Shift+A')
    expect(formatAccelerator('CmdOrCtrl+Alt+Space', false)).toBe('Ctrl+Alt+Space')
    expect(formatAccelerator('Super+F1', false)).toBe('Win+F1')
  })
})
