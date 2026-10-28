/**
 * One section of a note, by its heading — for programs that add to a note
 * (a day in a work diary, a project's "current status") without rewriting the
 * rest of it. A section runs from its heading to the next heading of the same
 * level or higher. Only top-level blocks count; everything else is left as is.
 */

export interface SectionHeading {
  level: number
  text: string
}

type Block = { type?: string; props?: { level?: number }; content?: unknown }

/** "## 20261028" → { level: 2, text: '20261028' }. Levels past 3 become 3 (the editor has three). */
export function parseHeadingLine(line: string): SectionHeading | null {
  const m = /^\s*(#{1,6})\s+(.*?)\s*$/.exec(line)
  if (!m || !m[2]) return null
  return { level: Math.min(m[1].length, 3), text: m[2] }
}

function plainText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map(c => {
    const node = c as { type?: string; text?: string; content?: unknown; props?: { title?: string } }
    if (typeof node?.text === 'string') return node.text
    if (node?.props?.title) return node.props.title
    return plainText(node?.content)
  }).join('')
}

const levelOf = (b: Block) => (b?.type === 'heading' ? Number(b.props?.level) || 1 : 0)

/** Headings that are dates (20261028, 2026-10-28) sort newest first unless told otherwise. */
const DATE_LIKE = /^\d{4}-?\d{2}-?\d{2}\b/

export function upsertSection(
  blocks: unknown[],
  opts: {
    heading: SectionHeading
    content: unknown[]
    mode?: 'replace' | 'append'
    /** Where a missing section goes: before the first of its level, at the end, or where it sorts among its level. */
    newAt?: 'top' | 'bottom' | 'sorted'
    /** For 'sorted' (default: newest first for dates, else A→Z). */
    order?: 'asc' | 'desc'
  },
): unknown[] {
  const { heading, content } = opts
  const list = blocks as Block[]
  const start = list.findIndex(b => levelOf(b) === heading.level && plainText(b.content).trim() === heading.text.trim())
  if (start >= 0) {
    let end = start + 1
    while (end < list.length && !(levelOf(list[end]) > 0 && levelOf(list[end]) <= heading.level)) end++
    const body = opts.mode === 'append' ? [...list.slice(start + 1, end), ...content] : content
    return [...list.slice(0, start + 1), ...body, ...list.slice(end)]
  }
  const section = [
    { type: 'heading', props: { level: heading.level }, content: [{ type: 'text', text: heading.text, styles: {} }], children: [] },
    ...content,
  ]
  const at = opts.newAt === 'top' ? list.findIndex(b => levelOf(b) === heading.level)
    : opts.newAt === 'sorted' ? sortedPosition(list, heading, opts.order)
    : -1
  return at >= 0 ? [...list.slice(0, at), ...section, ...list.slice(at)] : [...list, ...section]
}

/** Where a new section sorts among those of its level: before the first it comes before, else after the last of them. */
function sortedPosition(list: Block[], heading: SectionHeading, order?: 'asc' | 'desc'): number {
  const desc = (order ?? (DATE_LIKE.test(heading.text.trim()) ? 'desc' : 'asc')) === 'desc'
  const text = heading.text.trim()
  let last = -1
  for (let i = 0; i < list.length; i++) {
    if (levelOf(list[i]) !== heading.level) continue
    const cmp = text.localeCompare(plainText(list[i].content).trim(), undefined, { numeric: true })
    if (desc ? cmp > 0 : cmp < 0) return i
    last = i
  }
  if (last < 0) return -1
  // After the last section of this level: up to the next heading of a higher level.
  let end = last + 1
  while (end < list.length && !(levelOf(list[end]) > 0 && levelOf(list[end]) < heading.level)) end++
  return end
}
