import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { PlatformFS } from '@banjuan/core'

export class CapacitorFS implements PlatformFS {
  constructor(private baseDir: string) {}

  private resolvePath(path: string): string {
    if (path.startsWith(this.baseDir)) return path
    return `${this.baseDir}/${path}`
  }

  async readFile(path: string): Promise<Uint8Array> {
    const result = await Filesystem.readFile({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    const binary = atob(result.data as string)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  async readTextFile(path: string): Promise<string> {
    const result = await Filesystem.readFile({
      path: this.resolvePath(path),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return result.data as string
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    let binary = ''
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
    await Filesystem.writeFile({
      path: this.resolvePath(path),
      data: btoa(binary),
      directory: Directory.Documents,
      recursive: true,
    })
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await Filesystem.writeFile({
      path: this.resolvePath(path),
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path: this.resolvePath(path), directory: Directory.Documents })
      return true
    } catch {
      return false
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await Filesystem.mkdir({
        path: this.resolvePath(path),
        directory: Directory.Documents,
        recursive: options?.recursive,
      })
    } catch { /* may already exist */ }
  }

  async readdir(path: string): Promise<string[]> {
    const result = await Filesystem.readdir({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    return result.files.map(f => f.name)
  }

  async readdirWithTypes(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const result = await Filesystem.readdir({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    return result.files.map(f => ({
      name: f.name,
      isDirectory: f.type === 'directory',
    }))
  }

  async remove(path: string): Promise<void> {
    await Filesystem.deleteFile({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await Filesystem.rmdir({
      path: this.resolvePath(path),
      directory: Directory.Documents,
      recursive: options?.recursive,
    })
  }

  async stat(path: string): Promise<{ mtime: number; size: number }> {
    const result = await Filesystem.stat({
      path: this.resolvePath(path),
      directory: Directory.Documents,
    })
    return { mtime: result.mtime, size: result.size }
  }

  async rename(from: string, to: string): Promise<void> {
    await Filesystem.rename({
      from: this.resolvePath(from),
      to: this.resolvePath(to),
      directory: Directory.Documents,
    })
  }
}
