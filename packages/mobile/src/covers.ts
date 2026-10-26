import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import { epubCoverImage, type Library } from '@banjuan/core'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { readDocumentsFile } from '@banjuan/platform-capacitor'

/**
 * Document covers on iPad (the desktop has the OS thumbnailer, covers.ts
 * there): a PDF's first page rendered by pdf.js, an EPUB's own cover image,
 * an image document itself. Made once per file version and cached in
 * .banjuan/.cover-cache, like on the desktop (per device, never synced).
 */

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('@banjuan/zotero-pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
}

const WIDTH = 320
const MAX_EPUB_BYTES = 80 * 1024 * 1024
const inflight = new Map<string, Promise<string | null>>()
let queue: Promise<unknown> = Promise.resolve()   // one at a time: rendering is heavy on the web view

const uriOf = async (path: string) => (await Filesystem.getUri({ path, directory: Directory.Documents })).uri
const exists = (path: string) => Filesystem.stat({ path, directory: Directory.Documents }).then(() => true, () => false)

/** A URL of the document's cover, or null when there is none. */
export async function getCover(lib: Library, docId: string): Promise<string | null> {
  const doc = await lib.documents.get(docId)
  if (!doc) return null
  const docPath = `${lib.rootPath}/${doc.path}`
  if (doc.type === 'image') return (await exists(docPath)) ? Capacitor.convertFileSrc(await uriOf(docPath)) : null
  if (doc.type !== 'pdf' && doc.type !== 'epub') return null

  const dir = `${lib.rootPath}/.banjuan/.cover-cache`
  // The file's size and time are part of the key: the hash comes from the
  // path, so a file replaced in place used to keep its old cover for good.
  const st = await Filesystem.stat({ path: docPath, directory: Directory.Documents }).catch(() => null)
  const version = st ? `${st.size.toString(36)}-${Math.floor(st.mtime).toString(36)}` : 'missing'
  const base = `${doc.id}.${(doc.hash || 'nohash').slice(0, 16)}.${version}`
  const file = `${dir}/${base}.jpg`
  if (await exists(file)) return Capacitor.convertFileSrc(await uriOf(file))
  if (await exists(`${dir}/${base}.none`)) return null   // tried: nothing to show

  let job = inflight.get(base)
  if (!job) {
    const run = queue.then(() => makeCover(docPath, doc.type, dir, base))
    queue = run.catch(() => {})
    job = run
      .catch(e => { console.warn('[covers]', doc.path, e); return null })
      .finally(() => inflight.delete(base))
    inflight.set(base, job)
  }
  return job
}

async function makeCover(docPath: string, type: string, dir: string, base: string): Promise<string | null> {
  if (!(await exists(docPath))) return null   // not downloaded yet — try again next time
  let jpeg: string | null = null
  try {
    jpeg = type === 'pdf' ? await pdfCover(docPath) : await epubCover(docPath)
  } catch (e) {
    console.warn('[covers] could not make a cover', docPath, e)
  }
  if (!jpeg) {
    await Filesystem.writeFile({ path: `${dir}/${base}.none`, data: '', directory: Directory.Documents, recursive: true }).catch(() => {})
    return null
  }
  const file = `${dir}/${base}.jpg`
  await Filesystem.writeFile({ path: file, data: jpeg, directory: Directory.Documents, recursive: true })
  return Capacitor.convertFileSrc(await uriOf(file))
}

/** Base64 JPEG of a canvas. */
function toJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? ''
}

async function pdfCover(docPath: string): Promise<string | null> {
  const doc = await pdfjsLib.getDocument({ url: Capacitor.convertFileSrc(await uriOf(docPath)), cMapUrl: '/bcmaps/', cMapPacked: true, standardFontDataUrl: '/standard_fonts/' }).promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: WIDTH / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const out = toJpeg(canvas)
    canvas.width = canvas.height = 0   // free the backing store right away
    return out || null
  } finally {
    await doc.destroy().catch(() => {})
  }
}

async function epubCover(docPath: string): Promise<string | null> {
  const { size } = await Filesystem.stat({ path: docPath, directory: Directory.Documents })
  if (size > MAX_EPUB_BYTES) return null
  const image = epubCoverImage(await readDocumentsFile(docPath))
  if (!image) return null
  const bitmap = await createImageBitmap(new Blob([image as BlobPart]))
  const scale = Math.min(1, WIDTH / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const out = toJpeg(canvas)
  canvas.width = canvas.height = 0
  return out || null
}
