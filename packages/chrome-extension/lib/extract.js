/**
 * Runs inside the page via chrome.scripting.executeScript, after
 * vendor/Readability.js has been injected — so it must be self-contained (no
 * references to anything outside the function).
 *
 * mode 'selection': the selected part of the page; anything else: the readable
 * article (Readability), falling back to the cleaned-up page body.
 * Returns a standalone HTML page (absolute URLs, no scripts / forms / iframes)
 * plus metadata for the app's /api/clip.
 */
export function extractPage(mode) {
  const pageUrl = location.href
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // An inert document: nothing in it loads or runs while we work on it.
  const inert = document.implementation.createHTMLDocument('')
  const abs = (v) => { try { return new URL(v, document.baseURI).href } catch { return v } }

  const clean = (root) => {
    for (const img of root.querySelectorAll('img')) {
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src')
      const src = img.getAttribute('src')
      if (lazy && (!src || src.startsWith('data:'))) img.setAttribute('src', lazy)
    }
    for (const el of root.querySelectorAll('script, style, noscript, iframe, object, embed, form, button, input, select, textarea, link, meta, svg[aria-hidden="true"]')) el.remove()
    for (const el of root.querySelectorAll('*')) {
      for (const a of [...el.attributes]) {
        if (/^on/i.test(a.name)) el.removeAttribute(a.name)
        else if (a.name === 'href' && /^\s*javascript:/i.test(a.value)) el.removeAttribute('href')
        else if ((a.name === 'src' || a.name === 'href' || a.name === 'poster') && a.value && !a.value.startsWith('#') && !/^(data|mailto|tel):/i.test(a.value)) el.setAttribute(a.name, abs(a.value))
        else if (a.name === 'srcset') el.setAttribute('srcset', a.value.split(',').map((part) => {
          const [u, d] = part.trim().split(/\s+/, 2)
          return u ? abs(u) + (d ? ' ' + d : '') : ''
        }).filter(Boolean).join(', '))
      }
    }
    return root
  }

  const selection = window.getSelection()
  const selectedText = selection ? selection.toString() : ''
  let title = (document.title || '').trim() || pageUrl
  let byline = null, siteName = null, excerpt = null, body = '', used = 'article'

  if (mode === 'selection' && selection && selection.rangeCount && selectedText.trim()) {
    used = 'selection'
    const box = inert.createElement('div')
    for (let i = 0; i < selection.rangeCount; i++) box.appendChild(inert.importNode(selection.getRangeAt(i).cloneContents(), true))
    body = clean(box).innerHTML
  } else {
    let article = null
    try {
      // eslint-disable-next-line no-undef
      if (typeof Readability === 'function') article = new Readability(document.cloneNode(true)).parse()
    } catch { /* fall back to the page body */ }
    if (article && article.content && (article.textContent || '').trim().length > 80) {
      const box = inert.createElement('div')
      box.innerHTML = article.content
      body = clean(box).innerHTML
      title = (article.title || '').trim() || title
      byline = article.byline || null
      siteName = article.siteName || null
      excerpt = article.excerpt || null
    } else {
      used = 'page'
      const box = inert.importNode(document.body, true)
      for (const el of box.querySelectorAll('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]')) el.remove()
      body = clean(box).innerHTML
    }
  }

  const host = (() => { try { return new URL(pageUrl).hostname } catch { return pageUrl } })()
  const lang = document.documentElement.getAttribute('lang') || ''
  const html = `<!DOCTYPE html>
<html${lang ? ` lang="${esc(lang)}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="banjuan-clip-source" content="${esc(pageUrl)}">
<style>
  body { margin: 0; background: #fff; color: #222; font: 17px/1.75 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif; }
  article { max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; overflow-wrap: break-word; }
  header { margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid #eee; }
  h1 { font-size: 1.8em; line-height: 1.3; margin: 0 0 10px; }
  .clip-source { margin: 0; font-size: 13px; color: #888; }
  .clip-source a { color: inherit; }
  img, video { max-width: 100%; height: auto; }
  figure { margin: 1.5em 0; }
  figcaption { font-size: 13px; color: #888; text-align: center; }
  pre { overflow-x: auto; padding: 12px 14px; background: #f6f6f4; border-radius: 6px; font-size: 14px; line-height: 1.5; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.9em; }
  blockquote { margin: 1.2em 0; padding: 0 1em; border-left: 3px solid #ddd; color: #555; }
  table { border-collapse: collapse; max-width: 100%; display: block; overflow-x: auto; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; }
  a { color: #2563c9; }
</style>
</head>
<body>
<article>
<header>
<h1>${esc(title)}</h1>
<p class="clip-source">${byline ? `${esc(byline)} · ` : ''}<a href="${esc(pageUrl)}">${esc(siteName || host)}</a></p>
</header>
${body}
</article>
</body>
</html>`

  return { url: pageUrl, title, html, selectedText, mode: used, byline, siteName, excerpt }
}
