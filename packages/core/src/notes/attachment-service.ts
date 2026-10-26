import type { PlatformFS } from '../platform/index.js'
import { join, extname } from '../platform/path.js'
import { isSafeId, isPlainRelPath } from '../storage/safe-path.js'

export class AttachmentService {
  private attachmentsDir: string

  constructor(private rootPath: string, private fs: PlatformFS) {
    this.attachmentsDir = join(rootPath, '.banjuan', 'attachments')
  }

  /** A note's attachment folder. The id may come from a synced note file, so it must be a plain id. */
  private noteDir(noteId: string): string {
    if (!isSafeId(noteId)) throw new Error(`Invalid note id: ${JSON.stringify(noteId)}`)
    return join(this.attachmentsDir, noteId)
  }

  async save(noteId: string, fileName: string, data: Uint8Array): Promise<string> {
    const dir = this.noteDir(noteId)
    await this.fs.mkdir(dir, { recursive: true })

    const ext = extname(fileName)
    const baseName = fileName.replace(ext, '')
    const ts = Date.now()
    const safeName = `${ts}-${baseName.replace(/[^a-zA-Z0-9_\-一-鿿]/g, '_')}${ext}`
    const fullPath = join(dir, safeName)

    await this.fs.writeFile(fullPath, data)
    return `attachments/${noteId}/${safeName}`
  }

  async delete(relativePath: string): Promise<void> {
    if (!relativePath.startsWith('attachments/')) throw new Error(`Not an attachment: ${relativePath}`)
    const fullPath = this.getFullPath(relativePath)
    if (await this.fs.exists(fullPath)) await this.fs.remove(fullPath)
  }

  async deleteAllForNote(noteId: string): Promise<void> {
    if (!isSafeId(noteId)) return
    const dir = this.noteDir(noteId)
    if (await this.fs.exists(dir)) await this.fs.rmdir(dir, { recursive: true })
  }

  /** Absolute path of an `attachments/...` path (relative to .banjuan); '' is the .banjuan folder itself. */
  getFullPath(relativePath: string): string {
    if (relativePath !== '' && !isPlainRelPath(relativePath)) throw new Error(`Invalid attachment path: ${relativePath}`)
    return join(this.rootPath, '.banjuan', relativePath)
  }

  async list(noteId: string): Promise<string[]> {
    if (!isSafeId(noteId)) return []
    const dir = this.noteDir(noteId)
    if (!(await this.fs.exists(dir))) return []
    return (await this.fs.readdir(dir)).map(f => `attachments/${noteId}/${f}`)
  }
}
