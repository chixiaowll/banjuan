/** Query → terms, the same way the search service splits it (whitespace, case-insensitive). */
export function searchTerms(query: string): string[] {
  return [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))]
}

/** Split text into plain / matched runs for rendering search hits. */
export function highlightParts(text: string, terms: string[]): Array<{ text: string; hit: boolean }> {
  const lower = text.toLowerCase()
  const sorted = [...terms].filter(Boolean).sort((a, b) => b.length - a.length)
  const parts: Array<{ text: string; hit: boolean }> = []
  let plain = ''
  for (let i = 0; i < text.length;) {
    const term = sorted.find(t => lower.startsWith(t, i))
    if (term) {
      if (plain) { parts.push({ text: plain, hit: false }); plain = '' }
      parts.push({ text: text.slice(i, i + term.length), hit: true })
      i += term.length
    } else {
      plain += text[i++]
    }
  }
  if (plain || parts.length === 0) parts.push({ text: plain, hit: false })
  return parts
}
