import type { BanjuanAPI, ExportFormat } from '../api.js'
import type { ExportEntry } from './exportToDirectory.js'
import { renderMindmapToImage } from '../components/MindmapExportService.js'
import {
  exportBlocksToMarkdown, exportBlocksToHTML, extractExportAttachmentPaths,
  exportMindmapToMarkdown, exportMindmapToHTML, exportHandwritingToFiles, exportHandwritingToHTML,
  screenshotHandwritingEmbed,
} from './noteExport.js'

/** A note paired with its computed export sub-path (folder structure under outputDir). */
export interface ExportNote {
  note: any
  subPath: string
}

/**
 * List notes under `folder` (or the whole library) with each note's sub-path
 * relative to the export root. Used by the visible window to populate the
 * progress panel and by the background window to run a folder/library export.
 */
export async function listExportNotes(api: BanjuanAPI, folder: string | null): Promise<ExportNote[]> {
  const notes = folder
    ? await api.notes.list({ folder } as any)
    : await api.notes.list()
  return notes.map((note: any) => {
    const notePath = note.path?.split('/') ?? []
    const subPath = notePath.length > 1
      ? (folder ? notePath.slice(0, -1).join('/').slice(folder.length + 1) : notePath.slice(0, -1).join('/'))
      : ''
    return { note, subPath }
  })
}

/** Resolve an explicit set of note ids (single note or selection); flat sub-path. */
export async function getExportNotesByIds(api: BanjuanAPI, ids: string[]): Promise<ExportNote[]> {
  const notes = await Promise.all(ids.map(id => api.notes.get(id)))
  return notes.filter(Boolean).map((note: any) => ({ note, subPath: '' }))
}

/** Resolve the notes a job targets (by explicit ids, else by folder). */
export async function resolveExportNotes(
  api: BanjuanAPI,
  job: { folder?: string | null; noteIds?: string[] },
): Promise<ExportNote[]> {
  if (job.noteIds && job.noteIds.length > 0) return getExportNotesByIds(api, job.noteIds)
  return listExportNotes(api, job.folder ?? null)
}

/**
 * Build the list of export entries (with lazy `generate()` closures) for the
 * given notes and format. `editor` is a BlockNote editor used to serialize
 * markdown-note blocks. Mindmap rendering uses `renderMindmapToImage`, which
 * requires a `<MindmapExportHost/>` mounted in the same window.
 *
 * Supports the file-pipeline formats (markdown/pdf) for every note type and the
 * raw single-file formats offered per note type: png/svg/json for mindmaps,
 * png for handwriting (honoring `pageIndex` when given).
 */
export function buildExportEntries(
  api: BanjuanAPI,
  notes: ExportNote[],
  fmt: ExportFormat,
  editor: any,
  ctx: { pageIndex?: number } = {},
): ExportEntry[] {
  return notes.map(({ note, subPath }) => {
    const safeTitle = note.title.replace(/[/\\:*?"<>|]/g, '_')
    return {
      id: note.id, title: note.title, subPath,
      generate: async () => {
        if (note.type === 'mindmap') {
          if (fmt === 'json') {
            const nodes = await api.mindmaps.getNodes(note.id)
            return { attachments: [], files: [{ name: `${safeTitle}.json`, text: JSON.stringify(nodes, null, 2) }] }
          }
          if (fmt === 'png' || fmt === 'svg') {
            const dataUrl = await renderMindmapToImage(note.id, fmt)
            if (!dataUrl) throw new Error('Mindmap render failed')
            return { attachments: [], files: [{ name: `${safeTitle}.${fmt}`, dataUrl }] }
          }
          const dataUrl = await renderMindmapToImage(note.id, 'png')
          if (dataUrl) {
            const imgName = `${safeTitle}.png`
            return fmt === 'markdown'
              ? { markdown: `![${note.title}](images/${imgName})`, attachments: [], files: [{ name: imgName, dataUrl }] }
              : { html: `<div class="mindmap-export"><img src="${dataUrl}" style="max-width:100%" /></div>`, attachments: [] }
          }
          return fmt === 'markdown'
            ? { markdown: await exportMindmapToMarkdown(api, note.id, note.title), attachments: [] }
            : { html: await exportMindmapToHTML(api, note.id, note.title), attachments: [] }
        }
        if (note.type === 'handwriting') {
          if (fmt === 'png') {
            const dataUrl = await screenshotHandwritingEmbed(api, note.id, ctx.pageIndex ?? 0)
            if (!dataUrl) throw new Error('Handwriting render failed')
            return { attachments: [], files: [{ name: `${safeTitle}.png`, dataUrl }] }
          }
          if (fmt === 'markdown') {
            return await exportHandwritingToFiles(api, note.id, note.title)
          }
          return { html: await exportHandwritingToHTML(api, note.id, note.title), attachments: [] }
        }
        const full = await api.notes.get(note.id)
        if (!full) throw new Error('Note not found')
        const blocks = JSON.parse(full.content)
        if (fmt === 'markdown') {
          const result = await exportBlocksToMarkdown(editor, blocks, api)
          const attachments = extractExportAttachmentPaths(blocks)
          return { markdown: result.markdown, attachments, files: result.files }
        }
        const html = await exportBlocksToHTML(editor, blocks, api)
        const attachments = extractExportAttachmentPaths(blocks)
        return { html, attachments }
      },
    }
  })
}
