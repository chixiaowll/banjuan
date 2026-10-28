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

export function upsertSection(
  blocks: unknown[],
  opts: { heading: SectionHeading; content: unknown[]; mode?: 'replace' | 'append'; newAt?: 'top' | 'bottom' },
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
  const at = opts.newAt === 'top' ? list.findIndex(b => levelOf(b) === heading.level) : -1
  return at >= 0 ? [...list.slice(0, at), ...section, ...list.slice(at)] : [...list, ...section]
}
