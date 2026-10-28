/**
 * Path and query of a local API request. The query is read the way
 * URLSearchParams writes it (the CLI and the MCP server do): `+` is a space —
 * decodeURIComponent alone kept it, so every multi-word search came back empty.
 */
export function parseUrl(raw: string): { path: string; query: Record<string, string> } {
  const i = raw.indexOf('?')
  const path = i < 0 ? raw : raw.slice(0, i)
  const query: Record<string, string> = {}
  if (i >= 0) {
    for (const [k, v] of new URLSearchParams(raw.slice(i + 1))) if (k) query[k] = v
  }
  return { path, query }
}
