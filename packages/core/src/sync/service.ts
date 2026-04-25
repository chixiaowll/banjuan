import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync, readdirSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import type { SyncAdapter } from './adapter.js'
import type { SyncSnapshot } from '../types.js'

export interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  errors: string[]
}

export class SyncService {
  private snapshotPath: string
  private banjuanDir: string

  constructor(private rootPath: string, private adapter: SyncAdapter) {
    this.banjuanDir = join(rootPath, '.banjuan')
    this.snapshotPath = join(this.banjuanDir, 'sync-snapshot.json')
  }

  async sync(): Promise<SyncResult> {
    const result: SyncResult = { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, errors: [] }

    const localFiles = this.collectLocalFiles()
    const remoteFiles = await this.collectRemoteFiles()
    const snapshot = this.readSnapshot()

    const localMap = new Map(localFiles.map(f => [f.relativePath, f]))
    const remoteMap = new Map(remoteFiles.map(f => [f.relativePath, f]))
    const snapshotSet = snapshot ? new Set(snapshot.files) : null

    const allPaths = new Set([...localMap.keys(), ...remoteMap.keys()])

    for (const path of allPaths) {
      const local = localMap.get(path)
      const remote = remoteMap.get(path)

      try {
        if (local && remote) {
          if (remote.mtime > local.mtime + 1000) {
            await this.adapter.download(this.toRemotePath(path), local.absolutePath)
            result.downloaded++
          } else if (local.mtime > remote.mtime + 1000) {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
          }
        } else if (local && !remote) {
          if (snapshotSet && snapshotSet.has(path)) {
            unlinkSync(local.absolutePath)
            result.deletedLocal++
          } else {
            await this.ensureRemoteDir(path)
            await this.adapter.upload(local.absolutePath, this.toRemotePath(path))
            result.uploaded++
          }
        } else if (!local && remote) {
          if (snapshotSet && snapshotSet.has(path)) {
            await this.adapter.delete(this.toRemotePath(path))
            result.deletedRemote++
          } else {
            const localPath = this.toLocalPath(path)
            mkdirSync(dirname(localPath), { recursive: true })
            await this.adapter.download(this.toRemotePath(path), localPath)
            result.downloaded++
          }
        }
      } catch (err) {
        result.errors.push(`${path}: ${(err as Error).message}`)
      }
    }

    // Build final file list (excluding deleted files)
    const finalLocalFiles = this.collectLocalFiles()
    const finalRemoteFiles = await this.collectRemoteFiles()
    const finalFiles = [...new Set([
      ...finalLocalFiles.map(f => f.relativePath),
      ...finalRemoteFiles.map(f => f.relativePath),
    ])]
    this.writeSnapshot({ timestamp: Date.now(), files: finalFiles })

    return result
  }

  private collectLocalFiles(): Array<{ relativePath: string; absolutePath: string; mtime: number }> {
    const results: Array<{ relativePath: string; absolutePath: string; mtime: number }> = []

    const dataDir = join(this.banjuanDir, 'data')
    if (existsSync(dataDir)) {
      this.walkDir(dataDir, (absPath) => {
        if (!absPath.endsWith('.json')) return
        const rel = relative(this.banjuanDir, absPath)
        const stat = statSync(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtimeMs })
      })
    }

    for (const name of ['tags.json', 'config.json', 'sync.json']) {
      const p = join(this.banjuanDir, name)
      if (existsSync(p)) {
        const stat = statSync(p)
        results.push({ relativePath: name, absolutePath: p, mtime: stat.mtimeMs })
      }
    }

    const stubsDir = join(this.banjuanDir, 'stubs')
    if (existsSync(stubsDir)) {
      this.walkDir(stubsDir, (absPath) => {
        if (!absPath.endsWith('.json')) return
        const rel = relative(this.banjuanDir, absPath)
        const stat = statSync(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtimeMs })
      })
    }

    const notesDir = join(this.rootPath, 'notes')
    if (existsSync(notesDir)) {
      this.walkDir(notesDir, (absPath) => {
        if (!absPath.endsWith('.md')) return
        const rel = 'notes/' + relative(notesDir, absPath)
        const stat = statSync(absPath)
        results.push({ relativePath: rel, absolutePath: absPath, mtime: stat.mtimeMs })
      })
    }

    return results
  }

  private async collectRemoteFiles(): Promise<Array<{ relativePath: string; mtime: number }>> {
    const results: Array<{ relativePath: string; mtime: number }> = []
    try {
      const items = await this.adapter.list('/')
      for (const item of items) {
        if (item.isDirectory) continue
        const rel = item.path.startsWith('/') ? item.path.slice(1) : item.path
        results.push({ relativePath: rel, mtime: item.mtime })
      }
    } catch {
      // Remote might be empty on first sync
    }
    return results
  }

  private walkDir(dir: string, callback: (absPath: string) => void): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        this.walkDir(fullPath, callback)
      } else {
        callback(fullPath)
      }
    }
  }

  private toRemotePath(relativePath: string): string {
    return '/' + relativePath
  }

  private toLocalPath(relativePath: string): string {
    if (relativePath.startsWith('notes/')) {
      return join(this.rootPath, relativePath)
    }
    return join(this.banjuanDir, relativePath)
  }

  private async ensureRemoteDir(relativePath: string): Promise<void> {
    const dir = dirname('/' + relativePath)
    if (dir !== '/') {
      try { await this.adapter.mkdir(dir) } catch { /* may already exist */ }
    }
  }

  private readSnapshot(): SyncSnapshot | null {
    if (!existsSync(this.snapshotPath)) return null
    return JSON.parse(readFileSync(this.snapshotPath, 'utf-8'))
  }

  private writeSnapshot(snapshot: SyncSnapshot): void {
    writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2))
  }
}
