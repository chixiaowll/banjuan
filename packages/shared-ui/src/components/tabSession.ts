/**
 * Pure helpers for TabManager: remembering open tabs per library across
 * restarts, and mapping tab keyboard shortcuts to a target tab.
 */

/** A restorable tab. Library is always open; plugin views aren't restored. */
export type SavedTab = { kind: 'document' | 'note'; id: string } | { kind: 'tag-manager' }

export interface TabSession {
  tabs: SavedTab[]
  /** Id of the active tab (TabManager tab id, e.g. "doc-<id>" or "library"). */
  active: string
}

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void }

const MAX_SAVED_TABS = 30
const key = (libraryPath: string) => `banjuan-tabs:${libraryPath}`

function isSavedTab(t: any): t is SavedTab {
  if (!t || typeof t !== 'object') return false
  if (t.kind === 'tag-manager') return true
  return (t.kind === 'document' || t.kind === 'note') && typeof t.id === 'string' && t.id.length > 0
}

export function readTabSession(storage: StorageLike, libraryPath: string): TabSession | null {
  try {
    const raw = storage.getItem(key(libraryPath))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const tabs = Array.isArray(parsed?.tabs) ? parsed.tabs.filter(isSavedTab).slice(0, MAX_SAVED_TABS) : []
    return {
      tabs: tabs.map((t: SavedTab) => (t.kind === 'tag-manager' ? { kind: t.kind } : { kind: t.kind, id: t.id })),
      active: typeof parsed?.active === 'string' ? parsed.active : 'library',
    }
  } catch {
    return null   // malformed JSON, or storage unavailable (private mode)
  }
}

export function writeTabSession(storage: StorageLike, libraryPath: string, session: TabSession): void {
  try {
    storage.setItem(key(libraryPath), JSON.stringify({ ...session, tabs: session.tabs.slice(0, MAX_SAVED_TABS) }))
  } catch { /* storage full or unavailable: tabs just won't be restored */ }
}

interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

/**
 * The tab a key press switches to, or null if it isn't a tab shortcut.
 * Cmd+1…8 (Ctrl off macOS) → Nth tab, Cmd+9 → last tab (browser convention);
 * Ctrl+Tab / Ctrl+Shift+Tab → next / previous tab, wrapping around.
 */
export function tabShortcut(e: KeyLike, isMac: boolean, tabIds: string[], activeId: string): string | null {
  const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (mod && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
    const n = Number(e.key)
    return (n === 9 ? tabIds[tabIds.length - 1] : tabIds[n - 1]) ?? null
  }
  if (e.key === 'Tab' && e.ctrlKey && !e.metaKey && !e.altKey) {
    if (tabIds.length < 2) return null
    const i = Math.max(0, tabIds.indexOf(activeId))
    return tabIds[(i + (e.shiftKey ? -1 : 1) + tabIds.length) % tabIds.length]
  }
  return null
}
