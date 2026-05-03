import React, { useEffect, useState, useCallback } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import { PdfViewerProvider } from './PdfViewerContext.js'
import { usePdfViewer } from './PdfViewerContext.js'
import PdfToolbar from './PdfToolbar.js'
import PdfLeftSidebar from './PdfLeftSidebar.js'
import PdfInfoSidebar from './PdfInfoSidebar.js'
import PdfContentArea from './PdfContentArea.js'
import SearchPopup from './SearchPopup.js'
import { createHighlightFromSelection } from './HighlightTool.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import { useT } from '../../i18n/index.js'
import type { TextSelectInfo } from './PdfPage.js'
import TagInput from '../tags/TagInput.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '@banjuan/zotero-pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

;(globalThis as any).FontInspector = {
  enabled: true,
  fontAdded: () => {},
}

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  filePath: string
  docPath: string
  fileData?: ArrayBuffer
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function PdfViewerInner({ doc: initialDoc, onOpenNote }: Props) {
  const t = useT()
  const ctx = usePdfViewer()
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)
  const [doc, setDoc] = useState<DocInfo>(initialDoc)

  const handleTextSelect = useCallback(async (info: TextSelectInfo) => {
    if (ctx.activeTool === 'highlight') {
      await createHighlightFromSelection(doc.id, info, ctx.activeColor)
      reload()
    }
  }, [ctx.activeTool, ctx.activeColor, doc.id, reload])

  const handleAnnotationClick = useCallback((page: number, yFraction?: number) => {
    const el = ctx.scrollRef.current
    if (!el) return
    const pageEl = el.querySelector(`[data-page="${page}"]`) as HTMLElement | null
    if (!pageEl) { ctx.scrollToPage(page); return }
    const containerTop = el.getBoundingClientRect().top
    const pageTop = pageEl.getBoundingClientRect().top - containerTop + el.scrollTop
    const offset = yFraction != null ? pageEl.offsetHeight * yFraction : 0
    el.scrollTo({ top: pageTop + offset - 80, behavior: 'smooth' })
  }, [ctx])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const handleCreateNote = useCallback(async () => {
    const note = await window.electronAPI.notes.create({
      title: t('note.defaultTitle', doc.title),
      docId: doc.id,
      content: '',
    })
    onOpenNote?.(note)
  }, [doc, onOpenNote])

  const handleOpenNote = useCallback((note: any) => {
    onOpenNote?.(note)
  }, [onOpenNote])

  const handleDocUpdated = useCallback((updated: DocInfo) => {
    setDoc(updated)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PdfToolbar />
      <div style={{
        padding: '4px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      }}>
        <TagInput targetId={doc.id} targetType="document" compact />
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <PdfLeftSidebar
          docId={doc.id}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onOpenNote={handleOpenNote}
          onCreateNote={handleCreateNote}
        />
        <PdfContentArea
          annotations={annotations}
          docId={doc.id}
          onTextSelect={handleTextSelect}
          onHighlightClick={() => ctx.setLeftSidebarOpen(true)}
          onAnnotationCreated={reload}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
        />
        <PdfInfoSidebar
          doc={doc}
          onDocUpdated={handleDocUpdated}
        />
        <SearchPopup />
      </div>
    </div>
  )
}

export default function PdfViewer(props: Props) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageSizes, setPageSizesLocal] = useState<Array<{ w: number; h: number }>>([])

  const initialScale = 1.5 * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        let fileData = props.fileData
        if (!fileData) {
          fileData = await window.electronAPI.documents.readFileBuffer(props.docPath)
        }
        if (cancelled) return

        const data = new Uint8Array(fileData)
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return

        setNumPages(doc.numPages)
        setPdfDoc(doc)

        const firstPage = await doc.getPage(1)
        if (cancelled) return
        const vp = firstPage.getViewport({ scale: initialScale })
        const firstSize = { w: vp.width, h: vp.height }
        setPageSizesLocal(Array.from({ length: doc.numPages }, () => ({ ...firstSize })))
      } catch (err) {
        console.error('[PdfViewer] failed to load PDF:', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [props.fileData, props.docPath])

  return (
    <PdfViewerProvider pdfDoc={pdfDoc} numPages={numPages} initialPageSizes={pageSizes}>
      <PdfViewerInner {...props} />
    </PdfViewerProvider>
  )
}
