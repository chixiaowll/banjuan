import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const noteCmd = new Command('note').description('note management')

noteCmd
  .command('create')
  .description('create a note')
  .argument('<title>', 'note title')
  .option('--doc <doc-id>', 'linked document ID')
  .option('--folder <folder>', 'folder path')
  .action(async (title: string, opts: { doc?: string; folder?: string }) => {
    const note = await apiPost('/api/notes', { title, docId: opts.doc, folder: opts.folder })
    console.log(chalk.green(`✓ Created note: ${note.title} (${note.id})`))
  })

noteCmd
  .command('list')
  .description('list notes')
  .option('--doc <doc-id>', 'filter by linked document')
  .option('--type <type>', 'filter by type')
  .option('--tag <tag>', 'filter by tag')
  .option('--folder <folder>', 'filter by folder')
  .option('--json', 'JSON output')
  .action(async (opts: { doc?: string; type?: string; tag?: string; folder?: string; json?: boolean }) => {
    const params = new URLSearchParams()
    if (opts.doc) params.set('docId', opts.doc)
    if (opts.type) params.set('type', opts.type)
    if (opts.tag) params.set('tag', opts.tag)
    if (opts.folder) params.set('folder', opts.folder)
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
  .description('show note content')
  .argument('<id>', 'note ID')
  .action(async (id: string) => {
    const note = await apiGet(`/api/notes/${encodeURIComponent(id)}?format=markdown`)
    outputItem([
      ['ID', note.id],
      ['Title', note.title],
      ['Type', note.type ?? 'markdown'],
      ['Folder', note.folderId ?? '-'],
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
  .option('--content <content>', 'new content (markdown)')
  .action(async (id: string, opts: { title?: string; content?: string }) => {
    const body: Record<string, string> = {}
    if (opts.title) body.title = opts.title
    if (opts.content) body.content = opts.content
    const note = await apiPut(`/api/notes/${encodeURIComponent(id)}`, body)
    console.log(chalk.green(`✓ Updated note: ${note.title}`))
  })

noteCmd
  .command('move')
  .description('move a note to a folder')
  .argument('<id>', 'note ID')
  .argument('[folder]', 'target folder path (moves to root if omitted)')
  .action(async (id: string, folder?: string) => {
    const note = await apiPost(`/api/notes/${encodeURIComponent(id)}/move`, { folder: folder ?? null })
    console.log(chalk.green(`✓ Moved note: ${note.title}`))
  })
