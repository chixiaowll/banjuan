import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PlatformFS } from '@banjuan/core'

export class NodeFS implements PlatformFS {
  async readFile(filePath: string): Promise<Uint8Array> {
    return fs.readFileSync(filePath)
  }

  async readTextFile(filePath: string): Promise<string> {
    return fs.readFileSync(filePath, 'utf-8')
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, data)
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  async exists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath)
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    fs.mkdirSync(dirPath, options)
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdirSync(dirPath)
  }

  async readdirWithTypes(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
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
    const s = fs.statSync(filePath)
    return { mtime: s.mtimeMs, size: s.size }
  }

  async rename(from: string, to: string): Promise<void> {
    fs.renameSync(from, to)
  }

  watch(dirPath: string, options: { recursive?: boolean }, callback: (event: string, filename: string | null) => void): { close(): void } {
    return fs.watch(dirPath, { recursive: options.recursive }, callback)
  }
}
