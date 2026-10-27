import type { BanjuanAPI, ImportOpenTarget } from '../api.js'

/**
 * In a library window: bring in a file handed over from a single-file window
 * (added to the library, or opened in it) and open it. A file already in the
 * library is imported where it is if it isn't yet; one from outside is copied
 * into the library's top folder (renamed on a clash).
 */
export async function importAndOpen(api: BanjuanAPI, target: ImportOpenTarget): Promise<void> {
  const results = (await api.documents.importFiles?.([target.absPath])) ?? []
  const relPath = target.relPath ?? results.find(r => r.success)?.title
  if (!relPath) throw new Error(results.find(r => !r.success)?.error ?? 'Import failed')
  const doc = (await api.documents.list()).find(d => d.path === relPath)
  if (!doc) throw new Error(`Not in the library: ${relPath}`)
  document.dispatchEvent(new CustomEvent('banjuan:open-document', { detail: { docId: doc.id } }))
}
