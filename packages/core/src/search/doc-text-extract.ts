import { unzipSync, strFromU8 } from 'fflate'

/**
 * Text extraction from PDF / EPUB / plain-text / HTML files, shared by the
 * desktop (main process + background text-index process) and the iPad's
 * in-app indexer; the caller provides pdf.js.
 */

export interface PdfjsLocation {
  /** file:// URL of pdfjs-dist/legacy/build/pdf.mjs (pdf.worker.mjs must sit next to it). */
  pdfUrl: string
  /** Directory of pdfjs-dist/cmaps/, with a trailing slash — CJK fonts need these to map glyphs to text. */
  cMapDir: string
}

export interface ExtractedPage { page: number; text: string }
export interface ExtractedText { numPages: number; pages: ExtractedPage[] }

const pdfjsCache = new Map<string, Promise<any>>()
function loadPdfjs(loc: PdfjsLocation): Promise<any> {
  let p = pdfjsCache.get(loc.pdfUrl)
  if (!p) {
    p = import(/* @vite-ignore */ loc.pdfUrl)
    pdfjsCache.set(loc.pdfUrl, p)
  }
  return p
}

// CJK scripts are written without spaces between words.
const CJK = /[\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\uac00-\ud7af]/

/**
 * Many PDFs (Chrome / Skia output among them) map CJK glyphs to radical code
 * points that look identical to the real character: \u2F42 for 文, \u2EDA for 页.
 * Searching for 文 or 页 then finds nothing. NFKC folds the Kangxi radicals
 * (and the forms below); the CJK Radicals Supplement isn't covered by it, so those
 * go through Unicode's EquivalentUnifiedIdeograph.txt. Keep in sync with core's foldSearchText.
 */
// prettier-ignore
const RADICAL_SUPPLEMENT = [
  0x2e81, 0x5382, 0x2e82, 0x4e5b, 0x2e83, 0x4e5a, 0x2e84, 0x4e59, 0x2e85, 0x4ebb, 0x2e86, 0x5182,
  0x2e87, 0x20628, 0x2e88, 0x5200, 0x2e89, 0x5202, 0x2e8a, 0x535c, 0x2e8b, 0x353e, 0x2e8c, 0x5c0f,
  0x2e8d, 0x5c0f, 0x2e8e, 0x5140, 0x2e8f, 0x5c23, 0x2e90, 0x5c22, 0x2e91, 0x21bc2, 0x2e92, 0x5df3,
  0x2e93, 0x5e7a, 0x2e94, 0x5f51, 0x2e95, 0x2b739, 0x2e96, 0x5fc4, 0x2e97, 0x5fc3, 0x2e98, 0x624c,
  0x2e99, 0x6535, 0x2e9b, 0x65e1, 0x2e9c, 0x65e5, 0x2e9d, 0x6708, 0x2e9e, 0x6b7a, 0x2e9f, 0x6bcd,
  0x2ea0, 0x6c11, 0x2ea1, 0x6c35, 0x2ea2, 0x6c3a, 0x2ea3, 0x706c, 0x2ea4, 0x722b, 0x2ea5, 0x722b,
  0x2ea6, 0x4e2c, 0x2ea7, 0x725b, 0x2ea8, 0x72ad, 0x2ea9, 0x738b, 0x2eaa, 0x24d14, 0x2eab, 0x76ee,
  0x2eac, 0x793a, 0x2ead, 0x793b, 0x2eae, 0x25ad7, 0x2eaf, 0x7cf9, 0x2eb0, 0x7e9f, 0x2eb1, 0x7f53,
  0x2eb2, 0x7f52, 0x2eb3, 0x34c1, 0x2eb4, 0x5197, 0x2eb5, 0x2626b, 0x2eb6, 0x7f8a, 0x2eb7, 0x2634c,
  0x2eb8, 0x2634b, 0x2eb9, 0x8002, 0x2eba, 0x8080, 0x2ebb, 0x807f, 0x2ebc, 0x8089, 0x2ebd, 0x26951,
  0x2ebe, 0x8279, 0x2ebf, 0x8279, 0x2ec0, 0x8279, 0x2ec1, 0x864e, 0x2ec2, 0x8864, 0x2ec3, 0x8980,
  0x2ec4, 0x897f, 0x2ec5, 0x89c1, 0x2ec6, 0x89d2, 0x2ec7, 0x278b2, 0x2ec8, 0x8ba0, 0x2ec9, 0x8d1d,
  0x2eca, 0x27fb7, 0x2ecb, 0x8f66, 0x2ecc, 0x8fb6, 0x2ecd, 0x8fb6, 0x2ece, 0x8fb6, 0x2ecf, 0x9091,
  0x2ed0, 0x9485, 0x2ed1, 0x9577, 0x2ed2, 0x9578, 0x2ed3, 0x957f, 0x2ed4, 0x95e8, 0x2ed5, 0x28e0f,
  0x2ed6, 0x961d, 0x2ed7, 0x96e8, 0x2ed8, 0x9752, 0x2ed9, 0x97e6, 0x2eda, 0x9875, 0x2edb, 0x98ce,
  0x2edc, 0x98de, 0x2edd, 0x98df, 0x2ede, 0x2967f, 0x2edf, 0x98e0, 0x2ee0, 0x9963, 0x2ee1, 0x29810,
  0x2ee2, 0x9a6c, 0x2ee3, 0x9aa8, 0x2ee4, 0x9b3c, 0x2ee5, 0x9c7c, 0x2ee6, 0x9e1f, 0x2ee7, 0x5364,
  0x2ee8, 0x9ea6, 0x2ee9, 0x9ec4, 0x2eea, 0x9efe, 0x2eeb, 0x6589, 0x2eec, 0x9f50, 0x2eed, 0x6b6f,
  0x2eee, 0x9f7f, 0x2eef, 0x7adc, 0x2ef0, 0x9f99, 0x2ef1, 0x9f9c, 0x2ef2, 0x4e80, 0x2ef3, 0x9f9f,
]
const RADICALS = new Map<number, string>()
for (let i = 0; i < RADICAL_SUPPLEMENT.length; i += 2) RADICALS.set(RADICAL_SUPPLEMENT[i], String.fromCodePoint(RADICAL_SUPPLEMENT[i + 1]))

/**
 * NFKC only where it makes text comparable — Kangxi radicals, compatibility
 * ideographs, full-width letters and digits, Latin ligatures. Chinese
 * punctuation (，。：) stays as written; plain NFKC turned it into ASCII.
 */
const NFKC_FOLD = /[\u2f00-\u2fdf\uf900-\ufaff\ufb00-\ufb06\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/g

export function normalizeText(text: string): string {
  return text
    .replace(NFKC_FOLD, ch => ch.normalize('NFKC'))
    .replace(/[\u2e80-\u2eff]/g, ch => RADICALS.get(ch.codePointAt(0)!) ?? ch)
}

interface TextItem { str?: string; hasEOL?: boolean; transform?: number[]; width?: number; height?: number }

/**
 * Join pdf.js text items into readable text. Items are runs of glyphs; between
 * them goes a space only where there was a visible gap or a line break — and
 * never between two CJK characters (joining with spaces turned 机器学习 into
 * "机 器 学 习", which no search could find).
 */
export function joinTextItems(items: TextItem[]): string {
  let out = ''
  let prev: { x1: number; y: number; h: number } | null = null
  let lineBreak = false
  for (const it of items) {
    const s = typeof it.str === 'string' ? it.str : ''
    if (s) {
      const last = out[out.length - 1]
      const first = s[0]
      if (last && !/\s/.test(last) && !/\s/.test(first)) {
        const bothCjk = CJK.test(last) && CJK.test(first)
        let space = false
        if (lineBreak) space = !bothCjk
        else if (prev && it.transform) {
          const h = prev.h || 10
          const sameLine = Math.abs(it.transform[5] - prev.y) < h * 0.5
          space = !bothCjk && (!sameLine || it.transform[4] - prev.x1 > h * 0.15)
        }
        if (space) out += ' '
      }
      out += s
      if (it.transform) prev = { x1: it.transform[4] + (it.width ?? 0), y: it.transform[5], h: Math.abs(it.height || it.transform[3] || 0) }
      lineBreak = false
    }
    if (it.hasEOL) lineBreak = true
  }
  return out.replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

/**
 * PDF text with a given pdf.js: the desktop loads its own copy (extractPdf);
 * the iPad passes the viewer's, and a file URL instead of the bytes.
 */
export async function extractPdfWith(
  pdfjs: any, source: { data?: Uint8Array; url?: string; cMapUrl?: string },
  opts: { fromPage?: number; toPage?: number; maxPages?: number; onPage?: () => Promise<void> } = {},
): Promise<ExtractedText> {
  const { cMapUrl, ...src } = source
  const doc = await pdfjs.getDocument({
    ...src, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true,
    ...(cMapUrl ? { cMapUrl, cMapPacked: true } : {}),
  }).promise
  try {
    const numPages: number = doc.numPages
    const start = Math.max(1, Math.min(opts.fromPage || 1, numPages))
    let end = Math.max(start, Math.min(opts.toPage ?? numPages, numPages))
    if (opts.maxPages) end = Math.min(end, start + opts.maxPages - 1)
    const pages: ExtractedPage[] = []
    for (let p = start; p <= end; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      pages.push({ page: p, text: normalizeText(joinTextItems(tc.items)) })
      try { page.cleanup() } catch { /* ignore */ }
      await opts.onPage?.()
    }
    return { numPages, pages }
  } finally {
    try { await doc.destroy() } catch { /* ignore */ }
  }
}

export async function extractPdf(
  data: Uint8Array, loc: PdfjsLocation,
  opts: { fromPage?: number; toPage?: number; maxPages?: number } = {},
): Promise<ExtractedText> {
  return extractPdfWith(await loadPdfjs(loc), { data, cMapUrl: loc.cMapDir }, opts)
}

// Inline markup sits inside a word: removing it must not insert a space —
// "<b>深度</b>学习" is one word, and searching for it used to fail.
const INLINE_TAGS = 'a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|font|i|ins|kbd|label|mark|q|rb|ruby|s|samp|small|span|strike|strong|sub|sup|time|tt|u|var|wbr'

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(rt|rp)\b[\s\S]*?<\/\1>/gi, '')   // ruby readings: not part of the text
    .replace(new RegExp(`</?(?:${INLINE_TAGS})\\b[^>]*>`, 'gi'), '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/** EPUB: one "page" per spine item (chapter), 1-based. */
export function extractEpub(data: Uint8Array, opts: { fromPage?: number; toPage?: number } = {}): ExtractedText {
  const files = unzipSync(data)
  const container = files['META-INF/container.xml']
  const opfPath = container ? strFromU8(container).match(/full-path="([^"]+)"/)?.[1] : undefined
  if (!opfPath || !files[opfPath]) throw new Error('Invalid EPUB: missing OPF')
  const opf = strFromU8(files[opfPath])
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const manifest: Record<string, string> = {}
  for (const m of opf.matchAll(/<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"[^>]*>/g)) manifest[m[1]] = m[2]
  for (const m of opf.matchAll(/<item\b[^>]*\bhref="([^"]+)"[^>]*\bid="([^"]+)"[^>]*>/g)) if (!manifest[m[2]]) manifest[m[2]] = m[1]
  const spine = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)].map(m => m[1])
  const hrefs = spine.map(id => manifest[id]).filter(Boolean)
  if (hrefs.length === 0) throw new Error('Invalid EPUB: empty spine')

  const numPages = hrefs.length
  const start = Math.max(1, Math.min(opts.fromPage || 1, numPages))
  const end = Math.max(start, Math.min(opts.toPage ?? numPages, numPages))
  const pages: ExtractedPage[] = []
  for (let i = start; i <= end; i++) {
    const href = decodeURIComponent(hrefs[i - 1])
    const entry = files[opfDir + href] || files[href]
    pages.push({ page: i, text: entry ? normalizeText(stripHtml(strFromU8(entry))) : '' })
  }
  return { numPages, pages }
}

export function extractPlain(data: Uint8Array, type: string): ExtractedText {
  const raw = new TextDecoder('utf-8').decode(data)
  const text = type === 'html' ? stripHtml(raw) : raw.replace(/\r\n/g, '\n').trim()
  return { numPages: 1, pages: [{ page: 1, text: normalizeText(text) }] }
}
