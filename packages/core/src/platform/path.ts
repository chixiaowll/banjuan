export function join(...parts: string[]): string {
  const joined = parts.filter(Boolean).join('/')
  return normalize(joined)
}

export function normalize(p: string): string {
  const parts = p.split('/')
  const result: string[] = []
  for (const part of parts) {
    if (part === '.' || part === '') continue
    if (part === '..' && result.length > 0 && result[result.length - 1] !== '..') {
      result.pop()
    } else {
      result.push(part)
    }
  }
  const normalized = result.join('/')
  return p.startsWith('/') ? '/' + normalized : normalized
}

export function dirname(p: string): string {
  const idx = p.lastIndexOf('/')
  if (idx === -1) return '.'
  if (idx === 0) return '/'
  return p.slice(0, idx)
}

export function basename(p: string, ext?: string): string {
  const base = p.slice(p.lastIndexOf('/') + 1)
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length)
  return base
}

export function extname(p: string): string {
  const base = basename(p)
  const idx = base.lastIndexOf('.')
  return idx <= 0 ? '' : base.slice(idx)
}

export function relative(from: string, to: string): string {
  const fromParts = from.split('/').filter(Boolean)
  const toParts = to.split('/').filter(Boolean)
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  const ups = fromParts.length - common
  const rest = toParts.slice(common)
  return [...Array(ups).fill('..'), ...rest].join('/')
}

export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}
