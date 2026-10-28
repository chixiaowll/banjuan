import { Command } from 'commander'
import chalk from 'chalk'
import { apiGet, apiPost, apiDelete, resolveFolderArg } from '../lib.js'
import { outputJson, outputTable, outputItem } from '../output.js'
import { parsePageRange } from '../page-range.js'

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
    let destDir = opts.dir
    if (destDir) {
      // Auto-correct to an existing document folder; a new one is created as typed.
      const dirs: string[] = await apiGet('/api/documents/dirs')
      const resolved = resolveFolderArg(destDir, dirs, { allowCreate: true })
      if (resolved === null) { process.exitCode = 1; return }
      destDir = resolved
    }
    const doc = await apiPost('/api/documents/import', {
      filePath: absPath,
      destDir,
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
  .command('read')
  .description('print the text of a document: PDF by page, EPUB by chapter, txt/md/html whole')
  .argument('<id>', 'document ID')
  .option('--pages <range>', 'page (EPUB: chapter) or range to read, e.g. 3 or 3-5 (default 1; up to 25 per call)')
  .option('--json', 'JSON output: { numPages, from, to, pages: [{ page, text }], truncated }')
  .addHelpText('after', `
Long documents: read a few pages to find the part you need, then read on.
When more is left, a hint with the next range is printed to stderr.`)
  .action(async (id: string, opts: { pages?: string; json?: boolean }) => {
    const range = opts.pages === undefined ? { from: 1, to: 1 } : parsePageRange(opts.pages)
    if (!range) {
      console.error(chalk.red(`✗ --pages: expected a page or a range like 3-5, got "${opts.pages}"`))
      process.exitCode = 1
      return
    }
    const r = await apiGet(`/api/documents/${encodeURIComponent(id)}/text?from=${range.from}&to=${range.to}`)
    if (opts.json) { outputJson(r); return }
    const pages: Array<{ page: number; text: string }> = r.pages ?? []
    for (const p of pages) {
      if (r.numPages > 1) console.log(`--- page ${p.page} / ${r.numPages} ---`)
      console.log(p.text)
    }
    // Where to go on (stderr: the text on stdout stays clean).
    const last = pages.length ? pages[pages.length - 1].page : range.from - 1
    const next = `banjuan doc read ${id} --pages ${last + 1}-${Math.min(last + 5, r.numPages)}`
    if (last < range.to && last < r.numPages) {
      console.error(chalk.dim(`… stopped after page ${last} (limit per call); next: ${next}`))
    } else if (last < r.numPages) {
      console.error(chalk.dim(`… ${r.numPages} pages in all; next: ${next}`))
    } else if (r.truncated) {
      console.error(chalk.dim('… the last page was cut short (too long to print whole)'))
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
