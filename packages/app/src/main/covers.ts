import { nativeImage, type NativeImage } from 'electron'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import type { Library } from '@banjuan/core'

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

/** The EPUB's cover image: EPUB 3 "cover-image" item, EPUB 2 <meta name="cover">, or an image named like a cover. */
export function epubCover(data: Uint8Array): NativeImage | null {
  const files = unzipSync(data, { filter: f => f.name.endsWith('.opf') || f.name === 'META-INF/container.xml' || /\.(jpe?g|png|gif|webp)$/i.test(f.name) })
  const container = files['META-INF/container.xml']
  const opfPath = container ? strFromU8(container).match(/full-path="([^"]+)"/)?.[1] : undefined
  if (!opfPath || !files[opfPath]) return null
  const opf = strFromU8(files[opfPath])
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const items = [...opf.matchAll(/<item\b[^>]*>/g)].map(m => {
    const tag = m[0]
    const attr = (n: string) => tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1]
    return { id: attr('id'), href: attr('href'), type: attr('media-type') ?? '', props: attr('properties') ?? '' }
  })
  const coverId = opf.match(/<meta\b[^>]*name="cover"[^>]*content="([^"]+)"/)?.[1] ?? opf.match(/<meta\b[^>]*content="([^"]+)"[^>]*name="cover"/)?.[1]
  const pick = items.find(i => /\bcover-image\b/.test(i.props))
    ?? items.find(i => coverId && i.id === coverId)
    ?? items.find(i => i.type.startsWith('image/') && /cover/i.test(`${i.id} ${i.href}`))
  if (!pick?.href) return null
  const bytes = files[dir + decodeURIComponent(pick.href)] ?? files[decodeURIComponent(pick.href)]
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
