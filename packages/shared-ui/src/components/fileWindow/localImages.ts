/** Relative image links (`![](img/a.png)`, `<img src="a.png">`) as local-file:// URLs next to the file. */
export function withLocalImages(md: string, filePath: string): string {
  const dir = filePath.slice(0, filePath.lastIndexOf('/'))
  const resolve = (rel: string) => {
    if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(rel)) return rel   // absolute, a URL, or an anchor: as written
    const parts = dir.split('/')
    for (const seg of decodeURI(rel).split('/')) {
      if (seg === '..') parts.pop()
      else if (seg && seg !== '.') parts.push(seg)
    }
    return `local-file://${encodeURIComponent(parts.join('/'))}`
  }
  return md
    .replace(/(!\[[^\]]*\]\()\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?\s*\))/g, (_m, a, url, b) => `${a}${resolve(url)}${b}`)
    .replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (_m, a, url, b) => `${a}${resolve(url)}${b}`)
}
