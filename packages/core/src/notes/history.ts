import { join } from '../platform/path.js'
import type { PlatformFS } from '../platform/index.js'

/**
 * Earlier versions of notes, so a write that went wrong (a program adding to
 * a note, an editor saving over a newer version) can be undone. Each version
 * is the note's file as it was, at .banjuan/.note-history/<id>/<ms>-<reason>.json
 * — on this device only (not synced). Up to 50 per note; versions older than
 * 30 days go, except the newest 5.
 */

export interface NoteVersion {
  version: string
  at: string
  reason: string
  title: string
}

const MAX_VERSIONS = 50
const MAX_AGE_MS = 30 * 86_400_000
const KEEP_RECENT = 5
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/
const VERSION = /^(\d{10,16})-([a-z]{1,20})(?:-(\d+))?$/

export class NoteHistory {
  private dir: string

  constructor(rootPath: string, private fs: PlatformFS) {
    this.dir = join(rootPath, '.banjuan', '.note-history')
  }

  private noteDir(noteId: string): string {
    if (!SAFE_ID.test(noteId)) throw new Error(`Invalid note id: ${noteId}`)
    return join(this.dir, noteId)
  }

  /** Keep `fileText` (the note's file before a write) as a version; returns its id. */
  async save(noteId: string, fileText: string, reason: string, now = new Date()): Promise<string> {
    if (!/^[a-z]{1,20}$/.test(reason)) throw new Error(`Invalid reason: ${reason}`)
    const dir = this.noteDir(noteId)
    await this.fs.mkdir(dir, { recursive: true })
    let version = `${now.getTime()}-${reason}`
    for (let n = 2; await this.fs.exists(join(dir, version + '.json')); n++) version = `${now.getTime()}-${reason}-${n}`
    await this.fs.writeTextFile(join(dir, version + '.json'), fileText)
    await this.prune(noteId, now.getTime())
    return version
  }

  /** Newest first. */
  async list(noteId: string): Promise<NoteVersion[]> {
    const out: NoteVersion[] = []
    for (const { version, ms, reason } of await this.versions(noteId)) {
      let title = ''
      try { title = String(JSON.parse(await this.fs.readTextFile(join(this.noteDir(noteId), version + '.json'))).meta?.title ?? '') } catch { /* unreadable: no title */ }
      out.push({ version, at: new Date(ms).toISOString(), reason, title })
    }
    return out
  }

  /** The note file as it was in `version`. */
  async read(noteId: string, version: string): Promise<string> {
    if (!VERSION.test(version)) throw new Error(`Invalid version: ${version}`)
    const path = join(this.noteDir(noteId), version + '.json')
    if (!(await this.fs.exists(path))) throw new Error(`No such version: ${version}`)
    return this.fs.readTextFile(path)
  }

  /** When the newest version was kept (ms), or null if none. */
  async newestAt(noteId: string): Promise<number | null> {
    return (await this.versions(noteId))[0]?.ms ?? null
  }

  private async versions(noteId: string): Promise<Array<{ version: string; ms: number; reason: string; n: number }>> {
    const dir = this.noteDir(noteId)
    if (!(await this.fs.exists(dir))) return []
    const list: Array<{ version: string; ms: number; reason: string; n: number }> = []
    for (const name of await this.fs.readdir(dir)) {
      const m = VERSION.exec(name.replace(/\.json$/, ''))
      if (m && name.endsWith('.json')) list.push({ version: m[0], ms: Number(m[1]), reason: m[2], n: Number(m[3] ?? 1) })
    }
    return list.sort((a, b) => b.ms - a.ms || b.n - a.n)
  }

  private async prune(noteId: string, now: number): Promise<void> {
    const list = await this.versions(noteId)
    const dir = this.noteDir(noteId)
    for (const [i, v] of list.entries()) {
      if (i >= MAX_VERSIONS || (i >= KEEP_RECENT && now - v.ms > MAX_AGE_MS)) await this.fs.remove(join(dir, v.version + '.json'))
    }
  }
}
