import type { PlatformFS } from '../platform/index.js'
import { join, relative, dirname } from '../platform/path.js'
import type { SyncAdapter } from './adapter.js'
import type { SyncSnapshot } from '../types.js'
import type { EventBus } from '../events/bus.js'

export interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  stubbed: number
  errors: string[]
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

const EXCLUDED_NAMES = new Set([
  'db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm',
  'library.db', 'db.meta.json',
  'sync-snapshot.json', '.DS_Store',
])

const PROTECTED_FILES = new Set([
  '.banjuan/config.json',
  '.banjuan/tags.json',
  '.banjuan/sync.json',
])

const EXCLUDED_DIRS = new Set([
  'plugins',
])

export class SyncService {
  private snapshotPath: string
  private remotePath: string
  private createdDirs = new Set<string>()

  constructor(private rootPath: string, private adapter: SyncAdapter, private events: EventBus | undefined, private fs: PlatformFS, remotePath?: string) {
    this.snapshotPath = join(rootPath, '.banjuan', 'sync-snapshot.json')
    const rp = remotePath || '/'
    this.remotePath = rp.endsWith('/') ? rp : rp + '/'
  }

  async sync(onProgress?: (progress: SyncProgress) => void, options?: SyncOptions): Promise<SyncResult> {
    this.events?.emit('sync:started', { timestamp: Date.now() })
    const result: SyncResult = { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, stubbed: 0, errors: [] }

    onProgress?.({ phase: 'scanning', current: 0, total: 0, currentFile: '' })

    const localFiles = await this.collectLocalFiles()
    console.log(`[sync] local files: ${localFiles.length}`, localFiles.map(f => f.relativePath))
    const remoteFiles = await this.collectRemoteFiles()
    console.log(`[sync] remote files: ${remoteFiles.length}`, remoteFiles.map(f => f.relativePath))
    const snapshot = await this.readSnapshot()
    console.log(`[sync] snapshot:`, snapshot?.files)

    const localMap = new Map(localFiles.map(f => [f.relativePath, f]))
    const remoteMap = new Map(remoteFiles.map(f => [f.relativePath, f]))

    let snapshotSet: Set<string> | null = null
    if (snapshot) {
      const snapshotCount = snapshot.files.length
      if (remoteFiles.length === 0 && snapshotCount > 0) {
        snapshotSet = null
      } else {
        snapshotSet = new Set(snapshot.files)
      }
    }

    const allPaths = new Set([...localMap.keys(), ...remoteMap.keys()])
    const total = allPaths.size
    let current = 0

    for (const path of allPaths) {
      current++
      onProgress?.({ phase: 'syncing', current, total, currentFile: path })

      const local = localMap.get(path)
      const remote = remoteMap.get(path)

      try {
        if (local && remote) {
          if (remote.mtime > local.mtime + 1000) {
            await this.adapter.download(this.toRemotePath(path), local.absolutePath)
            result.downloaded++
            this.events?.emit('sync:file:downloaded', { path })
          } else if (local.mtime > remote.mtime + 1000) {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
            this.events?.emit('sync:file:uploaded', { path })
          }
        } else if (local && !remote) {
          if (snapshotSet && snapshotSet.has(path) && !PROTECTED_FILES.has(path)) {
            await this.fs.remove(local.absolutePath)
            result.deletedLocal++
          } else {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
            this.events?.emit('sync:file:uploaded', { path })
          }
        } else if (!local && remote) {
          if (snapshotSet && snapshotSet.has(path)) {
            await this.adapter.delete(this.toRemotePath(path))
            result.deletedRemote++
          } else if (options?.stubThreshold && remote.size > options.stubThreshold && options.onStub) {
            await options.onStub(path, remote.size)
            result.stubbed++
          } else {
            const localPath = join(this.rootPath, path)
            await this.fs.mkdir(dirname(localPath), { recursive: true })
            await this.adapter.download(this.toRemotePath(path), localPath)
            result.downloaded++
            this.events?.emit('sync:file:downloaded', { path })
          }
        }
      } catch (err) {
        console.log(`[sync] ERROR ${path}:`, (err as Error).message)
        result.errors.push(`${path}: ${(err as Error).message}`)
        this.events?.emit('sync:error', { error: (err as Error).message })
      }
    }
    console.log(`[sync] result:`, JSON.stringify(result))

    onProgress?.({ phase: 'finalizing', current: total, total, currentFile: '' })

    const finalFiles = [...allPaths].filter(path => {
      const local = localMap.get(path)
      const remote = remoteMap.get(path)
      if (local && !remote && snapshotSet?.has(path) && !PROTECTED_FILES.has(path)) return false
      if (!local && remote && snapshotSet?.has(path)) return false
      return true
    })
    await this.writeSnapshot({ timestamp: Date.now(), files: finalFiles })

    this.events?.emit('sync:completed', { result })
    return result
  }

  private async collectLocalFiles(): Promise<Array<{ relativePath: string; absolutePath: string; mtime: number }>> {
    const results: Array<{ relativePath: string; absolutePath: string; mtime: number }> = []
    await this.walkDir(this.rootPath, async (absPath) => {
      try {
        const rel = relative(this.rootPath, absPath)
        const stat = await this.fs.stat(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtime })
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
        if (rel) results.push({ relativePath: rel, mtime: item.mtime, size: item.size })
      }
    } catch {
      // Remote might be empty on first sync
    }
    return results
  }

  private shouldExclude(name: string, isDirectory: boolean): boolean {
    if (EXCLUDED_NAMES.has(name)) return true
    if (isDirectory && EXCLUDED_DIRS.has(name)) return true
    return false
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

  private async ensureRemoteDir(relativePath: string): Promise<void> {
    const fullRemote = this.toRemotePath(relativePath)
    const dir = dirname(fullRemote)
    if (dir !== '/' && dir !== this.remotePath.replace(/\/$/, '') && !this.createdDirs.has(dir)) {
      try { await this.adapter.mkdir(dir) } catch { /* may already exist */ }
      this.createdDirs.add(dir)
    }
  }

  private async readSnapshot(): Promise<SyncSnapshot | null> {
    if (!(await this.fs.exists(this.snapshotPath))) return null
    return JSON.parse(await this.fs.readTextFile(this.snapshotPath))
  }

  private async writeSnapshot(snapshot: SyncSnapshot): Promise<void> {
    await this.fs.writeTextFile(this.snapshotPath, JSON.stringify(snapshot, null, 2))
  }
}
