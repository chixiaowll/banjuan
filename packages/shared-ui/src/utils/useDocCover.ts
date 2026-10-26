import { useEffect, useState } from 'react'
import type { BanjuanAPI } from '../api.js'

/**
 * A document's cover thumbnail (desktop: first page / EPUB cover, see
 * app/src/main/covers.ts), or null while there is none — callers show their
 * coloured placeholder meanwhile. Remembered per document version for the
 * session, and one request per document however many cards show it.
 */

const known = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

export function useDocCover(api: BanjuanAPI, doc: { id: string; hash?: string } | null | undefined): string | null {
  const key = doc ? `${doc.id}:${doc.hash ?? ''}` : ''
  const [url, setUrl] = useState<string | null>(() => known.get(key) ?? null)
  useEffect(() => {
    if (!doc || !api.documents.getCover) { setUrl(null); return }
    if (known.has(key)) { setUrl(known.get(key)!); return }
    let alive = true
    let job = pending.get(key)
    if (!job) {
      job = api.documents.getCover(doc.id).catch(() => null)
      pending.set(key, job)
    }
    void job.then(result => {
      pending.delete(key)
      // null can mean "not downloaded yet": ask again next session, not now.
      known.set(key, result)
      if (alive) setUrl(result)
    })
    return () => { alive = false }
  }, [api, key])
  return url
}
