/**
 * Tell link-aware panels (backlinks, PDF info sidebar) that a note's links were
 * re-synced. Core syncs note/doc links inside `notes.update`, so call this once
 * the save resolves rather than syncing from the editor on every keystroke.
 */
export function emitLinksSynced(): void {
  document.dispatchEvent(new Event('note-links-synced'))
  document.dispatchEvent(new Event('doc-links-synced'))
}
