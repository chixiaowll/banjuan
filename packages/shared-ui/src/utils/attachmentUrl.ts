import type { BanjuanAPI } from '../api.js'

/** How notes store their attachments' URLs (the desktop serves this scheme). */
export const ATTACHMENT_URL_PREFIX = 'banjuan-attachment://'

/**
 * For BlockNote's `resolveFileUrl`: an attachment URL as this platform can
 * load it. The iPad web view has no handler for banjuan-attachment://, so
 * images and videos in notes didn't show there; it maps them to a local file
 * URL. Undefined where the stored URL already works (desktop).
 */
export function attachmentUrlResolver(api: BanjuanAPI): ((url: string) => Promise<string>) | undefined {
  const getSrc = api.attachments.getFileSrc
  if (!getSrc) return undefined
  return async (url: string) => {
    if (!url.startsWith(ATTACHMENT_URL_PREFIX)) return url
    try { return await getSrc(url.slice(ATTACHMENT_URL_PREFIX.length)) } catch { return url }
  }
}
