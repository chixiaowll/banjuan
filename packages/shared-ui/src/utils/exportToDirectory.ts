import type { BanjuanAPI } from '../api.js'
import { useExportManagerStore } from '../stores/useExportManagerStore.js'

export interface ExportFile {
  name: string
  dataUrl: string
}

export interface ExportResult {
  markdown?: string
  html?: string
  attachments: string[]
  files?: ExportFile[]
}

export interface ExportEntry {
  id: string
  title: string
  subPath?: string
  generate: () => Promise<ExportResult>
}

export async function exportToDirectory(
  api: BanjuanAPI,
  entries: ExportEntry[],
  format: 'markdown' | 'pdf',
  outputDir?: string,
) {
  const dir = outputDir || await api.dialog.openDirectory()
  if (!dir) return

  const store = useExportManagerStore.getState()
  store.startExport(
    entries.map(e => ({ id: e.id, noteId: e.id, title: e.title, subPath: e.subPath || '' })),
    dir,
    format,
  )

  for (const entry of entries) {
    store.updateItem(entry.id, { status: 'exporting' })
    try {
      const result = await entry.generate()
      const outputPath = entry.subPath ? `${dir}/${entry.subPath}` : dir
      if (format === 'markdown') {
        await api.export!.markdown({
          title: entry.title, markdown: result.markdown!, attachments: result.attachments,
          outputPath, files: result.files,
        })
      } else {
        await api.export!.pdf({
          title: entry.title, html: result.html!, attachments: result.attachments,
          outputPath, files: result.files,
        })
      }
      store.updateItem(entry.id, { status: 'done' })
    } catch (err: any) {
      store.updateItem(entry.id, { status: 'error', error: err?.message || 'Unknown error' })
    }
  }
  store.setRunning(false)
}
