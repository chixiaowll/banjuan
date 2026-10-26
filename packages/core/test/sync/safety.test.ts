import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync, utimesSync, chmodSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import { createTempDir } from '../helpers.js'
import { SyncService } from '../../src/sync/service.js'
import type { SyncAdapter } from '../../src/sync/adapter.js'
import type { RemoteFile, SyncConfig } from '../../src/types.js'

/**
 * Behaves like a generic WebDAV server (Nutstore, Nextcloud): it IGNORES the
 * client's mtime and stamps uploads with its own clock, at second resolution.
 */
class GenericDavAdapter implements SyncAdapter {
  files = new Map<string, { content: Buffer; mtime: number }>()
  constructor(private serverNow: () => number) {}
  private stamp() { return Math.floor(this.serverNow() / 1000) * 1000 }
  async connect(_c: SyncConfig): Promise<void> {}
  async disconnect(): Promise<void> {}
  async list(remotePath: string): Promise<RemoteFile[]> {
    return [...this.files].filter(([p]) => p.startsWith(remotePath))
      .map(([path, d]) => ({ path, mtime: d.mtime, size: d.content.length, isDirectory: false }))
  }
  async upload(localPath: string, remotePath: string): Promise<void> {
    this.files.set(remotePath, { content: readFileSync(localPath), mtime: this.stamp() })
  }
  async download(remotePath: string, localPath: string): Promise<void> {
    const d = this.files.get(remotePath)
    if (!d) throw new Error('Not found: ' + remotePath)
    mkdirSync(dirname(localPath), { recursive: true })
    writeFileSync(localPath, d.content)
  }
  async delete(remotePath: string): Promise<void> { this.files.delete(remotePath) }
  async getMetadata(remotePath: string): Promise<{ mtime: number; size: number }> {
    const d = this.files.get(remotePath)
    if (!d) throw new Error('Not found: ' + remotePath)
    return { mtime: d.mtime, size: d.content.length }
  }
  async mkdir(_p: string): Promise<void> {}
  editRemote(remotePath: string, content: string) { this.files.set(remotePath, { content: Buffer.from(content), mtime: this.stamp() }) }
  text(remotePath: string) { return this.files.get(remotePath)?.content.toString() }
}

function edit(file: string, content: string, mtimeMs: number) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  utimesSync(file, new Date(mtimeMs), new Date(mtimeMs))
}

const allFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true, recursive: true } as any)
  .filter((e: any) => e.isFile()).map((e: any) => join(e.parentPath ?? e.path, e.name))

describe('WebDAV sync safety', () => {
  let clock = 1_800_000_000_000
  const serverNow = () => clock
  let lockedDir: string | null = null
  afterEach(() => { if (lockedDir) { chmodSync(lockedDir, 0o755); lockedDir = null } })

  function setup() {
    const root = createTempDir()
    const adapter = new GenericDavAdapter(serverNow)
    // Desktop configuration: no crypto (content hashes unavailable).
    const svc = new SyncService(root, adapter, undefined, new NodeFS(), '/')
    return { root, adapter, svc }
  }

  it('a normal local edit is uploaded, not turned into a conflict, when the server ignores our mtime', async () => {
    const { root, adapter, svc } = setup()
    edit(join(root, 'notes.md'), 'v1', clock - 60_000)        // edited a minute before syncing
    expect((await svc.sync()).uploaded).toBe(1)

    clock += 120_000
    edit(join(root, 'notes.md'), 'v2 local edit', clock - 30_000)
    const r = await svc.sync()
    expect(r.conflicts).toBe(0)
    expect(r.uploaded).toBe(1)
    expect(adapter.text('/notes.md')).toBe('v2 local edit')
    expect(readFileSync(join(root, 'notes.md'), 'utf-8')).toBe('v2 local edit')
    expect(allFiles(root).some(f => f.includes('sync-conflict'))).toBe(false)
  })

  it('an unchanged file is not downloaded again on the next sync', async () => {
    const { root, svc } = setup()
    edit(join(root, 'paper.pdf'), 'PDF', clock - 60_000)
    await svc.sync()
    clock += 60_000
    const r = await svc.sync()
    expect(r.downloaded).toBe(0)
    expect(r.uploaded).toBe(0)
  })

  it('a subfolder that cannot be read is not treated as deleted', async () => {
    const { root, adapter, svc } = setup()
    edit(join(root, 'dirA', 'x.txt'), 'X', clock - 60_000)
    edit(join(root, 'y.txt'), 'Y', clock - 60_000)
    await svc.sync()
    lockedDir = join(root, 'dirA')
    chmodSync(lockedDir, 0o000)                                  // e.g. permissions glitch / unmounted volume
    const r = await svc.sync()
    expect(r.deletedRemote).toBe(0)
    expect(adapter.text('/dirA/x.txt')).toBe('X')
  })

  it('keeps the local edit when the conflict copy cannot be made', async () => {
    const { root, adapter } = setup()
    const fs = new NodeFS()
    fs.rename = async () => { throw new Error('disk full') }    // conflict copy of a binary file is a rename
    const svc = new SyncService(root, adapter, undefined, fs, '/')
    edit(join(root, 'a.bin'), 'BASE', clock - 60_000)
    await svc.sync()
    clock += 60_000
    edit(join(root, 'a.bin'), 'LOCAL EDIT', clock - 10_000)
    adapter.editRemote('/a.bin', 'REMOTE EDIT')
    const r = await svc.sync()
    expect(readFileSync(join(root, 'a.bin'), 'utf-8')).toBe('LOCAL EDIT')
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('reports localChanged only when this device\'s files changed (so the index rebuild can be skipped)', async () => {
    const { root, adapter, svc } = setup()
    edit(join(root, 'a.txt'), 'A', clock - 60_000)
    await svc.sync()                                             // first sync may write tag files
    clock += 60_000
    edit(join(root, 'a.txt'), 'A2', clock - 10_000)
    const upload = await svc.sync()
    expect(upload.uploaded).toBe(1)
    expect(upload.localChanged).toBe(false)                     // upload-only: nothing local changed
    clock += 60_000
    adapter.editRemote('/a.txt', 'A3 from another device')
    const download = await svc.sync()
    expect(download.downloaded).toBe(1)
    expect(download.localChanged).toBe(true)
  })

  it('a deletion arriving from another device moves the local file to the sync trash', async () => {
    const { root, adapter, svc } = setup()
    edit(join(root, 'z.txt'), 'precious', clock - 60_000)
    edit(join(root, 'other.txt'), 'keeps the remote listing non-empty', clock - 60_000)
    await svc.sync()
    await adapter.delete('/z.txt')
    const r = await svc.sync()
    expect(r.deletedLocal).toBe(1)
    expect(existsSync(join(root, 'z.txt'))).toBe(false)
    const trashed = allFiles(join(root, '.banjuan', '.sync-trash'))
    expect(trashed.some(f => f.endsWith('z.txt') && readFileSync(f, 'utf-8') === 'precious')).toBe(true)
    await svc.sync()
    expect([...adapter.files.keys()].some(p => p.includes('sync-trash'))).toBe(false)   // trash is never uploaded
  })
})

describe('remote listing cannot write outside the library or into excluded paths', () => {
  it('downloads only plain library paths', async () => {
    const parent = createTempDir()
    const root = join(parent, 'lib')
    mkdirSync(root)
    const adapter = new GenericDavAdapter(() => 1_800_000_000_000)
    for (const p of ['/../escape.txt', '/sub/../../escape2.txt', '/.banjuan/PLUGINS/x/index.js', '/.banjuan/plugins/y/index.js',
      '/.banjuan/SYNC.JSON', '/.banjuan/Config.json', '/./dot.md', '//double.md', '/a\\..\\..\\win.txt', '/ok.md', '/Notes/ok2.md']) {
      adapter.editRemote(p, 'evil')
    }
    const svc = new SyncService(root, adapter, undefined, new NodeFS(), '/')
    const r = await svc.sync()
    expect(r.downloaded).toBe(2)
    // Only the two plain files arrived (plus the sync's own bookkeeping), nothing outside the library.
    expect(allFiles(parent).map(f => f.slice(root.length + 1)).sort())
      .toEqual(['.banjuan/sync-archive.json', '.banjuan/tags-deleted.json', '.banjuan/tags.json', 'Notes/ok2.md', 'ok.md'])
    expect(existsSync(join(parent, 'escape.txt'))).toBe(false)
  })
})
