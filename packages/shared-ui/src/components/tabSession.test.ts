import { describe, it, expect } from 'vitest'
import { readTabSession, writeTabSession, tabShortcut } from './tabSession.js'

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

describe('tab session persistence', () => {
  it('round-trips open tabs and the active tab per library', () => {
    const s = memoryStorage()
    writeTabSession(s, '/libA', { tabs: [{ kind: 'document', id: 'd1' }, { kind: 'note', id: 'n1' }, { kind: 'tag-manager' }], active: 'note-n1' })
    writeTabSession(s, '/libB', { tabs: [], active: 'library' })
    expect(readTabSession(s, '/libA')).toEqual({ tabs: [{ kind: 'document', id: 'd1' }, { kind: 'note', id: 'n1' }, { kind: 'tag-manager' }], active: 'note-n1' })
    expect(readTabSession(s, '/libB')).toEqual({ tabs: [], active: 'library' })
    expect(readTabSession(s, '/libC')).toBeNull()
  })

  it('ignores malformed or unknown entries instead of throwing', () => {
    const s = memoryStorage()
    s.setItem('banjuan-tabs:/lib', '{not json')
    expect(readTabSession(s, '/lib')).toBeNull()
    s.setItem('banjuan-tabs:/lib', JSON.stringify({ tabs: [{ kind: 'document' }, { kind: 'plugin', id: 'x' }, { kind: 'note', id: 'n' }, null], active: 5 }))
    expect(readTabSession(s, '/lib')).toEqual({ tabs: [{ kind: 'note', id: 'n' }], active: 'library' })
  })

  it('survives storage that throws (private mode / blocked)', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readTabSession(broken, '/lib')).toBeNull()
    expect(() => writeTabSession(broken, '/lib', { tabs: [], active: 'library' })).not.toThrow()
  })
})

describe('tabShortcut', () => {
  const ids = ['library', 'doc-1', 'note-2', 'tag-manager']
  const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
    ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

  it('Cmd+1..8 picks the Nth tab, Cmd+9 the last (macOS)', () => {
    expect(tabShortcut(key('1', { metaKey: true }), true, ids, 'note-2')).toBe('library')
    expect(tabShortcut(key('3', { metaKey: true }), true, ids, 'library')).toBe('note-2')
    expect(tabShortcut(key('9', { metaKey: true }), true, ids, 'library')).toBe('tag-manager')
    expect(tabShortcut(key('6', { metaKey: true }), true, ids, 'library')).toBeNull()   // no 6th tab
  })

  it('uses Ctrl instead of Cmd off macOS, and ignores other modifier combos', () => {
    expect(tabShortcut(key('2', { ctrlKey: true }), false, ids, 'library')).toBe('doc-1')
    expect(tabShortcut(key('2', { ctrlKey: true }), true, ids, 'library')).toBeNull()
    expect(tabShortcut(key('2', { metaKey: true, altKey: true }), true, ids, 'library')).toBeNull()   // BlockNote heading shortcut
    expect(tabShortcut(key('2', { metaKey: true, shiftKey: true }), true, ids, 'library')).toBeNull()
    expect(tabShortcut(key('2'), true, ids, 'library')).toBeNull()
  })

  it('Ctrl+Tab / Ctrl+Shift+Tab cycle with wrap-around', () => {
    expect(tabShortcut(key('Tab', { ctrlKey: true }), true, ids, 'note-2')).toBe('tag-manager')
    expect(tabShortcut(key('Tab', { ctrlKey: true }), true, ids, 'tag-manager')).toBe('library')
    expect(tabShortcut(key('Tab', { ctrlKey: true, shiftKey: true }), true, ids, 'library')).toBe('tag-manager')
    expect(tabShortcut(key('Tab', { ctrlKey: true }), true, ['library'], 'library')).toBeNull()
  })
})
