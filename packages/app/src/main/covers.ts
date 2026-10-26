import { nativeImage, type NativeImage } from 'electron'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { epubCoverImage, type Library } from '@banjuan/core'

/**
 * Cover thumbnails of documents for the home page and the document list. Made
 * once per file version and cached in .banjuan/.cover-cache (per device, never
 * synced). PDFs, images, videos, web clips and text files go through the OS
 * thumbnailer (QuickLook / Windows Shell, which renders the first page); for an
 * EPUB the OS only has a generic icon, so its own cover image is used.
 */

export const COVER_CACHE_DIR = '.cover-cache'
const WIDTH = 320
const HEIGHT = 420
const OS_THUMBNAIL_TYPES = new Set(['pdf', 'image', 'video', 'html', 'md', 'txt'])
const osThumbnails = process.platform === 'darwin' || process.platform === 'win32'
const CONCURRENCY = 2

const inflight = new Map<string, Promise<string | null>>()
const pruned = new WeakSet<Library>()
let running = 0
const waiting: Array<() => void> = []

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) await new Promise<void>(resolve => waiting.push(resolve))
  running++
  try { return await fn() } finally {
    running--
    waiting.shift()?.()
  }
}

const coverUrl = (file: string) => `local-file://${encodeURIComponent(file)}`

/** A URL of the document's cover, or null when there is none (yet). */
export async function getCover(lib: Library, docId: string): Promise<string | null> {
  const doc = await lib.documents.get(docId)
  if (!doc || !(doc.type === 'epub' || (osThumbnails && OS_THUMBNAIL_TYPES.has(doc.type)))) return null
  const dir = join(lib.rootPath, '.banjuan', COVER_CACHE_DIR)
  if (!pruned.has(lib)) { pruned.add(lib); void prune(lib, dir) }
  const base = `${doc.id}.${(doc.hash || 'nohash').slice(0, 16)}`
  const file = join(dir, `${base}.jpg`)
  if (existsSync(file)) return coverUrl(file)
  if (existsSync(join(dir, `${base}.none`))) return null   // tried: nothing to show
  let job = inflight.get(base)
  if (!job) {
    job = limited(() => makeCover(join(lib.rootPath, doc.path), doc.type, dir, doc.id, base))
      .catch(e => { console.warn('[covers]', doc.path, e); return null })
      .finally(() => inflight.delete(base))
    inflight.set(base, job)
  }
  return job
}

async function makeCover(abs: string, type: string, dir: string, docId: string, base: string): Promise<string | null> {
  if (!existsSync(abs)) return null   // not downloaded yet — try again next time
  let img: NativeImage | null = null
  try {
    img = type === 'epub'
      ? epubCover(new Uint8Array(await readFile(abs)))
      : await nativeImage.createThumbnailFromPath(abs, { width: WIDTH, height: HEIGHT })
  } catch { img = null }
  mkdirSync(dir, { recursive: true })
  if (!img || img.isEmpty()) {
    await writeFile(join(dir, `${base}.none`), '')
    return null
  }
  const sized = img.getSize().width > WIDTH ? img.resize({ width: WIDTH, quality: 'good' }) : img
  const file = join(dir, `${base}.jpg`)
  await writeFile(file, sized.toJPEG(82))
  // Older versions of this document's cover.
  for (const f of readdirSync(dir)) {
    if (f.startsWith(`${docId}.`) && !f.startsWith(base)) try { unlinkSync(join(dir, f)) } catch { /* in use */ }
  }
  return coverUrl(file)
}

/** The EPUB's cover image (see core's epubCoverImage) as an image, or null. */
export function epubCover(data: Uint8Array): NativeImage | null {
  const bytes = epubCoverImage(data)
  if (!bytes) return null
  const img = nativeImage.createFromBuffer(Buffer.from(bytes))
  return img.isEmpty() ? null : img
}

/** Drop covers of documents that are gone. */
async function prune(lib: Library, dir: string): Promise<void> {
  if (!existsSync(dir)) return
  try {
    const ids = new Set((await lib.documents.list()).map(d => d.id))
    for (const f of readdirSync(dir)) {
      const id = f.split('.')[0]   // "<id>.<hash>.jpg"
      if (id && !ids.has(id)) try { unlinkSync(join(dir, f)) } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn('[covers] prune failed', e)
  }
}
