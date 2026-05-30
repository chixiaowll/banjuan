import type { PlatformFS } from '../platform/index.js'
import type { AttachmentService } from './attachment-service.js'
import { join, basename, isAbsolute } from '../platform/path.js'

// ![alt](url) or ![alt](<url> "title") — captures alt, url, optional title.
const IMAGE_RE = /!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(\s+"[^"]*")?\s*\)/g

function isExternal(url: string): boolean {
  return /^(https?:|data:|banjuan-attachment:)/i.test(url)
}

/**
 * Copy local images referenced by markdown into the note's attachments and
 * rewrite their URLs to banjuan-attachment:// so they resolve inside the
 * library. Local paths are resolved relative to `baseDir` (the imported file's
 * directory). Remote (http/https/data) and already-imported URLs are left as-is.
 *
 * Returns the rewritten markdown (unchanged if there were no local images).
 */
export async function importMarkdownImages(
  fs: PlatformFS,
  attachments: AttachmentService,
  noteId: string,
  markdown: string,
  baseDir: string,
): Promise<string> {
  const urlMap = new Map<string, string>() // original url -> banjuan-attachment url
  for (const m of markdown.matchAll(IMAGE_RE)) {
    const rawUrl = m[2]
    if (urlMap.has(rawUrl) || isExternal(rawUrl)) continue
    let decoded: string
    try { decoded = decodeURIComponent(rawUrl) } catch { decoded = rawUrl }
    const abs = isAbsolute(decoded) ? decoded : join(baseDir, decoded)
    try {
      if (!(await fs.exists(abs))) continue
      const data = await fs.readFile(abs)
      const rel = await attachments.save(noteId, basename(abs), data)
      urlMap.set(rawUrl, `banjuan-attachment://${rel}`)
    } catch { /* skip unreadable image */ }
  }
  if (urlMap.size === 0) return markdown
  return markdown.replace(IMAGE_RE, (full, alt, url, title) => {
    const next = urlMap.get(url)
    return next ? `![${alt}](${next}${title ?? ''})` : full
  })
}
