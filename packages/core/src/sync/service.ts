import type { PlatformFS } from '../platform/index.js'
import type { PlatformCrypto } from '../platform/crypto.js'
import { join, relative, dirname } from '../platform/path.js'
import type { SyncAdapter } from './adapter.js'
import type { EventBus } from '../events/bus.js'
import { PROTECTED_FILES, isExcluded } from './exclusions.js'
import { mergeTagState, type TagState, type TagEntry, type TagTombstone } from './tag-merge.js'
import { reconcileFile } from './reconcile.js'
import { conflictCopyPath, rewriteNoteConflict } from './conflict.js'
import { v4 as uuid } from 'uuid'

// Files excluded from the generic mtime-based sync by their FULL relative path.
// - config.json / paired-devices.json / sync.json: per-device identity & settings
//   (sync.json holds the WebDAV endpoint + credentials) that must never be
//   overwritten by a peer.
// - tags.json / tags-deleted.json: the tag catalog, handled separately by a
//   last-writer-wins-by-name merge (mergeTags) so neither side loses tags.
const SYNC_EXCLUDED_PATHS = new Set([
  '.banjuan/config.json',
  '.banjuan/paired-devices.json',
  '.banjuan/sync.json',
  '.banjuan/tags.json',
  '.banjuan/tags-deleted.json',
])

const TAGS_REL = '.banjuan/tags.json'
const TAGS_DELETED_REL = '.banjuan/tags-deleted.json'

export interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  stubbed: number
  conflicts: number
  errors: string[]
}

// Files above this size are never read into memory to hash — mobile
// (CapacitorFS) reads whole files as base64, so hashing a multi-GB video OOMs
// the app. For these we fall back to a (size,mtime) signature, which is a
// reliable local-change signal for large media that rarely mutates in place.
const MAX_HASH_BYTES = 64 * 1024 * 1024

// Per-file baseline recorded after each successful sync (the Unison "archive").
interface ArchiveEntry {
  sig: string         // content signature: 'h:<sha256>' (crypto) or 'a:<size>:<mtime>' fallback
  size: number        // local size at last sync — cheap re-hash pre-filter
  mtime: number       // local mtime at last sync — cheap re-hash pre-filter
  remoteMtime: number // remote mtime at last sync — remote-change signal
}
interface SyncArchive {
  version: number
  timestamp: number
  files: Record<string, ArchiveEntry>
}

export interface SyncProgress {
  phase: 'scanning' | 'syncing' | 'finalizing'
  current: number
  total: number
  currentFile: string
}

export interface SyncOptions {
  stubThreshold?: number
  onStub?: (remotePath: string, size: number) => Promise<void>
}


export class SyncService {
  private archivePath: string
  private remotePath: string
  private createdDirs = new Set<string>()

  constructor(
    private rootPath: string,
    private adapter: SyncAdapter,
    private events: EventBus | undefined,
    private fs: PlatformFS,
    remotePath?: string,
    private crypto?: PlatformCrypto,
    private deviceId: string = 'device',
  ) {
    this.archivePath = join(rootPath, '.banjuan', 'sync-archive.json')
    const rp = remotePath || '/'
    this.remotePath = rp.endsWith('/') ? rp : rp + '/'
  }

  async sync(onProgress?: (progress: SyncProgress) => void, options?: SyncOptions): Promise<SyncResult> {
    this.events?.emit('sync:started', { timestamp: Date.now() })
    const result: SyncResult = { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, stubbed: 0, conflicts: 0, errors: [] }

    onProgress?.({ phase: 'scanning', current: 0, total: 0, currentFile: '' })

    const localFiles = await this.collectLocalFiles()
    const remoteFiles = await this.collectRemoteFiles()
    const localMap = new Map(localFiles.map(f => [f.relativePath, f]))
    const remoteMap = new Map(remoteFiles.map(f => [f.relativePath, f]))

    // Load the archive (state at last successful sync). On first v2 run, seed it
    // by assuming files present on BOTH sides are already in sync — this stops a
    // post-upgrade re-upload of everything (the ↓0 ↑24 bug).
    let archive = await this.readArchive()
    if (archive.version !== 2) {
      const seeded: Record<string, ArchiveEntry> = {}
      for (const f of localFiles) {
        const r = remoteMap.get(f.relativePath)
        if (r) seeded[f.relativePath] = { sig: await this.signature(f.absolutePath, f.size, f.mtime), size: f.size, mtime: f.mtime, remoteMtime: r.mtime }
      }
      archive = { version: 2, timestamp: 0, files: seeded }
      console.log(`[sync] migrated to v2 archive, seeded ${Object.keys(seeded).length} in-sync files`)
    }
    const archiveFiles = archive.files
    const archiveCount = Object.keys(archiveFiles).length

    // A side whose listing is empty while the archive had files can't be trusted
    // (failed PROPFIND, server not up) — never delete based on such an "absence".
    const remoteReliable = !(remoteFiles.length === 0 && archiveCount > 0)
    const localReliable = !(localFiles.length === 0 && archiveCount > 0)

    const allPaths = new Set([...localMap.keys(), ...remoteMap.keys()])
    const total = allPaths.size
    let current = 0
    const nextArchive: Record<string, ArchiveEntry> = {}

    for (const path of allPaths) {
      current++
      onProgress?.({ phase: 'syncing', current, total, currentFile: path })

      const local = localMap.get(path)
      const remote = remoteMap.get(path)
      const arc = archiveFiles[path]

      try {
        // Local change detection: (size,mtime) pre-filter avoids re-hashing.
        let localSig: string | undefined
        let localChanged = false
        if (local) {
          if (arc && local.size === arc.size && local.mtime === arc.mtime) {
            localSig = arc.sig
          } else {
            localSig = await this.signature(local.absolutePath, local.size, local.mtime)
            localChanged = !arc || localSig !== arc.sig
          }
        }
        // Remote mtime comes from WebDAV Last-Modified (second-resolution), so the
        // uploaded millisecond mtime gets rounded — compare with a ±1s grace.
        const remoteChanged = !!remote && (!arc || Math.abs(remote.mtime - arc.remoteMtime) > 1000)

        const action = reconcileFile({
          localPresent: !!local, remotePresent: !!remote,
          localChanged, remoteChanged,
          hadArchive: !!arc, remoteReliable, localReliable,
        })

        switch (action) {
          case 'skip':
            if (arc) nextArchive[path] = arc
            break
          case 'upload': {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local!.absolutePath, this.toRemotePath(path), local!.mtime)
            result.uploaded++
            this.events?.emit('sync:file:uploaded', { path })
            const sig = localSig ?? await this.signature(local!.absolutePath, local!.size, local!.mtime)
            nextArchive[path] = { sig, size: local!.size, mtime: local!.mtime, remoteMtime: local!.mtime }
            break
          }
          case 'download':
          case 'conflict': {
            if (action === 'conflict') {
              // Large files can't be content-hashed (reading a multi-GB file to
              // hash OOMs mobile), so their signature is (size,mtime) — and mtime
              // legitimately differs between replicas (e.g. download time). If both
              // sides report the same byte length, treat them as identical and
              // converge: no wasteful remote download, no pointless multi-GB
              // conflict copy every sync.
              if (local && remote && local.size === remote.size && local.size > MAX_HASH_BYTES) {
                nextArchive[path] = { sig: localSig!, size: local.size, mtime: local.mtime, remoteMtime: remote.mtime }
                break
              }
              // False-conflict check (Unison): both sides flagged "changed", but if
              // the remote content is byte-identical to local it isn't a real
              // conflict (e.g. remote mtime jitter, or both edited the same way) —
              // converge silently, no copy, no transfer.
              const remoteSig = await this.remoteSignature(path)
              if (remoteSig && localSig && remoteSig === localSig) {
                nextArchive[path] = { sig: localSig, size: local!.size, mtime: local!.mtime, remoteMtime: remote!.mtime }
                break
              }
              result.conflicts++
              // Preserve the local edit as a *.sync-conflict-* copy BEFORE the
              // host's version overwrites it — zero data loss. Notes get a fresh
              // id + labelled title so the copy surfaces as its own note.
              try {
                const conflictRel = await this.makeConflictCopy(path, local!.absolutePath)
                await this.ensureRemoteDir(conflictRel)
                const cabs = join(this.rootPath, conflictRel)
                const cst = await this.fs.stat(cabs)
                await this.adapter.upload(cabs, this.toRemotePath(conflictRel), cst.mtime)
                nextArchive[conflictRel] = { sig: await this.signature(cabs, cst.size, cst.mtime), size: cst.size, mtime: cst.mtime, remoteMtime: cst.mtime }
                this.events?.emit('sync:conflict', { path, conflictPath: conflictRel })
                console.log(`[sync] CONFLICT "${path}" → kept local as "${conflictRel}", host version takes the name`)
              } catch (e) {
                console.log(`[sync] CONFLICT "${path}" — failed to make conflict copy: ${(e as Error).message}`)
              }
            }
            // Stub large brand-new remote-only files instead of downloading.
            if (action === 'download' && !local && !arc && options?.stubThreshold && remote!.size > options.stubThreshold && options.onStub) {
              await options.onStub(path, remote!.size)
              result.stubbed++
              break
            }
            const localPath = local?.absolutePath ?? join(this.rootPath, path)
            await this.fs.mkdir(dirname(localPath), { recursive: true })
            await this.adapter.download(this.toRemotePath(path), localPath)
            await this.preserveMtime(localPath, remote!.mtime)
            result.downloaded++
            this.events?.emit('sync:file:downloaded', { path })
            const st = await this.fs.stat(localPath).catch(() => ({ mtime: remote!.mtime, size: remote!.size }))
            nextArchive[path] = { sig: await this.signature(localPath, st.size, st.mtime), size: st.size, mtime: st.mtime, remoteMtime: remote!.mtime }
            break
          }
          case 'deleteLocal':
            if (!PROTECTED_FILES.has(path)) {
              await this.fs.remove(local!.absolutePath)
              result.deletedLocal++
            }
            break
          case 'deleteRemote':
            await this.adapter.delete(this.toRemotePath(path))
            result.deletedRemote++
            break
        }
      } catch (err) {
        console.log(`[sync] ERROR ${path}:`, (err as Error).message)
        result.errors.push(`${path}: ${(err as Error).message}`)
        this.events?.emit('sync:error', { error: (err as Error).message })
        if (arc) nextArchive[path] = arc // keep baseline across a transient error
      }
    }
    console.log(`[sync] result:`, JSON.stringify(result))

    // The tag catalog is merged (not mtime-overwritten) so neither device loses
    // tags and deletions propagate via tombstones. Failure here must not fail sync.
    try {
      await this.mergeTags()
    } catch (err) {
      result.errors.push(`tags-merge: ${(err as Error).message}`)
      this.events?.emit('sync:error', { error: (err as Error).message })
    }

    onProgress?.({ phase: 'finalizing', current: total, total, currentFile: '' })
    await this.writeArchive({ version: 2, timestamp: Date.now(), files: nextArchive })

    this.events?.emit('sync:completed', { result })
    return result
  }

  private async collectLocalFiles(): Promise<Array<{ relativePath: string; absolutePath: string; mtime: number; size: number }>> {
    const results: Array<{ relativePath: string; absolutePath: string; mtime: number; size: number }> = []
    await this.walkDir(this.rootPath, async (absPath) => {
      try {
        const rel = relative(this.rootPath, absPath)
        if (SYNC_EXCLUDED_PATHS.has(rel)) return
        const stat = await this.fs.stat(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtime, size: stat.size })
      } catch {
        // skip files that can't be stat'd
      }
    })
    return results
  }

  private async collectRemoteFiles(): Promise<Array<{ relativePath: string; mtime: number; size: number }>> {
    const results: Array<{ relativePath: string; mtime: number; size: number }> = []
    try {
      const items = await this.adapter.list(this.remotePath)
      for (const item of items) {
        if (item.isDirectory) continue
        let rel = item.path
        if (rel.startsWith(this.remotePath)) {
          rel = rel.slice(this.remotePath.length)
        } else if (rel.startsWith('/')) {
          rel = rel.slice(1)
        }
        if (rel && !SYNC_EXCLUDED_PATHS.has(rel)) results.push({ relativePath: rel, mtime: item.mtime, size: item.size })
      }
    } catch {
      // Remote might be empty on first sync
    }
    return results
  }

  private shouldExclude(name: string, isDirectory: boolean): boolean {
    return isExcluded(name, isDirectory)
  }

  private async walkDir(dir: string, callback: (absPath: string) => Promise<void>): Promise<void> {
    let entries: Array<{ name: string; isDirectory: boolean }>
    try {
      entries = await this.fs.readdirWithTypes(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (this.shouldExclude(entry.name, entry.isDirectory)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory) {
        await this.walkDir(fullPath, callback)
      } else {
        await callback(fullPath)
      }
    }
  }

  private toRemotePath(relativePath: string): string {
    return this.remotePath + relativePath
  }

  // Make the local copy carry the source file's mtime so the next sync treats
  // them as identical (within the ±1000ms compare grace) instead of re-transferring.
  // Best-effort: skipped when the platform lacks setMtime or the source mtime is unknown.
  private async preserveMtime(localPath: string, mtime: number): Promise<void> {
    if (mtime > 0) {
      try { await this.fs.setMtime?.(localPath, mtime) } catch { /* best-effort */ }
    }
  }

  private async ensureRemoteDir(relativePath: string): Promise<void> {
    const fullRemote = this.toRemotePath(relativePath)
    const dir = dirname(fullRemote)
    if (dir !== '/' && dir !== this.remotePath.replace(/\/$/, '') && !this.createdDirs.has(dir)) {
      try { await this.adapter.mkdir(dir) } catch { /* may already exist */ }
      this.createdDirs.add(dir)
    }
  }

  private async readArchive(): Promise<SyncArchive> {
    if (await this.fs.exists(this.archivePath)) {
      try {
        const a = JSON.parse(await this.fs.readTextFile(this.archivePath))
        if (a && a.version === 2 && a.files) return a as SyncArchive
      } catch { /* corrupt → migrate */ }
    }
    return { version: 0, timestamp: 0, files: {} } // version 0 ⇒ needs migration seeding
  }

  private async writeArchive(archive: SyncArchive): Promise<void> {
    await this.fs.writeTextFile(this.archivePath, JSON.stringify(archive, null, 2))
  }

  // Content signature: sha256 when crypto is available (robust, clock-independent),
  // else a (size,mtime) tag. Compared only against THIS device's own archive, so
  // the fallback is still correct for detecting local changes between syncs.
  private async signature(absPath: string, size: number, mtime: number): Promise<string> {
    if (this.crypto && size <= MAX_HASH_BYTES) {
      try { return 'h:' + await this.crypto.sha256(await this.fs.readFile(absPath)) } catch { /* fall back */ }
    }
    return `a:${size}:${mtime}`
  }

  // Signature of the current REMOTE content — downloads it to a temp file, hashes,
  // then cleans up. Returns undefined when crypto is unavailable (can't compare
  // content reliably) or the fetch fails. Used only on a (rare) conflict.
  private async remoteSignature(rel: string): Promise<string | undefined> {
    if (!this.crypto) return undefined
    const tmp = join(this.rootPath, '.banjuan', `.sync-tmp-conflict-${rel.replace(/[^a-zA-Z0-9]/g, '_')}`)
    try {
      await this.adapter.download(this.toRemotePath(rel), tmp)
      const st = await this.fs.stat(tmp)
      const sig = await this.signature(tmp, st.size, st.mtime)
      await this.fs.remove(tmp).catch(() => {})
      return sig
    } catch {
      await this.fs.remove(tmp).catch(() => {})
      return undefined
    }
  }

  // Write the current local file to a *.sync-conflict-* sibling, preserving the
  // local edit. Note JSON gets a fresh id + labelled title so it shows as its own
  // note; anything else is copied byte-for-byte. Returns the conflict relpath.
  private async makeConflictCopy(rel: string, localAbs: string): Promise<string> {
    const ts = Date.now()
    const conflictRel = conflictCopyPath(rel, ts, this.deviceId)
    const conflictAbs = join(this.rootPath, conflictRel)
    await this.fs.mkdir(dirname(conflictAbs), { recursive: true })

    if (rel.startsWith('.banjuan/notes/') && rel.endsWith('.json')) {
      try {
        const text = await this.fs.readTextFile(localAbs)
        const rewritten = rewriteNoteConflict(text, { newId: uuid(), ts, deviceId: this.deviceId })
        if (rewritten !== null) {
          await this.fs.writeTextFile(conflictAbs, rewritten)
          return conflictRel
        }
      } catch { /* fall back to a raw byte copy */ }
    }
    // Move (don't read+write) the local file to the conflict name. A raw byte
    // copy would pull the whole file into memory — fatal for multi-GB media on
    // mobile. The caller then downloads the remote version back to the original
    // path, so renaming leaves the correct end state without buffering bytes.
    await this.fs.rename(localAbs, conflictAbs)
    return conflictRel
  }

  // ── Tag catalog merge ──────────────────────────────────────────────────
  // tags.json + tags-deleted.json are excluded from the generic file sync and
  // reconciled here by a last-writer-wins-by-name merge with tombstones, so a
  // fresh/empty device never clobbers a peer's tags and deletions propagate.
  private async mergeTags(): Promise<void> {
    const local = await this.readLocalTagState()
    const remote = await this.fetchRemoteTagState()
    const merged = mergeTagState(local, remote)

    const tagsAbs = join(this.rootPath, TAGS_REL)
    const tombAbs = join(this.rootPath, TAGS_DELETED_REL)
    await this.fs.writeTextFile(tagsAbs, JSON.stringify(merged.tags, null, 2))
    await this.fs.writeTextFile(tombAbs, JSON.stringify(merged.tombstones, null, 2))

    await this.ensureRemoteDir(TAGS_REL)
    await this.adapter.upload(tagsAbs, this.toRemotePath(TAGS_REL))
    await this.adapter.upload(tombAbs, this.toRemotePath(TAGS_DELETED_REL))
  }

  private async readLocalTagState(): Promise<TagState> {
    return {
      tags: normalizeTags(await this.readJsonArray(join(this.rootPath, TAGS_REL))),
      tombstones: normalizeTombstones(await this.readJsonArray(join(this.rootPath, TAGS_DELETED_REL))),
    }
  }

  private async fetchRemoteTagState(): Promise<TagState> {
    return {
      tags: normalizeTags(await this.downloadJsonArray(TAGS_REL)),
      tombstones: normalizeTombstones(await this.downloadJsonArray(TAGS_DELETED_REL)),
    }
  }

  private async readJsonArray(absPath: string): Promise<unknown[]> {
    try {
      if (!(await this.fs.exists(absPath))) return []
      const parsed = JSON.parse(await this.fs.readTextFile(absPath))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  // Download a remote JSON file to a temp path, read it, then clean up. Returns
  // [] when the remote file is absent (first sync) or unreadable.
  private async downloadJsonArray(rel: string): Promise<unknown[]> {
    const tmp = join(this.rootPath, '.banjuan', `.sync-tmp-${rel.replace(/[^a-zA-Z0-9]/g, '_')}`)
    try {
      await this.adapter.download(this.toRemotePath(rel), tmp)
      const arr = await this.readJsonArray(tmp)
      await this.fs.remove(tmp).catch(() => {})
      return arr
    } catch {
      await this.fs.remove(tmp).catch(() => {})
      return []
    }
  }
}

function normalizeTags(raw: unknown[]): TagEntry[] {
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .filter(t => typeof t.name === 'string')
    .map(t => ({
      id: typeof t.id === 'string' ? t.id : String(t.name),
      name: t.name as string,
      color: typeof t.color === 'string' ? t.color : null,
      updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : 0,
    }))
}

function normalizeTombstones(raw: unknown[]): TagTombstone[] {
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .filter(t => typeof t.name === 'string')
    .map(t => ({ name: t.name as string, deletedAt: typeof t.deletedAt === 'number' ? t.deletedAt : 0 }))
}
