/**
 * An HTML file shown in a single-file window: decoded in the charset it
 * declares, with a <base> in its own folder so its relative stylesheets and
 * images load over local-file:// (which serves those and nothing else next to
 * it — FileWindowRegistry.isServable). Its scripts never run: the viewer's
 * frame is sandboxed without them.
 */
export function htmlPageForFile(bytes: Uint8Array, filePath: string): string {
  const dir = filePath.replace(/[\\/][^\\/]*$/, '')
  return withBase(decodeHtml(bytes), `local-file://${dir.split(/[\\/]/).map(encodeURIComponent).join('/')}/`)
}

function decodeHtml(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  const declared = /<meta\b[^>]*\bcharset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1]
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8'
    : bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : undefined
  try {
    return new TextDecoder(bom ?? declared ?? 'utf-8').decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)   // a charset the browser doesn't know
  }
}

function withBase(html: string, href: string): string {
  if (/<base\b[^>]*\bhref\s*=/i.test(html)) return html   // the page's own
  const tag = `<base href="${href}">`
  for (const re of [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype\b[^>]*>/i]) {
    const m = re.exec(html)
    if (m) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length)
  }
  return tag + html
}
