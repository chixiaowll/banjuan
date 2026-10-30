import { v4 as uuid } from 'uuid'

/**
 * Tasks are the checkboxes (`checkListItem` blocks) of Markdown notes, nested
 * ones included — the note stays the only place a task lives; this reads them
 * out for the task index. A task is known by its block's own (hidden) id.
 *
 * Optional conventions in its text: a due date `📅 2026-11-05`, a done date
 * `✅ 2026-10-28`, a priority prefix `[P0]` (often bold), `#tags`.
 */

export interface ParsedTask {
  id: string
  /** Without the priority prefix and the date marks. */
  text: string
  done: boolean
  due: string | null
  doneDate: string | null
  priority: string | null
  tags: string[]
  /** Order in the note. */
  position: number
}

const DUE = /📅\s*(\d{4}-\d{2}-\d{2})/u
const DONE = /✅\s*(\d{4}-\d{2}-\d{2})/u
const PRIORITY = /^\s*\[(P\d)\]\s*/
const TAG = /(?:^|\s)#([^\s#,，。;；:：!！?？、]+)/gu

type Block = { id?: string; type?: string; props?: { checked?: boolean }; content?: unknown; children?: unknown[] }

/** The text of a block's inline content (links by their text, note / document chips by their title). */
export function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map(c => {
    const node = c as { text?: unknown; content?: unknown; props?: { title?: unknown } }
    if (typeof node?.text === 'string') return node.text
    if (typeof node?.props?.title === 'string') return node.props.title
    return inlineText(node?.content)
  }).join('')
}

export function parseTaskText(raw: string): Omit<ParsedTask, 'id' | 'done' | 'position'> {
  const priority = PRIORITY.exec(raw)?.[1] ?? null
  const due = DUE.exec(raw)?.[1] ?? null
  const doneDate = DONE.exec(raw)?.[1] ?? null
  const text = raw.replace(PRIORITY, '').replace(new RegExp(DUE.source, 'gu'), '').replace(new RegExp(DONE.source, 'gu'), '').replace(/\s+/g, ' ').trim()
  const tags = [...text.matchAll(TAG)].map(m => m[1])
  return { text, due, doneDate, priority, tags }
}

/** The tasks of a note, in document order. Checkboxes without an id are left out (see ensureTaskIds). */
export function extractTasks(blocks: unknown[]): ParsedTask[] {
  const out: ParsedTask[] = []
  const walk = (list: unknown[]) => {
    for (const b of list as Block[]) {
      if (!b || typeof b !== 'object') continue
      if (b.type === 'checkListItem' && typeof b.id === 'string' && b.id) {
        out.push({ id: b.id, done: !!b.props?.checked, position: out.length, ...parseTaskText(inlineText(b.content)) })
      }
      if (Array.isArray(b.children)) walk(b.children)
    }
  }
  walk(blocks)
  return out
}

/** Give every checkbox an id (blocks written by programs have none until the editor opens them). */
export function ensureTaskIds(blocks: unknown[]): { blocks: unknown[]; changed: boolean } {
  let changed = false
  const fix = (list: unknown[]): unknown[] => list.map(item => {
    const b = item as Block
    if (!b || typeof b !== 'object') return item
    const children = Array.isArray(b.children) ? fix(b.children) : b.children
    const needsId = b.type === 'checkListItem' && !b.id
    if (!needsId && children === b.children) return item
    if (needsId) changed = true
    return { ...b, ...(needsId ? { id: uuid() } : {}), ...(children !== b.children ? { children } : {}) }
  })
  const out = fix(blocks)
  return { blocks: changed ? out : blocks, changed }
}
