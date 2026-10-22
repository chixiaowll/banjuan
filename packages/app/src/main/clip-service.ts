import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Library } from '@banjuan/core'

/**
 * Web clips from the browser extension. Each clip becomes an HTML document in
 * `documents/web-clips/<date>-<title>/index.html`. The extension sends the
 * readable article (or the selection) as a standalone page; images are
 * downloaded here and inlined so the clip still shows them offline.
 */

export interface ClipInput {
  url: string
  title: string
  html: string
  selectedText?: string
  tags?: string[]
  /** 'article' = readable content, 'selection' = the selected part, 'page' = the raw page (older clippers). */
  mode?: 'article' | 'selection' | 'page'
  byline?: string | null
  siteName?: string | null
  excerpt?: string | null
}

type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>

const MAX_IMAGES = 40
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 15_000
const IMAGE_CONCURRENCY = 4

export async function saveClip(library: Library, input: ClipInput, fetcher: Fetcher = fetch): Promise<{ id: string; title: string }> {
  if (!input || typeof input.url !== 'string' || typeof input.html !== 'string') throw new Error('url and html are required')
  const title = (input.title || input.url).trim().slice(0, 200)
  const date = new Date().toISOString().slice(0, 10)
  const clipsDir = join(library.rootPath, 'documents', 'web-clips')
  const clipDir = join(clipsDir, freeName(clipsDir, `${date}-${clipSlug(title)}`))
  mkdirSync(clipDir, { recursive: true })

  const html = await inlineImages(stripScripts(input.html), input.url, fetcher)
  writeFileSync(join(clipDir, 'index.html'), html, 'utf-8')
  writeFileSync(join(clipDir, 'metadata.json'), JSON.stringify({
    url: input.url,
    title,
    savedAt: new Date().toISOString(),
    mode: input.mode ?? 'page',
    byline: input.byline ?? null,
    siteName: input.siteName ?? null,
    excerpt: input.excerpt ?? null,
    selectedText: input.selectedText ?? null,
  }, null, 2), 'utf-8')

  const doc = await library.documents.import(join(clipDir, 'index.html'), { title })

  const tags = (input.tags ?? []).map(t => String(t).trim()).filter(Boolean)
  if (tags.length) {
    const existing = new Set((await library.tags.list()).map(t => t.name))
    for (const tag of tags) if (!existing.has(tag)) await library.tags.create({ name: tag })
    await library.tags.assign(doc.id, 'document', tags)
  }

  return { id: doc.id, title: doc.title }
}

/** A directory-name-safe slug in any script ("東京の天気" stays readable); never empty. */
export function clipSlug(title: string): string {
  const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')
  return slug || 'clip'
}

/** `name`, or `name-2`, `name-3`… — two clips of the same page on one day used to overwrite each other. */
function freeName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name
  for (let i = 2; ; i++) if (!existsSync(join(dir, `${name}-${i}`))) return `${name}-${i}`
}

/** Scripts never run in the viewer (sandboxed iframe); drop them so the clip stays small. */
export function stripScripts(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '')
}

/**
 * Download the page's images and inline them as data: URIs. An image that fails
 * (blocked, too big, timeout) keeps its remote URL. `srcset` / `sizes` are
 * dropped on inlined images so the browser doesn't prefer the remote variants.
 */
export async function inlineImages(html: string, pageUrl: string, fetcher: Fetcher): Promise<string> {
  const tagRe = /<img\b[^>]*>/gi
  const urls: string[] = []
  for (const m of html.matchAll(tagRe)) {
    const abs = absoluteUrl(attr(m[0], 'src'), pageUrl)
    if (abs && !urls.includes(abs)) urls.push(abs)
    if (urls.length >= MAX_IMAGES) break
  }
  if (!urls.length) return html

  const inlined = new Map<string, string>()
  let total = 0
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]
      const dataUri = await download(url, pageUrl, fetcher)
      if (!dataUri || total + dataUri.length > MAX_TOTAL_BYTES * 1.4) continue
      total += dataUri.length
      inlined.set(url, dataUri)
    }
  }
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, urls.length) }, worker))

  return html.replace(tagRe, (tag) => {
    const abs = absoluteUrl(attr(tag, 'src'), pageUrl)
    const dataUri = abs && inlined.get(abs)
    if (!dataUri) return tag
    return setAttr(removeAttr(removeAttr(tag, 'srcset'), 'sizes'), 'src', dataUri)
  })
}

async function download(url: string, pageUrl: string, fetcher: Fetcher): Promise<string | null> {
  try {
    const res = await fetcher(url, {
      headers: { Referer: pageUrl, Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8' },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/')) return null
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function absoluteUrl(src: string | null, base: string): string | null {
  if (!src || src.startsWith('data:')) return null
  try {
    const u = new URL(src.replace(/&amp;/g, '&'), base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

const attrRe = (name: string) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')

function attr(tag: string, name: string): string | null {
  const m = tag.match(attrRe(name))
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null
}

function removeAttr(tag: string, name: string): string {
  return tag.replace(attrRe(name), '')
}

function setAttr(tag: string, name: string, value: string): string {
  const quoted = `"${value.replace(/"/g, '&quot;')}"`
  return attrRe(name).test(tag)
    ? tag.replace(attrRe(name), () => ` ${name}=${quoted}`)
    : tag.replace(/^<img\b/i, `<img ${name}=${quoted}`)
}
