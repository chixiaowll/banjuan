import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiDelete } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'

export const docCmd = new Command('doc').description('document management')

docCmd
  .command('import')
  .description('import a document into the library')
  .argument('<file>', 'file path')
  .option('--dir <dir>', 'target subdirectory')
  .option('--title <title>', 'custom title')
  .option('--tag <tags...>', 'tags')
  .action(async (file: string, opts: { dir?: string; title?: string; tag?: string[] }) => {
    const { resolve } = await import('node:path')
    const absPath = resolve(file)
    const doc = await apiPost('/api/documents/import', {
      filePath: absPath,
      destDir: opts.dir,
      title: opts.title,
      tags: opts.tag,
    })
    console.log(chalk.green(`✓ Imported: ${doc.title}`))
    console.log(chalk.dim(`  ID: ${doc.id}`))
    console.log(chalk.dim(`  Path: ${doc.path}`))
  })

docCmd
  .command('refresh')
  .description('scan library directory and sync added/removed files')
  .action(async () => {
    const result = await apiPost('/api/documents/refresh')
    console.log(chalk.green(`✓ Sync complete: ${result.imported} added, ${result.removed} removed`))
  })

docCmd
  .command('list')
  .description('list documents')
  .option('--tag <tag>', 'filter by tag')
  .option('--type <type>', 'filter by type')
  .option('--json', 'JSON output')
  .action(async (opts: { tag?: string; type?: string; json?: boolean }) => {
    const params = new URLSearchParams()
    if (opts.tag) params.set('tag', opts.tag)
    if (opts.type) params.set('type', opts.type)
    const qs = params.toString()
    const docs = await apiGet(`/api/documents${qs ? '?' + qs : ''}`)
    if (opts.json) {
      outputJson(docs)
    } else {
      if (docs.length === 0) { console.log('No documents'); return }
      outputTable(
        ['ID', 'Title', 'Type', 'Created'],
        docs.map((d: any) => [d.id, d.title, d.type, new Date(d.createdAt).toLocaleDateString()]),
      )
    }
  })

docCmd
  .command('info')
  .description('show document details')
  .argument('<id>', 'document ID')
  .option('--json', 'JSON output')
  .action(async (id: string, opts: { json?: boolean }) => {
    const doc = await apiGet(`/api/documents/${encodeURIComponent(id)}`)
    if (opts.json) {
      outputJson(doc)
    } else {
      outputItem([
        ['ID', doc.id],
        ['Title', doc.title],
        ['Type', doc.type],
        ['Path', doc.path],
        ['Hash', (doc.hash ?? '').slice(0, 12) + '...'],
        ['Created', new Date(doc.createdAt).toLocaleString()],
      ])
    }
  })

docCmd
  .command('delete')
  .description('delete a document')
  .argument('<id>', 'document ID')
  .action(async (id: string) => {
    await apiDelete(`/api/documents/${encodeURIComponent(id)}`)
    console.log(chalk.green(`✓ Deleted document ${id}`))
  })
