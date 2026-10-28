/** A `--pages` value: "3" or "3-5" (1-based, inclusive). Null when malformed. */
export function parsePageRange(s: string): { from: number; to: number } | null {
  const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(s)
  if (!m) return null
  const from = Number(m[1])
  const to = m[2] ? Number(m[2]) : from
  return from >= 1 && to >= from ? { from, to } : null
}
