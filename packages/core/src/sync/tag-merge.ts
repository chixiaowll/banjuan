// Tag catalog sync is a last-writer-wins-by-NAME merge with tombstones.
//
// Tags are identified by their NAME, not their id: `TagService.create` mints a
// random uuid, so the same tag name created independently on two devices gets
// different ids. Notes also reference tags by name. So the merge key is `name`.
//
// Every tag mutation (create/rename/recolor) stamps `updatedAt`; every deletion
// records a `{ name, deletedAt }` tombstone. A name is considered deleted when a
// tombstone for it is newer than any surviving tag of that name — which lets a
// re-created tag (newer `updatedAt`) win over an old deletion ("I can add it
// back"). Tombstones are GC'd after a retention window.

export interface TagEntry {
  id: string
  name: string
  color: string | null
  updatedAt: number
}

export interface TagTombstone {
  name: string
  deletedAt: number
}

export interface TagState {
  tags: TagEntry[]
  tombstones: TagTombstone[]
}

export const TAG_TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

/**
 * Merge two tag catalogs (local + remote) into the converged state both sides
 * should adopt. Pure and order-independent: mergeTagState(a, b) ≡ mergeTagState(b, a).
 */
export function mergeTagState(
  local: TagState,
  remote: TagState,
  opts?: { now?: number; retentionMs?: number },
): TagState {
  const now = opts?.now ?? Date.now()
  const retentionMs = opts?.retentionMs ?? TAG_TOMBSTONE_RETENTION_MS

  // Tombstones: union by name, keep the latest deletion time.
  const tombByName = new Map<string, number>()
  for (const t of [...local.tombstones, ...remote.tombstones]) {
    const prev = tombByName.get(t.name)
    if (prev === undefined || t.deletedAt > prev) tombByName.set(t.name, t.deletedAt)
  }

  // Tags: union by name, keep the entry with the latest updatedAt (color follows).
  const tagByName = new Map<string, TagEntry>()
  for (const tag of [...local.tags, ...remote.tags]) {
    const prev = tagByName.get(tag.name)
    if (!prev || tag.updatedAt > prev.updatedAt) tagByName.set(tag.name, tag)
  }

  // A tag survives iff there is no newer-or-equal tombstone for its name.
  const tags: TagEntry[] = []
  for (const tag of tagByName.values()) {
    const deletedAt = tombByName.get(tag.name)
    if (deletedAt === undefined || tag.updatedAt > deletedAt) tags.push(tag)
  }
  const survivingNames = new Set(tags.map(t => t.name))

  // Keep tombstones that are still in effect (no surviving tag overrides them)
  // and within the retention window; drop the rest.
  const tombstones: TagTombstone[] = []
  for (const [name, deletedAt] of tombByName) {
    if (survivingNames.has(name)) continue          // re-created — tombstone superseded
    if (now - deletedAt > retentionMs) continue     // GC: too old to matter
    tombstones.push({ name, deletedAt })
  }

  // Stable ordering so serialized output is deterministic.
  tags.sort((a, b) => a.name.localeCompare(b.name))
  tombstones.sort((a, b) => a.name.localeCompare(b.name))
  return { tags, tombstones }
}
