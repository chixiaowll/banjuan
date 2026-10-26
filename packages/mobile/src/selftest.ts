// Simulator self-test (built only with `vite build --mode selftest`, never in
// the shipped app). Drives the iPad-specific features end to end and writes
// Documents/selftest-report.json; `shot` markers tell the test script on the
// Mac when to take a screenshot.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { importStagedMarkdown } from './capacitor-api'

const D = Directory.Documents
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const report: { done: boolean; shot: string | null; steps: Array<{ name: string; ok: boolean; detail?: unknown }> } = { done: false, shot: null, steps: [] }
const write = () => Filesystem.writeFile({ path: 'selftest-report.json', data: JSON.stringify(report, null, 1), directory: D, encoding: Encoding.UTF8 })
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    const detail = await fn()
    report.steps.push({ name, ok: detail !== false, detail })
  } catch (e) {
    report.steps.push({ name, ok: false, detail: String((e as Error)?.message ?? e) })
  }
  await write()
}
async function shot(name: string) { report.shot = name; await write(); await sleep(5000); report.shot = null }
const loads = (src: string) => new Promise<number>(resolve => { const i = new Image(); i.onload = () => resolve(i.naturalWidth); i.onerror = () => resolve(0); i.src = src; setTimeout(() => resolve(0), 8000) })
const activePanel = () => [...document.querySelectorAll<HTMLElement>('[data-tab-panel]')].find(p => p.style.clipPath === 'none')

export async function runSelftest() {
  await sleep(4000)
  const t = (window as any).__selftest
  const api = t.api
  let config: { final?: string } = {}
  try { config = JSON.parse((await Filesystem.readFile({ path: 'selftest-config.json', directory: D, encoding: Encoding.UTF8 })).data as string) } catch { /* defaults */ }

  const path = `BanJuanLibrary/selftest-${Date.now().toString(36)}`
  let note: any, rel = '', pdf: any, epub: any
  await step('create + open library with fixtures', async () => {
    await api.library.init(path, '自测书房')
    const { files } = await Filesystem.readdir({ path: 'selftest-fixtures', directory: D })
    for (const f of files) await Filesystem.copy({ from: `selftest-fixtures/${f.name}`, to: `${path}/${f.name}`, directory: D, toDirectory: D })
    await api.library.open(path)
    await api.documents.refresh()
    t.open(path, '自测书房')
    await sleep(3000)
    const docs = await api.documents.list()
    pdf = docs.find((d: any) => d.type === 'pdf'); epub = docs.find((d: any) => d.type === 'epub')
    return docs.map((d: any) => d.path)
  })

  await step('note image shows (banjuan-attachment → local URL)', async () => {
    note = await api.notes.create({ title: '自测笔记' })
    const c = document.createElement('canvas'); c.width = 240; c.height = 120
    const g = c.getContext('2d')!; g.fillStyle = '#e8590c'; g.fillRect(0, 0, 240, 120); g.fillStyle = '#fff'; g.font = '28px sans-serif'; g.fillText('附件图片', 40, 70)
    const buf = await (await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'))).arrayBuffer()
    rel = await api.attachments.save(note.id, 'pic.png', buf)
    await api.notes.update(note.id, { content: JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: '自测正文：包含一张附件图片', styles: {} }], children: [] },
      { type: 'image', props: { url: `banjuan-attachment://${rel}` }, children: [] },
    ]) })
    document.dispatchEvent(new CustomEvent('note-link-click', { detail: { noteId: note.id } }))
    await sleep(4000)
    const img = activePanel()?.querySelector<HTMLImageElement>('.bn-editor img')
    await shot('note-image')
    return { src: img?.src?.slice(0, 60), width: img?.naturalWidth ?? 0 }
  })

  await step('note body search', async () => (await api.search.query('附件图片', { type: 'note' })).map((r: any) => r.title))

  await step('covers (pdf, epub)', async () => {
    const out: Record<string, number> = {}
    for (const d of [pdf, epub].filter(Boolean)) {
      const url = await api.documents.getCover(d.id)
      out[d.type] = url ? await loads(url) : -1
    }
    return out
  })

  await step('document text index + search', async () => {
    for (let i = 0; i < 40; i++) {
      const s = await api.search.textIndexStatus()
      if (s.pending === 0 && !s.running) break
      await sleep(1500)
    }
    const status = await api.search.textIndexStatus()
    const hits = await api.search.query('机器学习', { type: 'document' })
    return { status, hits: hits.map((h: any) => `${h.title}#${h.page}`) }
  })

  await step('delete document folder', async () => {
    await api.documents.createDir('临时文件夹')
    const before = await api.documents.listDirs()
    await api.documents.deleteDir('临时文件夹')
    const after = await api.documents.listDirs()
    return { before, after }
  })

  let exportDir = ''
  await step('export markdown + pdf', async () => {
    exportDir = await api.dialog.openDirectory()
    await api.export.markdown({ title: '导出测试', markdown: `# 导出测试\n\n![](banjuan-attachment://${rel})`, attachments: [rel], outputPath: exportDir })
    await api.export.pdf({ title: '导出测试', html: `<h1>导出测试</h1><p>中文段落，第二行文字。</p><img src="banjuan-attachment://${rel}">`, attachments: [], outputPath: exportDir })
    const list = async (dir: string): Promise<string[]> => {
      const { files } = await Filesystem.readdir({ path: dir, directory: D })
      const out: string[] = []
      for (const f of files) out.push(...(f.type === 'directory' ? (await list(`${dir}/${f.name}`)).map(x => `${f.name}/${x}`) : [`${f.name}:${f.size}`]))
      return out
    }
    const head = (await Filesystem.readFile({ path: `${exportDir}/导出测试.pdf`, directory: D })).data as string
    return { dir: exportDir, files: await list(exportDir), pdfMagic: atob(head.slice(0, 8)).slice(0, 5) }
  })

  await step('markdown import (staged outside the library)', async () => {
    const staging = `BanJuanLibrary/.import-selftest`
    await Filesystem.writeFile({ path: `${staging}/导入的笔记.md`, data: '# 导入的笔记\n\n来自文件的正文', directory: D, encoding: Encoding.UTF8, recursive: true })
    const results = await importStagedMarkdown(staging, [{ name: '导入的笔记.md' }], null)
    await Filesystem.rmdir({ path: staging, directory: D, recursive: true }).catch(() => {})
    const created = (await api.notes.list()).find((n: any) => n.title === '导入的笔记')
    const body = created ? (await api.notes.get(created.id))?.content ?? '' : ''
    return results.every((r: any) => r.success) && body.includes('来自文件的正文') ? results : false
  })

  await step('a note imported (and the index saved) during a rebuild survives it', async () => {
    const staging = `BanJuanLibrary/.import-selftest2`
    await Filesystem.writeFile({ path: `${staging}/重建时导入.md`, data: '重建时导入的正文', directory: D, encoding: Encoding.UTF8, recursive: true })
    const before = (await api.notes.list()).length
    // The import ends with a save of the in-memory index, while the rebuild reads files.
    const [, results] = await Promise.all([api.index.rebuild(), importStagedMarkdown(staging, [{ name: '重建时导入.md' }], null)])
    await Filesystem.rmdir({ path: staging, directory: D, recursive: true }).catch(() => {})
    const after = await api.notes.list()
    const ok = after.length === before + 1 && after.some((n: any) => n.title === '重建时导入')
    if (!ok) throw new Error(JSON.stringify({ before, after: after.map((n: any) => n.title), results }))
    return { before, after: after.length, results }
  })

  await step('dropped files are imported (documents and markdown notes)', async () => {
    const doc = await api.documents.importDropped([new File(['# 拖入的文档\n'], '拖入的文档.md', { type: 'text/markdown' })])
    const md = await api.notes.importDroppedMarkdown([new File(['拖入笔记的正文'], '拖入的笔记.md', { type: 'text/markdown' })], null)
    const docs = (await api.documents.list()).map((d: any) => d.path)
    const note = (await api.notes.list()).find((n: any) => n.title === '拖入的笔记')
    const ok = docs.includes('拖入的文档.md') && !!note && ((await api.notes.get(note.id))?.content ?? '').includes('拖入笔记的正文')
    if (!ok) throw new Error(JSON.stringify({ doc, md, docs }))
    return { doc, md }
  })

  await step('switching to another library and back', async () => {
    const other = `${path}-other`
    const before = (await api.notes.list()).length
    await api.library.init(other, '另一个书房')
    const inOther = (await api.notes.list()).length
    await api.library.open(path)
    const after = (await api.notes.list()).length
    await api.library.delete(other).catch(() => {})
    if (inOther !== 0 || after !== before) throw new Error(JSON.stringify({ before, inOther, after }))
    return { before, inOther, after }
  })

  await step('rebuild library', async () => {
    const missing = await api.library.detectMissing()
    const r = await api.library.rebuild([])
    return { missing: missing.length, ...r }
  })

  report.done = true
  await write()
  // One native screen to look at (each covers the app and can't be dismissed from here).
  if (config.final === 'quicklook') { await api.attachments.open(rel); await shot('quicklook') }
  if (config.final === 'share') { void api.export.finish(exportDir); await sleep(1500); await shot('share') }
  if (config.final === 'picker') { void api.documents.importFilesDialog(); await sleep(1500); await shot('picker') }
}
