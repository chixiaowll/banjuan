import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiPut } from '../lib.js'
import { outputJson, outputTable } from '../output.js'

/**
 * Tasks are the checkboxes of notes (`- [ ] …`): the notes stay where they
 * live; these commands list them across the library and change them in place.
 */
export const taskCmd = new Command('task').description('tasks: the checkboxes in notes, across the library')

const SOURCE_HELP = 'who is writing, kept in the note\'s history (default: $BANJUAN_SOURCE)'
const sourceOf = (opts: { source?: string }) => opts.source || process.env.BANJUAN_SOURCE || undefined
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A date argument: YYYY-MM-DD, today or tomorrow. Null when it is none of those. */
function dayArg(value: string): string | null {
  if (value === 'today') return localDay(new Date())
  if (value === 'tomorrow') return localDay(new Date(Date.now() + 86_400_000))
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function fail(message: string): void {
  console.error(chalk.red(`✗ ${message}`))
  process.exitCode = 1
}

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

taskCmd
  .command('list')
  .description('list tasks (open ones by default)')
  .option('--open', 'open tasks (default)')
  .option('--done', 'done tasks')
  .option('--all', 'open and done')
  .option('--project <name>', 'only this project (its first #tag, else its note\'s folder name; exact, any case)')
  .option('--due-before <date>', 'due on or before (YYYY-MM-DD, today, tomorrow)')
  .option('--done-since <date>', 'done on or after (YYYY-MM-DD, today)')
  .option('--note <id>', 'only the tasks of this note')
  .option('--json', 'JSON: [{ id, text, done, due, priority, project, tags, note: { id, title, folder }, link, firstSeen, doneAt }]')
  .action(async (opts: { open?: boolean; done?: boolean; all?: boolean; project?: string; dueBefore?: string; doneSince?: string; note?: string; json?: boolean }) => {
    const params = new URLSearchParams({ status: opts.all ? 'all' : opts.done ? 'done' : 'open' })
    if (opts.project !== undefined) params.set('project', opts.project)
    if (opts.dueBefore) { const d = dayArg(opts.dueBefore); if (!d) return fail(`--due-before: YYYY-MM-DD, today or tomorrow, got ${opts.dueBefore}`); params.set('dueBefore', d) }
    if (opts.doneSince) { const d = dayArg(opts.doneSince); if (!d) return fail(`--done-since: YYYY-MM-DD or today, got ${opts.doneSince}`); params.set('doneSince', d) }
    if (opts.note) params.set('note', opts.note)
    const tasks: any[] = await apiGet(`/api/tasks?${params}`)
    if (opts.json) { outputJson(tasks); return }
    if (tasks.length === 0) { console.log('No tasks'); return }
    const today = localDay(new Date())
    outputTable(['ID', '', 'Task', 'Due', 'Project', 'Note', 'Open'],
      tasks.map(t => [
        t.id, t.done ? '✓' : ' ',
        (t.priority ? `[${t.priority}] ` : '') + t.text,
        t.due ? (t.due < today && !t.done ? chalk.red(t.due) : t.due) : '',
        t.project, t.note.title,
        t.done ? '' : `${daysSince(t.firstSeen)}d`,
      ]))
  })

taskCmd
  .command('add')
  .description('add a task to a note: at the end of a section (made at the end if missing), else of the note')
  .argument('<text>', 'what to do')
  .requiredOption('--note <id>', 'the note it goes in')
  .option('--section <heading>', 'the section, as its Markdown heading line, e.g. "### 待办"')
  .option('--due <date>', 'due date (YYYY-MM-DD, today, tomorrow)')
  .option('--priority <p>', 'P0–P9')
  .option('--created <date>', 'when it really started (YYYY-MM-DD), for one written down later: written as ➕ <date>, counted from for "open for N days"')
  .option('--source <name>', SOURCE_HELP)
  .option('--json', 'print the task as JSON (with its id and link)')
  .action(async (text: string, opts: { note: string; section?: string; due?: string; priority?: string; created?: string; source?: string; json?: boolean }) => {
    const due = opts.due ? dayArg(opts.due) : undefined
    if (due === null) return fail(`--due: YYYY-MM-DD, today or tomorrow, got ${opts.due}`)
    const created = opts.created ? dayArg(opts.created) : undefined
    if (created === null) return fail(`--created: YYYY-MM-DD or today, got ${opts.created}`)
    const task = await apiPost('/api/tasks', { text, noteId: opts.note, section: opts.section, due, priority: opts.priority, created, source: sourceOf(opts) })
    if (opts.json) { outputJson(task); return }
    console.log(chalk.green(`✓ Added task ${task.id} to ${task.note.title}`))
  })

taskCmd
  .command('done')
  .description('check a task and add today\'s done date (✅) to it; --undo unchecks it')
  .argument('<id>', 'task ID')
  .option('--comment <text>', 'what came of it, written under the task')
  .option('--undo', 'uncheck it again')
  .option('--source <name>', SOURCE_HELP)
  .option('--json', 'print the task as JSON')
  .action(async (id: string, opts: { comment?: string; undo?: boolean; source?: string; json?: boolean }) => {
    const task = await apiPost(`/api/tasks/${encodeURIComponent(id)}/done`, { comment: opts.comment, undo: !!opts.undo, source: sourceOf(opts) })
    if (opts.json) { outputJson(task); return }
    console.log(chalk.green(`✓ ${task.done ? 'Done' : 'Open again'}: ${task.text}`))
  })

taskCmd
  .command('update')
  .description('change a task\'s text, due date or priority, or move it to another note (it keeps its id)')
  .argument('<id>', 'task ID')
  .option('--text <text>', 'new text')
  .option('--due <date>', 'due date (YYYY-MM-DD, today, tomorrow), or none to clear it')
  .option('--priority <p>', 'P0–P9, or none to clear it')
  .option('--move-to <note-id>', 'move it into this note')
  .option('--section <heading>', 'with --move-to: the section, as its Markdown heading line')
  .option('--source <name>', SOURCE_HELP)
  .option('--json', 'print the task as JSON')
  .action(async (id: string, opts: { text?: string; due?: string; priority?: string; moveTo?: string; section?: string; source?: string; json?: boolean }) => {
    const body: Record<string, unknown> = { source: sourceOf(opts) }
    if (opts.text !== undefined) body.text = opts.text
    if (opts.due !== undefined) {
      const due = opts.due === 'none' ? null : dayArg(opts.due)
      if (due === null && opts.due !== 'none') return fail(`--due: YYYY-MM-DD, today, tomorrow or none, got ${opts.due}`)
      body.due = due
    }
    if (opts.priority !== undefined) body.priority = opts.priority === 'none' ? null : opts.priority
    if (opts.moveTo) body.moveTo = { noteId: opts.moveTo, section: opts.section }
    else if (opts.section) return fail('--section goes with --move-to')
    const task = await apiPut(`/api/tasks/${encodeURIComponent(id)}`, body)
    if (opts.json) { outputJson(task); return }
    console.log(chalk.green(`✓ Updated task: ${task.text} (${task.note.title})`))
  })
