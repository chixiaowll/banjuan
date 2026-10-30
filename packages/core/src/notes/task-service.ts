import { v4 as uuid } from 'uuid'
import type { PlatformDatabase } from '../platform/index.js'
import { extractTasks, ensureTaskIds, parseTaskText, inlineText } from './tasks.js'
import { markdownToBlocks, parseBlockList } from './migration.js'
import { parseHeadingLine, upsertSection } from './sections.js'
import type { NoteService, NoteWriteOptions } from './service.js'

/**
 * The task index: every checkbox of every Markdown note (tasks.ts), so they
 * can be listed together and changed by id. The notes stay the only source —
 * this table is rebuilt from them, keeping only what the notes can't say: when
 * a task was first seen (for "open for N days") and when it was found done.
 * Writes go through the notes (with their history), never around them.
 */

export interface Task {
  id: string
  text: string
  done: boolean
  due: string | null
  priority: string | null
  /** Its first #tag, else the last part of its note's folder ('' at the top level). */
  project: string
  tags: string[]
  note: { id: string; title: string; folder: string }
  firstSeen: string
  doneAt: string | null
  position: number
}

export interface TaskFilter {
  /** Default 'open'. */
  status?: 'open' | 'done' | 'all'
  /** Exact project name, any case. */
  project?: string
  /** Due on or before (YYYY-MM-DD). */
  dueBefore?: string
  /** Done on or after (date or time). */
  doneSince?: string
  noteId?: string
}

export interface TaskChanges {
  text?: string
  /** YYYY-MM-DD, or null to clear. */
  due?: string | null
  /** P0–P9, or null to clear. */
  priority?: string | null
  /** Into another note (optionally a section of it, by its heading line). The task keeps its id. */
  moveTo?: { noteId: string; section?: string }
}

type Row = {
  id: string; note_id: string; text: string; done: number; due: string | null; priority: string | null
  project: string; tags: string | null; folder: string; first_seen: string; done_at: string | null; position: number
  note_title: string
}
type Block = { id?: string; type?: string; props?: Record<string, unknown>; content?: unknown[]; children?: unknown[] }

const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
const projectOf = (tags: string[], folder: string) => tags[0] ?? folder.slice(folder.lastIndexOf('/') + 1)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PRIORITY = /^P\d$/
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The text a task's line is written with: priority, words, due date, done date. */
function taskLine(text: string, due: string | null, priority: string | null, doneDate: string | null): string {
  return `${priority ? `**[${priority}]** ` : ''}${text}${due ? ` 📅 ${due}` : ''}${doneDate ? ` ✅ ${doneDate}` : ''}`
}

/** A task's line as inline content (Markdown inline styles and links honoured). */
function lineContent(line: string): unknown[] {
  const [block] = markdownToBlocks(`- [ ] ${line}`) as Block[]
  return block?.content ?? []
}

export class TaskService {
  private notes: NoteService | null = null

  constructor(private db: PlatformDatabase) {}

  setNotes(notes: NoteService): void { this.notes = notes }

  // --- Index ----------------------------------------------------------------

  /** Bring a note's tasks in the index up to date with its blocks. */
  indexNote(note: { id: string; path: string; type?: string }, blocks: unknown[], now = new Date().toISOString()): void {
    if (note.type && note.type !== 'markdown') { this.removeNote(note.id); return }
    const parsed = extractTasks(blocks, note.id)
    const folder = folderOf(note.path)
    const ids = parsed.map(p => p.id)
    const prev = new Map<string, Row>()
    for (const r of this.db.query<Row>('SELECT * FROM tasks WHERE note_id = ?', [note.id])) prev.set(r.id, r)
    // A task moved here from another note keeps when it was first seen.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      for (const r of this.db.query<Row>(`SELECT * FROM tasks WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk)) prev.set(r.id, r)
    }
    for (const r of prev.values()) {
      if (r.note_id === note.id && !ids.includes(r.id)) this.db.run('DELETE FROM tasks WHERE id = ?', [r.id])
    }
    for (const p of parsed) {
      const old = prev.get(p.id)
      const doneAt = !p.done ? null : p.doneDate ?? (old?.done && old.done_at ? old.done_at : now)
      this.db.run(
        `INSERT OR REPLACE INTO tasks (id, note_id, text, done, due, priority, project, tags, folder, first_seen, done_at, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, note.id, p.text, p.done ? 1 : 0, p.due, p.priority, projectOf(p.tags, folder), JSON.stringify(p.tags), folder, old?.first_seen ?? now, doneAt, p.position],
      )
    }
  }

  removeNote(noteId: string): void {
    this.db.run('DELETE FROM tasks WHERE note_id = ?', [noteId])
  }

  /** After reading every note again (a full rebuild): drop the tasks of notes that are gone, update the rest. */
  reconcileAll(notes: Array<{ id: string; path: string; type?: string; blocks: unknown[] }>): void {
    const keep = new Set(notes.map(n => n.id))
    for (const r of this.db.query<{ note_id: string }>('SELECT DISTINCT note_id FROM tasks')) {
      if (!keep.has(r.note_id)) this.removeNote(r.note_id)
    }
    for (const n of notes) this.indexNote(n, n.blocks)
  }

  /** After notes moved between folders in bulk: their tasks' folders and projects. */
  refreshFolders(): void {
    for (const r of this.db.query<{ id: string; tags: string | null; path: string }>('SELECT t.id, t.tags, n.path FROM tasks t JOIN notes n ON n.id = t.note_id')) {
      const folder = folderOf(r.path)
      const tags: string[] = r.tags ? JSON.parse(r.tags) : []
      this.db.run('UPDATE tasks SET folder = ?, project = ? WHERE id = ?', [folder, projectOf(tags, folder), r.id])
    }
  }

  // --- Reading ----------------------------------------------------------------

  list(filter: TaskFilter = {}): Task[] {
    const where: string[] = []
    const params: unknown[] = []
    const status = filter.status ?? 'open'
    if (status !== 'all') where.push(status === 'done' ? 't.done = 1' : 't.done = 0')
    if (filter.project !== undefined) { where.push('lower(t.project) = lower(?)'); params.push(filter.project) }
    if (filter.dueBefore) { where.push('t.due IS NOT NULL AND t.due <= ?'); params.push(filter.dueBefore) }
    if (filter.doneSince) { where.push('t.done_at IS NOT NULL AND t.done_at >= ?'); params.push(filter.doneSince) }
    if (filter.noteId) { where.push('t.note_id = ?'); params.push(filter.noteId) }
    const order = status === 'done'
      ? 't.done_at DESC, t.note_id, t.position'
      : "t.due IS NULL, t.due, t.priority IS NULL, t.priority, t.first_seen, t.note_id, t.position"
    const rows = this.db.query<Row>(
      `SELECT t.*, n.title AS note_title FROM tasks t JOIN notes n ON n.id = t.note_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`,
      params,
    )
    return rows.map(toTask)
  }

  get(id: string): Task | null {
    const row = this.db.queryOne<Row>('SELECT t.*, n.title AS note_title FROM tasks t JOIN notes n ON n.id = t.note_id WHERE t.id = ?', [id])
    return row ? toTask(row) : null
  }

  // --- Writing (through the notes) -----------------------------------------------

  private notesOrThrow(): NoteService {
    if (!this.notes) throw new Error('Tasks are not connected to notes')
    return this.notes
  }

  private async blocksOf(noteId: string): Promise<Block[]> {
    const note = await this.notesOrThrow().get(noteId)
    if (!note) throw new Error('Note not found')
    if (note.type !== 'markdown') throw new Error('Tasks live in Markdown notes')
    // With the ids the index gave checkboxes that had none, so they can be found by them.
    return ensureTaskIds(parseBlockList(note.content ?? '[]') ?? [], noteId).blocks as Block[]
  }

  private async write(noteId: string, blocks: unknown[], write: NoteWriteOptions): Promise<void> {
    await this.notesOrThrow().update(noteId, { content: JSON.stringify(blocks) }, { ...write, source: write.source ?? 'external' })
  }

  /** Where task `id` is in these blocks (the list holding it, and its index there). */
  private static find(blocks: Block[], id: string): { list: Block[]; index: number } | null {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i]?.type === 'checkListItem' && blocks[i].id === id) return { list: blocks, index: i }
      if (Array.isArray(blocks[i]?.children)) {
        const found = TaskService.find(blocks[i].children as Block[], id)
        if (found) return found
      }
    }
    return null
  }

  private async locate(id: string): Promise<{ task: Task; blocks: Block[]; at: { list: Block[]; index: number } }> {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)
    const blocks = await this.blocksOf(task.note.id)
    const at = TaskService.find(blocks, id)
    if (!at) throw new Error(`Task not found in its note: ${id}`)
    return { task, blocks, at }
  }

  /** Add a task to a note: at the end of a section (created at the end of the note if missing), else of the note. */
  async add(input: { text: string; noteId: string; section?: string; due?: string; priority?: string }, write: NoteWriteOptions = {}): Promise<Task> {
    if (!input.text?.trim()) throw new Error('Task text required')
    if (input.due && !DATE.test(input.due)) throw new Error(`due: YYYY-MM-DD, got ${input.due}`)
    if (input.priority && !PRIORITY.test(input.priority)) throw new Error(`priority: P0–P9, got ${input.priority}`)
    const id = uuid()
    const [block] = markdownToBlocks(`- [ ] ${taskLine(input.text.trim(), input.due ?? null, input.priority ?? null, null)} ^${id}`)
    let blocks: unknown[] = await this.blocksOf(input.noteId)
    if (input.section) {
      const heading = parseHeadingLine(input.section)
      if (!heading) throw new Error(`Not a Markdown heading line: ${input.section}`)
      blocks = upsertSection(blocks, { heading, content: [block], mode: 'append', newAt: 'bottom' })
    } else {
      blocks = [...blocks, block]
    }
    await this.write(input.noteId, blocks, write)
    return this.get(id)!
  }

  /** Check a task, add today's done date to its line, and a comment under it if given. */
  async complete(id: string, opts: { comment?: string; today?: string } = {}, write: NoteWriteOptions = {}): Promise<Task> {
    const { task, blocks, at } = await this.locate(id)
    const block = at.list[at.index]
    const text = inlineText(block.content)
    const doneDate = parseTaskText(text).doneDate ?? opts.today ?? localDate()
    at.list[at.index] = {
      ...block,
      props: { ...block.props, checked: true },
      content: /✅\s*\d{4}-\d{2}-\d{2}/u.test(text) ? block.content : [...(block.content ?? []), { type: 'text', text: ` ✅ ${doneDate}`, styles: {} }],
      children: opts.comment?.trim()
        ? [...(block.children ?? []), { type: 'paragraph', content: [{ type: 'text', text: opts.comment.trim(), styles: {} }], children: [] }]
        : block.children ?? [],
    }
    await this.write(task.note.id, blocks, write)
    return this.get(id)!
  }

  /** Check or uncheck (the app's to-do list); unchecking takes the done date off its line. */
  async setDone(id: string, done: boolean, write: NoteWriteOptions = {}): Promise<Task> {
    if (done) return this.complete(id, {}, write)
    const { task, blocks, at } = await this.locate(id)
    const block = at.list[at.index]
    const p = parseTaskText(inlineText(block.content))
    at.list[at.index] = { ...block, props: { ...block.props, checked: false }, content: p.doneDate ? lineContent(taskLine(p.text, p.due, p.priority, null)) : block.content }
    await this.write(task.note.id, blocks, write)
    return this.get(id)!
  }

  /** Change a task's words, due date or priority, or move it to another note. */
  async update(id: string, changes: TaskChanges, write: NoteWriteOptions = {}): Promise<Task> {
    if (changes.due && !DATE.test(changes.due)) throw new Error(`due: YYYY-MM-DD, got ${changes.due}`)
    if (changes.priority && !PRIORITY.test(changes.priority)) throw new Error(`priority: P0–P9, got ${changes.priority}`)
    const { task, blocks, at } = await this.locate(id)
    let block = at.list[at.index]
    if (changes.text !== undefined || changes.due !== undefined || changes.priority !== undefined) {
      const p = parseTaskText(inlineText(block.content))
      const text = changes.text !== undefined ? changes.text.trim() : p.text
      if (!text) throw new Error('Task text required')
      const due = changes.due !== undefined ? changes.due : p.due
      const priority = changes.priority !== undefined ? changes.priority : p.priority
      block = { ...block, content: lineContent(taskLine(text, due, priority, p.doneDate)) }
      at.list[at.index] = block
    }
    const to = changes.moveTo
    if (!to || to.noteId === task.note.id && !to.section) {
      await this.write(task.note.id, blocks, write)
      return this.get(id)!
    }
    const heading = to.section ? parseHeadingLine(to.section) : null
    if (to.section && !heading) throw new Error(`Not a Markdown heading line: ${to.section}`)
    at.list.splice(at.index, 1)
    const place = (list: unknown[]) => heading ? upsertSection(list, { heading, content: [block], mode: 'append', newAt: 'bottom' }) : [...list, block]
    if (to.noteId === task.note.id) {
      await this.write(task.note.id, place(blocks), write)
    } else {
      // Into the other note first: if anything fails after it, the task is in both, never in neither.
      await this.write(to.noteId, place(await this.blocksOf(to.noteId)), write)
      await this.write(task.note.id, blocks, write)
    }
    return this.get(id)!
  }
}

function toTask(r: Row): Task {
  return {
    id: r.id, text: r.text, done: !!r.done, due: r.due, priority: r.priority, project: r.project,
    tags: r.tags ? JSON.parse(r.tags) : [],
    note: { id: r.note_id, title: r.note_title, folder: r.folder },
    firstSeen: r.first_seen, doneAt: r.done_at, position: r.position,
  }
}
