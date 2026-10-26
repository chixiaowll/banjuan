import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { registerPlugin } from '@capacitor/core'
import { zipSync } from 'fflate'
import type { Library } from '@banjuan/core'
import { readDocumentsFile } from '@banjuan/platform-capacitor'

/**
 * Exports on iPad. There's no folder to pick, so an export run writes into a
 * fresh folder under Documents/Exports (what dialog.openDirectory returns),
 * then finish() hands the result to the share sheet: one file as it is, more
 * as a zip. Paths here are relative to Documents.
 */

const FilePreview = registerPlugin<{
  share(options: { url: string }): Promise<{ completed: boolean }>
  htmlToPdf(options: { html: string; dest: string }): Promise<{ pages: number }>
}>('FilePreview')

export const EXPORTS_ROOT = 'Exports'
const KEEP_EXPORTS_MS = 24 * 60 * 60 * 1000
const ATTACHMENT_PREFIX = 'banjuan-attachment://'

const D = Directory.Documents
const uriOf = async (path: string) => (await Filesystem.getUri({ path, directory: D })).uri
const exists = (path: string) => Filesystem.stat({ path, directory: D }).then(() => true, () => false)
const safeName = (name: string) => name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled'

async function uniquePath(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let candidate = `${dir}/${name}`
  for (let i = 1; await exists(candidate); i++) candidate = `${dir}/${stem} (${i})${ext}`
  return candidate
}

/** A new, empty folder for one export run; older runs (a day+) are cleared. */
export async function newExportFolder(): Promise<string> {
  try {
    const { files } = await Filesystem.readdir({ path: EXPORTS_ROOT, directory: D })
    for (const f of files) {
      if (f.type === 'directory' && Date.now() - Number(f.mtime ?? 0) > KEEP_EXPORTS_MS) {
        await Filesystem.rmdir({ path: `${EXPORTS_ROOT}/${f.name}`, directory: D, recursive: true }).catch(() => {})
      }
    }
  } catch { /* no exports yet */ }
  const dir = `${EXPORTS_ROOT}/${new Date().toISOString().replace(/[:.]/g, '-')}`
  await Filesystem.mkdir({ path: dir, directory: D, recursive: true })
  return dir
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1)

export async function exportMarkdown(lib: Library, input: { title: string; markdown: string; attachments: string[]; outputPath?: string; files?: Array<{ name: string; dataUrl: string }> }): Promise<string | null> {
  const dir = input.outputPath || await newExportFolder()
  const file = await uniquePath(dir, `${safeName(input.title)}.md`)
  await Filesystem.writeFile({ path: file, data: input.markdown, directory: D, encoding: Encoding.UTF8, recursive: true })
  if (input.attachments.length) await Filesystem.mkdir({ path: `${dir}/attachments`, directory: D, recursive: true }).catch(() => {})
  for (const rel of input.attachments) {
    try {
      const src = lib.attachments.getFullPath(rel)
      const name = rel.split('/').pop()!
      await Filesystem.copy({ from: src, to: await uniquePath(`${dir}/attachments`, name), directory: D, toDirectory: D })
    } catch (e) { console.warn('[export] attachment skipped', rel, e) }
  }
  for (const f of input.files ?? []) {
    await Filesystem.writeFile({ path: await uniquePath(`${dir}/images`, f.name), data: base64Of(f.dataUrl), directory: D, recursive: true })
  }
  return dir
}

const PDF_STYLE = `
  body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; margin: 0; padding: 0; color: #333; line-height: 1.8; font-size: 14px; }
  h1 { font-size: 24px; margin: 24px 0 16px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
  h2 { font-size: 20px; margin: 20px 0 12px; }
  h3 { font-size: 16px; margin: 16px 0 8px; }
  p { margin: 8px 0; }
  img { max-width: 100%; border-radius: 4px; break-inside: avoid; }
  .mindmap-export, .handwriting-export { break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  pre { background: #f6f8fa; padding: 12px 16px; border-radius: 6px; white-space: pre-wrap; font-size: 13px; }
  code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-size: 13px; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ddd; margin: 8px 0; padding: 4px 16px; color: #666; break-inside: avoid; }
  ul, ol { padding-left: 24px; }
  a { color: #0969da; text-decoration: none; }
`

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic' }

/** Attachment images inlined as data URLs: the PDF web view loads nothing from disk. */
async function inlineAttachments(lib: Library, html: string): Promise<string> {
  const urls = [...new Set(html.match(/banjuan-attachment:\/\/[^"')\s]+/g) ?? [])]
  for (const url of urls) {
    const rel = decodeURIComponent(url.slice(ATTACHMENT_PREFIX.length))
    try {
      const { data } = await Filesystem.readFile({ path: lib.attachments.getFullPath(rel), directory: D })
      const mime = MIME[rel.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
      html = html.split(url).join(`data:${mime};base64,${data as string}`)
    } catch (e) { console.warn('[export] image not inlined', rel, e) }
  }
  return html
}

export async function exportPdf(lib: Library, input: { title: string; html: string; outputPath?: string }): Promise<string | null> {
  const dir = input.outputPath || await newExportFolder()
  const file = await uniquePath(dir, `${safeName(input.title)}.pdf`)
  const body = await inlineAttachments(lib, input.html)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=595"><style>${PDF_STYLE}</style></head><body>${body}</body></html>`
  await FilePreview.htmlToPdf({ html, dest: await uriOf(file) })
  return dir
}

export async function exportFile(input: { outputPath: string; fileName: string; dataUrl?: string; text?: string }): Promise<string | null> {
  const file = await uniquePath(input.outputPath, safeName(input.fileName))
  if (input.text != null) {
    await Filesystem.writeFile({ path: file, data: input.text, directory: D, encoding: Encoding.UTF8, recursive: true })
  } else if (input.dataUrl) {
    const meta = input.dataUrl.slice(5, input.dataUrl.indexOf(','))
    const payload = base64Of(input.dataUrl)
    if (meta.includes('base64')) await Filesystem.writeFile({ path: file, data: payload, directory: D, recursive: true })
    else await Filesystem.writeFile({ path: file, data: decodeURIComponent(payload), directory: D, encoding: Encoding.UTF8, recursive: true })
  } else {
    return null
  }
  return file
}

/** Every file under `dir`, as paths relative to it. */
async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const { files } = await Filesystem.readdir({ path: dir, directory: D })
  const out: string[] = []
  for (const f of files) {
    if (f.type === 'directory') out.push(...await listFiles(`${dir}/${f.name}`, `${prefix}${f.name}/`))
    else out.push(`${prefix}${f.name}`)
  }
  return out
}

/** An export run into `dir` is done: share its one file, or a zip of all of them. */
export async function finishExport(dir: string): Promise<void> {
  if (!dir.startsWith(`${EXPORTS_ROOT}/`)) return
  const files = await listFiles(dir).catch(() => [])
  if (files.length === 0) return
  let target = `${dir}/${files[0]}`
  if (files.length > 1) {
    const entries: Record<string, Uint8Array> = {}
    for (const rel of files) {
      entries[rel] = await readDocumentsFile(`${dir}/${rel}`)
    }
    const zipped = zipSync(entries, { level: 6 })
    let binary = ''
    for (let i = 0; i < zipped.length; i += 0x8000) binary += String.fromCharCode(...zipped.subarray(i, i + 0x8000))
    // Named after the (first) exported note.
    const stem = files.find(f => !f.includes('/'))?.replace(/\.[^.]+$/, '') ?? 'export'
    target = await uniquePath(dir, `${safeName(stem)}.zip`)
    await Filesystem.writeFile({ path: target, data: btoa(binary), directory: D })
  }
  await FilePreview.share({ url: await uriOf(target) })
}
