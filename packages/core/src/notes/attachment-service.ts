import type { PlatformFS } from '../platform/index.js'
import { join, extname } from '../platform/path.js'

export class AttachmentService {
  private attachmentsDir: string

  constructor(private rootPath: string, private fs: PlatformFS) {
    this.attachmentsDir = join(rootPath, '.banjuan', 'attachments')
  }

  async save(noteId: string, fileName: string, data: Uint8Array): Promise<string> {
    const dir = join(this.attachmentsDir, noteId)
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
    const fullPath = join(this.rootPath, '.banjuan', relativePath)
    if (await this.fs.exists(fullPath)) await this.fs.remove(fullPath)
  }

  async deleteAllForNote(noteId: string): Promise<void> {
    const dir = join(this.attachmentsDir, noteId)
    if (await this.fs.exists(dir)) await this.fs.rmdir(dir, { recursive: true })
  }

  getFullPath(relativePath: string): string {
    return join(this.rootPath, '.banjuan', relativePath)
  }

  async list(noteId: string): Promise<string[]> {
    const dir = join(this.attachmentsDir, noteId)
    if (!(await this.fs.exists(dir))) return []
    return (await this.fs.readdir(dir)).map(f => `attachments/${noteId}/${f}`)
  }
}
