import type { RemoteFile } from '../types.js'

/**
 * Entries of a WebDAV `PROPFIND` (Depth: 1) response for `requestDir`, with
 * paths relative to the server URL the user configured. A server mounted below
 * "/" (Nextcloud: https://host/remote.php/dav/files/me) answers with full
 * hrefs; keeping that prefix produced paths that matched nothing in the library
 * and listed every subfolder at a doubled URL. Needs a DOMParser (WebView).
 */
export function parsePropfind(xml: string, requestDir: string, baseUrl: string): RemoteFile[] {
  const basePath = safeDecode(new URL(baseUrl + '/').pathname).replace(/\/+$/, '')
  const dirKey = requestDir.replace(/\/+$/, '') || '/'
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const responses = doc.getElementsByTagNameNS('DAV:', 'response')
  const results: RemoteFile[] = []
  for (let i = 0; i < responses.length; i++) {
    const resp = responses[i]
    const hrefText = resp.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent
    if (!hrefText) continue
    let path: string
    try { path = safeDecode(new URL(hrefText.trim(), baseUrl + '/').pathname) } catch { path = safeDecode(hrefText.trim()) }
    if (basePath && (path === basePath || path.startsWith(basePath + '/'))) path = path.slice(basePath.length) || '/'
    path = path.replace(/\/+$/, '') || '/'
    if (path === dirKey) continue   // the folder itself

    const lastmod = resp.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent
    const length = resp.getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent
    results.push({
      path,
      mtime: lastmod ? new Date(lastmod).getTime() || 0 : 0,
      size: length ? parseInt(length, 10) || 0 : 0,
      isDirectory: resp.getElementsByTagNameNS('DAV:', 'collection').length > 0,
    })
  }
  return results
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}
