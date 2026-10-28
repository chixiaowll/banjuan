import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { apiGet, apiPost, apiPut, apiDelete, resolveFolderArg } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const noteCmd = new Command('note').description('note management')

/** What a write printed with --json: enough to find the note again and link to it. */
const noteResult = (note: any, extra: Record<string, unknown> = {}) =>
  outputJson({ id: note.id, title: note.title, path: note.path, link: note.link, ...extra })

/** --content, else the --file it names (undefined when neither); null after reporting an unreadable file. */
function contentFrom(opts: { content?: string; file?: string }): string | undefined | null {
  if (opts.content != null) return opts.content
  if (!opts.file) return undefined
  try {
    return readFileSync(opts.file, 'utf-8')
  } catch (e: any) {
    console.error(chalk.red(`✗ Cannot read ${opts.file}: ${e.message}`))
    process.exitCode = 1
    return null
  }
}

/** --since: a date (that day, local time, from 00:00) or a date and time. */
function sinceParam(value: string): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const at = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** A folder argument resolved against the existing ones (a new one is created as typed). */
async function folderArg(folder: string | undefined): Promise<string | undefined | null> {
  if (!folder) return undefined
  const dirs: string[] = await apiGet('/api/notes/dirs')
  return resolveFolderArg(folder, dirs, { allowCreate: true })
}

/** Read all of stdin (used when content is piped/redirected, e.g. `... < file.md`). */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => resolve(data))
  })
}

noteCmd
  .command('create')
  .description('create a note, optionally with markdown content')
  .argument('<title>', 'note title')
  .option('--doc <doc-id>', 'linked document ID')
  .option('--folder <folder>', 'folder path')
  .option('--content <markdown>', 'note content as a markdown string')
  .option('--file <path>', 'read note content from a markdown file')
  .option('--json', 'print { id, title, path, link } as JSON')
  .addHelpText('after', `
Content can be provided three ways (precedence: --content > --file > stdin):
  banjuan note create "Title" --content "# Hello"
  banjuan note create "Title" --file ./notes/intro.md
  banjuan note create "Title" --folder Work < ./notes/intro.md
  cat intro.md | banjuan note create "Title"

Local images referenced in the markdown (e.g. ![](img/x.png)) are copied into
the note. Prefer --file for markdown with images: paths are resolved relative
to the file. With stdin/--content they resolve relative to the current dir.`)
  .action(async (title: string, opts: { doc?: string; folder?: string; content?: string; file?: string; json?: boolean }) => {
    let content: string | undefined
    // Base dir for resolving local images referenced in the markdown. With
    // --file we know it exactly; otherwise fall back to the current directory.
    let contentBaseDir: string | undefined
    if (opts.content != null) {
      content = opts.content
      contentBaseDir = process.cwd()
    } else if (opts.file) {
      try {
        content = readFileSync(opts.file, 'utf-8')
        contentBaseDir = dirname(resolve(opts.file))
      } catch (e: any) {
        console.error(chalk.red(`✗ Cannot read --file "${opts.file}": ${e.message}`))
        process.exitCode = 1
        return
      }
    } else if (!process.stdin.isTTY) {
      // Content was piped or redirected in (e.g. `... < file.md`).
      const piped = await readStdin()
      if (piped.trim()) { content = piped; contentBaseDir = process.cwd() }
    }
    let folder = opts.folder
    if (folder) {
      // Auto-correct to an existing folder (e.g. missing "[N] " prefix); a truly
      // new path is created as typed.
      const dirs: string[] = await apiGet('/api/notes/dirs')
      const resolved = resolveFolderArg(folder, dirs, { allowCreate: true })
      if (resolved === null) { process.exitCode = 1; return }
      folder = resolved
    }
    const note = await apiPost('/api/notes', { title, docId: opts.doc, folder, content, contentBaseDir })
    if (opts.json) { noteResult(note); return }
    const withContent = content ? chalk.dim(` (+${content.length} chars of content)`) : ''
    console.log(chalk.green(`✓ Created note: ${note.title} (${note.id})`) + withContent)
  })

noteCmd
  .command('list')
  .description('list notes')
  .option('--doc <doc-id>', 'filter by linked document')
  .option('--type <type>', 'filter by type')
  .option('--tag <tag>', 'filter by tag')
  .option('--folder <folder>', 'filter by folder')
  .option('--since <date>', 'only notes changed since: a date (from 00:00 local time) or a date and time')
  .option('--json', 'JSON output')
  .action(async (opts: { doc?: string; type?: string; tag?: string; folder?: string; since?: string; json?: boolean }) => {
    const params = new URLSearchParams()
    if (opts.since) {
      const since = sinceParam(opts.since)
      if (!since) { console.error(chalk.red(`✗ --since: not a date or time: ${opts.since}`)); process.exitCode = 1; return }
      params.set('since', since)
    }
    if (opts.doc) params.set('docId', opts.doc)
    if (opts.type) params.set('type', opts.type)
    if (opts.tag) params.set('tag', opts.tag)
    if (opts.folder) {
      // Resolve the filter against real folders so "Projects" matches "[1] Projects".
      const dirs: string[] = await apiGet('/api/notes/dirs')
      const resolved = resolveFolderArg(opts.folder, dirs, { allowCreate: false })
      if (resolved === null) { process.exitCode = 1; return }
      params.set('folder', resolved)
    }
    const qs = params.toString()
    const notes = await apiGet(`/api/notes${qs ? '?' + qs : ''}`)
    if (opts.json) {
      outputJson(notes)
    } else {
      if (notes.length === 0) { console.log('No notes'); return }
      outputTable(
        ['ID', 'Title', 'Type', 'Folder', 'Document', 'Created'],
        notes.map((n: any) => {
          const parts = (n.path ?? '').split('/')
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '-'
          return [
            n.id, n.title, n.type ?? 'markdown',
            folder, n.docId ?? '-',
            new Date(n.createdAt).toLocaleDateString(),
          ]
        }),
      )
    }
  })

noteCmd
  .command('refresh')
  .description('sync notes from disk to database')
  .action(async () => {
    await apiPost('/api/notes/refresh')
    console.log(chalk.green('✓ Notes synced'))
  })

noteCmd
  .command('show')
  .description('show note content (Markdown; links and embeds as banjuan:// links, kept when written back)')
  .argument('<id>', 'note ID')
  .option('--body', 'print only the content, no details above it (to edit it and write it back)')
  .action(async (id: string, opts: { body?: boolean }) => {
    const note = await apiGet(`/api/notes/${encodeURIComponent(id)}?format=markdown`)
    if (opts.body) { process.stdout.write((note.content ?? '') + '\n'); return }
    const parts = String(note.path ?? '').split('/')
    outputItem([
      ['ID', note.id],
      ['Title', note.title],
      ['Type', note.type ?? 'markdown'],
      ['Folder', parts.length > 1 ? parts.slice(0, -1).join('/') : '-'],
      ['Document', note.docId ?? '-'],
      ['Created', new Date(note.createdAt).toLocaleString()],
    ])
    if (note.content) {
      console.log('\n' + note.content)
    }
  })

noteCmd
  .command('delete')
  .description('delete a note')
  .argument('<id>', 'note ID')
  .action(async (id: string) => {
    await apiDelete(`/api/notes/${encodeURIComponent(id)}`)
    console.log(chalk.green('✓ Note deleted'))
  })

noteCmd
  .command('update')
  .description('update a note')
  .argument('<id>', 'note ID')
  .option('--title <title>', 'new title')
  .option('--content <content>', 'new content (markdown); replaces the whole note')
  .option('--file <path>', 'read the new content from a markdown file (--content wins if both are given)')
  .option('--json', 'print { id, title, path, link } as JSON')
  .addHelpText('after', `
The previous version is kept (banjuan note history <id>). To change one part of
a long note — a day in a diary, a project's status — use \`banjuan note section\`.`)
  .action(async (id: string, opts: { title?: string; content?: string; file?: string; json?: boolean }) => {
    const body: Record<string, string> = {}
    if (opts.title) body.title = opts.title
    const content = contentFrom(opts)
    if (content === null) return
    if (content) body.content = content
    const note = await apiPut(`/api/notes/${encodeURIComponent(id)}`, body)
    if (opts.json) { noteResult(note); return }
    console.log(chalk.green(`✓ Updated note: ${note.title}`))
  })

noteCmd
  .command('ensure')
  .description('the note with this title right in the folder — created (with the content) only when there is none')
  .argument('<title>', 'note title')
  .option('--folder <folder>', 'folder path (top level if omitted)')
  .option('--content <markdown>', 'content for a new note')
  .option('--file <path>', 'read the content for a new note from a markdown file')
  .option('--json', 'print { id, title, path, link, created } as JSON')
  .addHelpText('after', `
Safe to run again: an existing note is returned as it is (its content is not touched).
  banjuan note ensure "202610" --folder "[0] DailyNotes" --content "# 十月工作日记" --json`)
  .action(async (title: string, opts: { folder?: string; content?: string; file?: string; json?: boolean }) => {
    const content = contentFrom(opts)
    if (content === null) return
    const folder = await folderArg(opts.folder)
    if (folder === null) { process.exitCode = 1; return }
    const note = await apiPost('/api/notes/ensure', { title, folder, content })
    if (opts.json) { noteResult(note, { created: note.created }); return }
    console.log(chalk.green(`✓ ${note.created ? 'Created' : 'Found'} note: ${note.title} (${note.id})`))
  })

noteCmd
  .command('section')
  .description('write one section of a note — the part under a heading — leaving the rest as it is')
  .argument('<id>', 'note ID')
  .argument('<heading>', 'the section\'s heading as a Markdown line, e.g. "## 20261028"')
  .option('--content <markdown>', 'the section\'s content (without its heading)')
  .option('--file <path>', 'read the section\'s content from a markdown file')
  .option('--mode <mode>', 'replace: the section\'s content becomes this; append: added at its end', 'replace')
  .option('--new-at <where>', 'where a missing section goes: top (before the first heading of its level) or bottom', 'bottom')
  .option('--json', 'print { id, title, path, link } as JSON')
  .addHelpText('after', `
A section runs from its heading to the next heading of the same level or higher.
The previous version of the note is kept (banjuan note history <id>).
  banjuan note section <id> "## 20261028" --file today.md --mode append --new-at top   # a day in a diary`)
  .action(async (id: string, heading: string, opts: { content?: string; file?: string; mode: string; newAt: string; json?: boolean }) => {
    const content = contentFrom(opts)
    if (content === null) return
    if (content === undefined) { console.error(chalk.red('✗ Give the section\'s content: --content or --file')); process.exitCode = 1; return }
    if (!['replace', 'append'].includes(opts.mode) || !['top', 'bottom'].includes(opts.newAt)) {
      console.error(chalk.red('✗ --mode replace|append, --new-at top|bottom')); process.exitCode = 1; return
    }
    const note = await apiPost(`/api/notes/${encodeURIComponent(id)}/section`, { heading, content, mode: opts.mode, newAt: opts.newAt })
    if (opts.json) { noteResult(note); return }
    console.log(chalk.green(`✓ Wrote section ${heading.trim()} of ${note.title}`))
  })

noteCmd
  .command('history')
  .description('earlier versions of a note (kept before every write from outside, and as you edit)')
  .argument('<id>', 'note ID')
  .option('--json', 'JSON output')
  .action(async (id: string, opts: { json?: boolean }) => {
    const versions: Array<{ version: string; at: string; reason: string; title: string; preview: string }> = await apiGet(`/api/notes/${encodeURIComponent(id)}/history`)
    if (opts.json) { outputJson(versions); return }
    if (versions.length === 0) { console.log('No earlier versions'); return }
    outputTable(['Version', 'Saved', 'Why', 'Title', 'Starts with'],
      versions.map(v => [v.version, new Date(v.at).toLocaleString(), v.reason, v.title, v.preview.slice(0, 40)]))
  })

noteCmd
  .command('restore')
  .description('put a note back as it was in an earlier version (what it replaces is kept as a version too)')
  .argument('<id>', 'note ID')
  .argument('<version>', 'a version from banjuan note history')
  .option('--json', 'print { id, title, path, link } as JSON')
  .action(async (id: string, version: string, opts: { json?: boolean }) => {
    const note = await apiPost(`/api/notes/${encodeURIComponent(id)}/restore`, { version })
    if (opts.json) { noteResult(note); return }
    console.log(chalk.green(`✓ Restored ${note.title} to ${version}`))
  })

noteCmd
  .command('move')
  .description('move a note to a folder')
  .argument('<id>', 'note ID')
  .argument('[folder]', 'target folder path (moves to root if omitted)')
  .option('--create', 'create the target folder if it does not exist (otherwise error)')
  .option('--json', 'print { id, title, path, link } as JSON')
  .action(async (id: string, folder: string | undefined, opts: { create?: boolean; json?: boolean }) => {
    let target: string | null = folder ?? null

    // Resolve the target against EXISTING folders so we never silently create a
    // near-duplicate (e.g. "Projects/…" instead of the real "[1] Projects/…").
    if (target) {
      const dirs: string[] = await apiGet('/api/notes/dirs')
      const resolved = resolveFolderArg(target, dirs, { allowCreate: !!opts.create })
      if (resolved === null) { process.exitCode = 1; return }
      target = resolved
    }

    const note = await apiPost(`/api/notes/${encodeURIComponent(id)}/move`, { folder: target })
    if (opts.json) { noteResult(note); return }
    console.log(chalk.green(`✓ Moved note: ${note.title} → ${target ?? '(root)'}`))
  })
