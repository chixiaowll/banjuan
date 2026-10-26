// Conflict-copy helpers (P2): when both sides changed a file, the host keeps the
// canonical name and the local edit is preserved as a `*.sync-conflict-*` copy so
// nothing is ever lost. For note JSON we also rewrite the embedded id + title so
// the copy surfaces as its own, clearly-labelled note instead of colliding with
// the original's id. Pure & unit-tested; SyncService does the IO around it.

function splitExt(rel: string): { stem: string; ext: string } {
  const slash = rel.lastIndexOf('/')
  const dot = rel.lastIndexOf('.')
  if (dot <= slash) return { stem: rel, ext: '' } // no extension (or dot is in a dir name)
  return { stem: rel.slice(0, dot), ext: rel.slice(dot) }
}

/** `notes/a.json` → `notes/a.sync-conflict-<ts>-<device>.json` */
export function conflictCopyPath(rel: string, ts: number, deviceId: string): string {
  const { stem, ext } = splitExt(rel)
  const dev = (deviceId || 'device').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'device'
  return `${stem}.sync-conflict-${ts}-${dev}${ext}`
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function stampLabel(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * If `text` is a note JSON (`{ meta: { id, title, ... }, ... }`), return a rewritten
 * copy with a fresh id, a "(conflict · device · time)" title, and conflict metadata.
 * Returns null when it isn't a rewritable note (binary/doc/unparseable) — caller
 * then makes a raw byte copy instead.
 */
export function rewriteNoteConflict(
  text: string,
  opts: { newId: string; ts: number; deviceId: string; makeId?: () => string },
): string | null {
  let data: any
  try { data = JSON.parse(text) } catch { return null }
  const meta = data?.meta
  if (!meta || typeof meta.id !== 'string') return null
  // A mind map's node / edge / boundary / summary ids are global keys too: the
  // copy keeping them collided with the original map's rows when indexed.
  if (opts.makeId && Array.isArray(data.nodes)) renewMindmapIds(data, opts.makeId)

  const originalId = meta.id
  const originalTitle = typeof meta.title === 'string' && meta.title ? meta.title : 'Untitled'
  meta.id = opts.newId
  meta.title = `${originalTitle} (冲突 · ${opts.deviceId || 'device'} · ${stampLabel(opts.ts)})`
  meta.conflictOf = originalId
  meta.conflictDevice = opts.deviceId || 'device'
  meta.conflictAt = opts.ts
  return JSON.stringify(data, null, 2)
}

/** Give every node, edge, boundary and summary of a mind-map file a new id, keeping all references consistent. */
function renewMindmapIds(data: any, makeId: () => string): void {
  const nodeIds = new Map<string, string>()
  for (const n of data.nodes) if (n && typeof n.id === 'string') nodeIds.set(n.id, makeId())
  const mapId = (id: unknown) => (typeof id === 'string' ? nodeIds.get(id) ?? id : id)
  for (const n of data.nodes) {
    if (!n) continue
    n.id = mapId(n.id)
    if (n.parentId) n.parentId = mapId(n.parentId)
  }
  for (const e of Array.isArray(data.edges) ? data.edges : []) {
    e.id = makeId()
    e.sourceId = mapId(e.sourceId)
    e.targetId = mapId(e.targetId)
  }
  for (const b of Array.isArray(data.boundaries) ? data.boundaries : []) {
    b.id = makeId()
    b.nodeIds = Array.isArray(b.nodeIds) ? b.nodeIds.map(mapId) : b.nodeIds
  }
  for (const s of Array.isArray(data.summaries) ? data.summaries : []) {
    s.id = makeId()
    s.nodeIds = Array.isArray(s.nodeIds) ? s.nodeIds.map(mapId) : s.nodeIds
    s.summaryNodeId = mapId(s.summaryNodeId)
  }
}
