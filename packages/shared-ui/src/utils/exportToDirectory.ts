import type { BanjuanAPI, ExportFormat } from '../api.js'
import { useExportManagerStore } from '../stores/useExportManagerStore.js'

export interface ExportFile {
  name: string
  /** base64/data-URL content (images) — used for binary outputs. */
  dataUrl?: string
  /** UTF-8 text content (e.g. JSON, SVG markup) — used for text outputs. */
  text?: string
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

/**
 * Receives progress as an export run proceeds. The default observer drives the
 * `useExportManagerStore` (in-window export); the background export window
 * supplies an observer that forwards each event over IPC instead.
 */
export interface ExportObserver {
  onStart(items: Array<{ id: string; noteId: string; title: string; subPath: string }>, outputDir: string, format: ExportFormat): void
  onItem(id: string, status: 'exporting' | 'done' | 'error', error?: string): void
  onDone(): void
}

/** Unique id for one export dispatch. */
export function newRunId(): string {
  const c = (globalThis as any).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `run-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

function storeObserver(): ExportObserver {
  const store = useExportManagerStore.getState()
  return {
    onStart: (items, dir, fmt) => store.startExport(items, dir, fmt),
    onItem: (id, status, error) => store.updateItem(id, { status, error }),
    onDone: () => store.setRunning(false),
  }
}

/**
 * Export a single note via the background export window: pick a destination,
 * show a 1-item progress panel, and hand the work off so it never blocks the
 * visible window. Returns `true` if it took over the export (including when the
 * user cancelled the directory dialog); returns `false` only when no background
 * window is available, signalling the caller to run its in-window fallback.
 */
export async function exportSingleNote(
  api: BanjuanAPI,
  note: { id: string; title: string },
  format: ExportFormat,
  pageIndex?: number,
): Promise<boolean> {
  if (!api.batchExport) return false
  const dir = await api.dialog.openDirectory()
  if (!dir) return true
  const runId = newRunId()
  // Items accumulate across runs, so namespace the id by runId to avoid
  // collisions when the same note is exported more than once.
  useExportManagerStore.getState().startExport(
    [{ id: `${runId}/${note.id}`, noteId: note.id, title: note.title, subPath: '' }],
    dir, format,
  )
  await api.batchExport.run({ runId, format, outputDir: dir, noteIds: [note.id], pageIndex })
  return true
}

export async function exportToDirectory(
  api: BanjuanAPI,
  entries: ExportEntry[],
  format: ExportFormat,
  opts: { outputDir?: string; observer?: ExportObserver } = {},
) {
  const dir = opts.outputDir || await api.dialog.openDirectory()
  if (!dir) return

  const obs = opts.observer ?? storeObserver()
  obs.onStart(
    entries.map(e => ({ id: e.id, noteId: e.id, title: e.title, subPath: e.subPath || '' })),
    dir,
    format,
  )

  for (const entry of entries) {
    obs.onItem(entry.id, 'exporting')
    try {
      const result = await entry.generate()
      const outputPath = entry.subPath ? `${dir}/${entry.subPath}` : dir
      if (format === 'markdown') {
        await api.export!.markdown({
          title: entry.title, markdown: result.markdown!, attachments: result.attachments,
          outputPath, files: result.files as Array<{ name: string; dataUrl: string }> | undefined,
        })
      } else if (format === 'pdf') {
        await api.export!.pdf({
          title: entry.title, html: result.html!, attachments: result.attachments,
          outputPath, files: result.files as Array<{ name: string; dataUrl: string }> | undefined,
        })
      } else {
        // Raw single-file formats (png / svg / json): write each file directly.
        for (const f of result.files ?? []) {
          await api.export!.writeFile({ outputPath, fileName: f.name, dataUrl: f.dataUrl, text: f.text })
        }
      }
      obs.onItem(entry.id, 'done')
    } catch (err: any) {
      obs.onItem(entry.id, 'error', err?.message || 'Unknown error')
    }
  }
  obs.onDone()
}
