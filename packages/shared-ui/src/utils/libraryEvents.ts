/**
 * App-wide "something changed" signals. TabManager listens to close tabs whose
 * note / document was deleted; list views listen to reload. Fire after any
 * create / rename / delete so every open view converges.
 */
export function notifyNotesChanged(): void {
  document.dispatchEvent(new Event('notes-changed'))
}

export function notifyDocumentsChanged(): void {
  document.dispatchEvent(new Event('documents-changed'))
}
