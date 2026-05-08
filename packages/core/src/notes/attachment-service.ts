import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, rmSync } from 'node:fs'
import { join, extname } from 'node:path'

export class AttachmentService {
  private attachmentsDir: string

  constructor(private rootPath: string) {
    this.attachmentsDir = join(rootPath, '.banjuan', 'attachments')
  }

  async save(noteId: string, fileName: string, data: Buffer): Promise<string> {
    const dir = join(this.attachmentsDir, noteId)
    mkdirSync(dir, { recursive: true })

    const ext = extname(fileName)
    const baseName = fileName.replace(ext, '')
    const ts = Date.now()
    const safeName = `${ts}-${baseName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_')}${ext}`
    const fullPath = join(dir, safeName)

    writeFileSync(fullPath, data)
    return `attachments/${noteId}/${safeName}`
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = join(this.rootPath, '.banjuan', relativePath)
    if (existsSync(fullPath)) unlinkSync(fullPath)
  }

  async deleteAllForNote(noteId: string): Promise<void> {
    const dir = join(this.attachmentsDir, noteId)
    if (existsSync(dir)) rmSync(dir, { recursive: true })
  }

  getFullPath(relativePath: string): string {
    return join(this.rootPath, '.banjuan', relativePath)
  }

  async list(noteId: string): Promise<string[]> {
    const dir = join(this.attachmentsDir, noteId)
    if (!existsSync(dir)) return []
    return readdirSync(dir).map(f => `attachments/${noteId}/${f}`)
  }
}
