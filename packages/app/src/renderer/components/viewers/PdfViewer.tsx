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
import type { TextSelectInfo } from './PdfPage.js'

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
  fileData: ArrayBuffer
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function PdfViewerInner({ doc: initialDoc, onOpenNote }: Props) {
  const ctx = usePdfViewer()
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)
  const [doc, setDoc] = useState<DocInfo>(initialDoc)

  const handleTextSelect = useCallback(async (info: TextSelectInfo) => {
    if (ctx.activeTool === 'highlight') {
      await createHighlightFromSelection(doc.id, info, ctx.activeColor)
      reload()
    }
  }, [ctx.activeTool, ctx.activeColor, doc.id, reload])

  const handleAnnotationClick = useCallback((page: number) => {
    ctx.scrollToPage(page)
  }, [ctx])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const handleCreateNote = useCallback(async () => {
    const note = await window.electronAPI.notes.create({
      title: `${doc.title} — 笔记`,
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
          onTextSelect={handleTextSelect}
          onHighlightClick={() => ctx.setLeftSidebarOpen(true)}
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
  const [pageSizes, setPageSizes] = useState<Array<{ w: number; h: number }>>([])

  const initialScale = 1.5 * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = new Uint8Array(props.fileData)
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return
        setPdfDoc(doc)
        const sizes: Array<{ w: number; h: number }> = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          if (cancelled) return
          const vp = page.getViewport({ scale: initialScale })
          sizes.push({ w: vp.width, h: vp.height })
        }
        if (!cancelled) setPageSizes(sizes)
      } catch (err) {
        console.error('[PdfViewer] failed to load PDF:', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [props.fileData])

  if (!pdfDoc) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading PDF...</div>
  }

  return (
    <PdfViewerProvider pdfDoc={pdfDoc} numPages={pdfDoc.numPages} initialPageSizes={pageSizes}>
      <PdfViewerInner {...props} />
    </PdfViewerProvider>
  )
}
