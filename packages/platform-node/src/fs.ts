import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import type { PlatformFS } from '@banjuan/core'

/** Suffix of in-flight temp files; sync excludes it (see core sync/exclusions). */
export const TEMP_SUFFIX = '.banjuan-tmp'

/**
 * Write via a temp file in the same directory, fsync, then rename over the
 * target. A crash or power loss mid-write leaves the old file or the new one —
 * never a truncated JSON that would break the index and then sync to every
 * device. Fully synchronous, so no other code in this process ever sees the
 * temp file; on any failure it is removed and the original is untouched.
 */
function writeAtomic(filePath: string, data: Uint8Array | string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}-${Math.random().toString(36).slice(2)}${TEMP_SUFFIX}`)
  try {
    const fd = fs.openSync(tmp, 'w')
    try {
      fs.writeFileSync(fd, data)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(tmp, filePath)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}

// Reads go through fs/promises so long scans (index rebuild, sync, import) don't
// block the Electron main process — IPC from the UI keeps being served between
// reads. Writes stay synchronous (see writeAtomic).
export class NodeFS implements PlatformFS {
  openReadStream(filePath: string): Readable {
    return fs.createReadStream(filePath)
  }

  /** Stream into a temp file next to the target, then rename — never a half-written file in place. */
  async writeStream(filePath: string, stream: unknown): Promise<void> {
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}-${Math.random().toString(36).slice(2)}${TEMP_SUFFIX}`)
    try {
      await pipeline(stream as Readable, fs.createWriteStream(tmp))
      fs.renameSync(tmp, filePath)
    } catch (e) {
      fs.rmSync(tmp, { force: true })
      throw e
    }
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    return fsp.readFile(filePath)
  }

  async readTextFile(filePath: string): Promise<string> {
    return fsp.readFile(filePath, 'utf-8')
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    writeAtomic(filePath, data)
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    writeAtomic(filePath, content)   // strings are written as UTF-8
  }

  async exists(filePath: string): Promise<boolean> {
    return fsp.access(filePath).then(() => true, () => false)
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    fs.mkdirSync(dirPath, options)
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fsp.readdir(dirPath)
  }

  async readdirWithTypes(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }))
  }

  async remove(filePath: string): Promise<void> {
    fs.unlinkSync(filePath)
  }

  async rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    fs.rmSync(dirPath, { recursive: options?.recursive ?? false, force: true })
  }

  async stat(filePath: string): Promise<{ mtime: number; size: number }> {
    const s = await fsp.stat(filePath)
    return { mtime: s.mtimeMs, size: s.size }
  }

  async setMtime(filePath: string, mtimeMs: number): Promise<void> {
    const t = new Date(mtimeMs)
    fs.utimesSync(filePath, t, t)
  }

  async rename(from: string, to: string): Promise<void> {
    fs.renameSync(from, to)
  }

  watch(dirPath: string, options: { recursive?: boolean }, callback: (event: string, filename: string | null) => void): { close(): void } {
    return fs.watch(dirPath, { recursive: options.recursive }, callback)
  }
}
