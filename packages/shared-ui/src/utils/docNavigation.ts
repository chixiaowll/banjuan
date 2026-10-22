/**
 * "Open this document at page N" requests (search results, annotation cards).
 * The viewer may not exist yet — it mounts lazily after the tab opens and only
 * knows page sizes once the PDF has loaded — so the request waits here until
 * the viewer for that document takes it.
 */
const pending = new Map<string, number>()
const EVENT = 'banjuan:doc-page-request'

export function requestDocPage(docId: string, page: number | null | undefined): void {
  if (!page || page < 1) return
  pending.set(docId, page)
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { docId } }))
}

/** The pending page for this document, consumed (returned once). */
export function takeDocPage(docId: string): number | undefined {
  const page = pending.get(docId)
  pending.delete(docId)
  return page
}

/** Notify a mounted viewer that a request for its document arrived. */
export function onDocPageRequest(docId: string, handler: () => void): () => void {
  const listener = (e: Event) => { if ((e as CustomEvent).detail?.docId === docId) handler() }
  document.addEventListener(EVENT, listener)
  return () => document.removeEventListener(EVENT, listener)
}
