import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { createExtension } from '@blocknote/core'

/**
 * Task lines (checkboxes) show their marks as small chips: the due date
 * (coloured by how near it is), the done and created dates, the priority and
 * #tags. Links to tasks (banjuan://task/…) show when the task is done: struck
 * through, with a "✓ done" mark after. Decorations only — the text stays what
 * it is, editable as ever and the same in Markdown (the editor would undo any
 * class or attribute put on its own DOM).
 */

export interface TaskChipLabels {
  /** "Due Nov 5" etc., for the tooltip. */
  due: (date: string, daysLeft: number, done: boolean) => string
  done: (date: string) => string
  created: (date: string) => string
  /** After a link to a done task. */
  doneMark: string
}

type ChipState = { statuses: Map<string, boolean>; decos: DecorationSet }
const KEY = new PluginKey<ChipState>('banjuanTaskChips')
const TASK_LINK = /^banjuan:\/\/task\/([A-Za-z0-9-]+)/

/** The tasks this document links to. */
export function taskLinkIds(doc: PMNode): string[] {
  const ids = new Set<string>()
  doc.descendants(node => {
    for (const m of node.marks) {
      const id = m.type.name === 'link' ? TASK_LINK.exec(String(m.attrs.href ?? ''))?.[1] : undefined
      if (id) ids.add(id)
    }
    return true
  })
  return [...ids]
}

/** Tell the editor which linked tasks are done (looked up by the caller). */
export function setTaskStatuses(view: EditorView, statuses: Map<string, boolean>): void {
  view.dispatch(view.state.tr.setMeta(KEY, statuses).setMeta('addToHistory', false))
}

const MARK = /(📅|✅|➕)\s*(\d{4}-\d{2}-\d{2})/gu
const PRIORITY = /^\s*(\[(P\d)\])/
const TAG = /(?:^|\s)(#[^\s#,，。;；:：!！?？、]+)/gu
const DAY = 86_400_000

const dayNumber = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Math.round(new Date(y, m - 1, d).getTime() / DAY) }
const todayNumber = () => { const n = new Date(); return Math.round(new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() / DAY) }

/** The text of an inline node, one character per position (an atom such as a note link counts as one). */
function lineText(node: PMNode): string {
  let s = ''
  node.forEach(child => { s += child.isText ? child.text ?? '' : '￼'.repeat(child.nodeSize) })
  return s
}

/** Links to done tasks in this block: struck through, a mark after each. */
function decorateTaskLinks(node: PMNode, start: number, statuses: Map<string, boolean>, labels: TaskChipLabels, decos: Decoration[]): void {
  let run: { id: string; href: string; end: number } | null = null
  const close = () => {
    if (!run || statuses.get(run.id) !== true) return
    const id = run.id
    decos.push(Decoration.widget(run.end, () => {
      const mark = document.createElement('span')
      mark.className = 'bj-task-done-badge'
      mark.textContent = labels.doneMark
      mark.contentEditable = 'false'
      return mark
    }, { side: 1, key: `done-${id}-${run.end}` }))
  }
  node.forEach((child, offset) => {
    const link = child.isText ? child.marks.find(m => m.type.name === 'link') : undefined
    const href = String(link?.attrs.href ?? '')
    const id = TASK_LINK.exec(href)?.[1]
    if (run && run.href !== href) { close(); run = null }
    if (!id) return
    if (statuses.get(id) === true) decos.push(Decoration.inline(start + offset, start + offset + child.nodeSize, { class: 'bj-task-link-done' }))
    run = { id, href, end: start + offset + child.nodeSize }
  })
  close()
}

function decorate(doc: PMNode, labels: TaskChipLabels, statuses: Map<string, boolean>): DecorationSet {
  const decos: Decoration[] = []
  const today = todayNumber()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const start = pos + 1
    if (statuses.size) decorateTaskLinks(node, start, statuses, labels, decos)
    if (node.type.name !== 'checkListItem') return false
    const text = lineText(node)
    const checked = node.attrs.checked === true || node.attrs.checked === 'true'
    const chip = (from: number, to: number, cls: string, title?: string) =>
      decos.push(Decoration.inline(start + from, start + to, { class: `bj-chip ${cls}`, ...(title ? { title } : {}) }))
    const p = PRIORITY.exec(text)
    if (p) chip(p.index + p[0].indexOf(p[1]), p.index + p[0].indexOf(p[1]) + p[1].length, `bj-chip-prio bj-prio-${p[2]}`)
    for (const m of text.matchAll(MARK)) {
      const [whole, mark, date] = m
      const at = m.index ?? 0
      if (mark === '📅') {
        const left = dayNumber(date) - today
        const state = checked ? 'done' : left < 0 ? 'overdue' : left === 0 ? 'today' : left <= 3 ? 'soon' : 'later'
        chip(at, at + whole.length, `bj-chip-due bj-due-${state}`, labels.due(date, left, checked))
      } else if (mark === '✅') {
        chip(at, at + whole.length, 'bj-chip-done', labels.done(date))
      } else {
        chip(at, at + whole.length, 'bj-chip-created', labels.created(date))
      }
    }
    for (const m of text.matchAll(TAG)) {
      const at = (m.index ?? 0) + m[0].indexOf(m[1])
      chip(at, at + m[1].length, 'bj-chip-tag')
    }
    return false
  })
  return DecorationSet.create(doc, decos)
}

export function taskChipsExtension(labels: TaskChipLabels) {
  return createExtension({
    key: 'banjuanTaskChips',
    prosemirrorPlugins: [new Plugin<ChipState>({
      key: KEY,
      state: {
        init: (_config, state) => ({ statuses: new Map(), decos: decorate(state.doc, labels, new Map()) }),
        apply: (tr, old) => {
          const statuses: Map<string, boolean> | undefined = tr.getMeta(KEY)
          if (!statuses && !tr.docChanged) return old
          const next = statuses ?? old.statuses
          return { statuses: next, decos: decorate(tr.doc, labels, next) }
        },
      },
      props: { decorations: state => KEY.getState(state)?.decos },
    })],
  })
}
