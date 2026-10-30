import { v5 as uuidv5 } from 'uuid'

/**
 * Tasks are the checkboxes (`checkListItem` blocks) of Markdown notes, nested
 * ones included — the note stays the only place a task lives; this reads them
 * out for the task index. A task is known by its block's own (hidden) id; a
 * checkbox without one (written by a program, or an old note) gets an id made
 * from its note, text and place — the same one ensureTaskIds then stores, so
 * the index never has to rewrite notes on its own.
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

const TASK_ID_NAMESPACE = '6f1c7a52-3b0e-4f3a-9a64-7d2e1b5c9e10'

/**
 * Ids for the checkboxes that have none: from the note, the text and how many
 * id-less checkboxes with that text came before — stable until it is stored.
 */
function derivedIds(blocks: unknown[], noteId: string): Map<Block, string> {
  const ids = new Map<Block, string>()
  const seen = new Map<string, number>()
  const walk = (list: unknown[]) => {
    for (const b of list as Block[]) {
      if (!b || typeof b !== 'object') continue
      if (b.type === 'checkListItem' && !b.id) {
        const text = inlineText(b.content)
        const n = seen.get(text) ?? 0
        seen.set(text, n + 1)
        ids.set(b, uuidv5(`${noteId}\n${n}\n${text}`, TASK_ID_NAMESPACE))
      }
      if (Array.isArray(b.children)) walk(b.children)
    }
  }
  walk(blocks)
  return ids
}

/** The tasks of a note, in document order. */
export function extractTasks(blocks: unknown[], noteId: string): ParsedTask[] {
  const derived = derivedIds(blocks, noteId)
  const out: ParsedTask[] = []
  const walk = (list: unknown[]) => {
    for (const b of list as Block[]) {
      if (!b || typeof b !== 'object') continue
      if (b.type === 'checkListItem') {
        const id = typeof b.id === 'string' && b.id ? b.id : derived.get(b)!
        out.push({ id, done: !!b.props?.checked, position: out.length, ...parseTaskText(inlineText(b.content)) })
      }
      if (Array.isArray(b.children)) walk(b.children)
    }
  }
  walk(blocks)
  return out
}

/** Store the ids of checkboxes that have none — the same ones extractTasks gave them. */
export function ensureTaskIds(blocks: unknown[], noteId: string): { blocks: unknown[]; changed: boolean } {
  const derived = derivedIds(blocks, noteId)
  if (derived.size === 0) return { blocks, changed: false }
  const fix = (list: unknown[]): unknown[] => list.map(item => {
    const b = item as Block
    if (!b || typeof b !== 'object') return item
    const children = Array.isArray(b.children) ? fix(b.children) : b.children
    const id = derived.get(b)
    if (!id && children === b.children) return item
    return { ...b, ...(id ? { id } : {}), ...(children !== b.children ? { children } : {}) }
  })
  return { blocks: fix(blocks), changed: true }
}
