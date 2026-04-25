import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Set up the worker for Electron/Vite context
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface Props {
  filePath: string
}

export default function PdfViewer({ filePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadPdf = async () => {
      const url = `file://${filePath}`
      const doc = await pdfjsLib.getDocument(url).promise
      if (!cancelled) {
        setPdfDoc(doc)
        setNumPages(doc.numPages)
      }
    }
    loadPdf()
    return () => { cancelled = true }
  }, [filePath])

  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return
    const container = containerRef.current
    container.innerHTML = ''

    const renderPages = async () => {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.margin = '8px auto'
        container.appendChild(canvas)

        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
      }
    }
    renderPages()
  }, [pdfDoc, scale])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>−</button>
        <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.25))}>+</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
          {numPages} pages
        </span>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', background: '#525659' }} />
    </div>
  )
}
