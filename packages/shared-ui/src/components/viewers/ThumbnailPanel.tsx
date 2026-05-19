import React, { useEffect, useRef, useState } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'

interface ThumbProps {
  pageNum: number
  scrollRoot: HTMLElement | null
}

function Thumbnail({ pageNum, scrollRoot }: ThumbProps) {
  const { pdfDoc, currentPage, scrollToPage } = usePdfViewer()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !scrollRoot) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setVisible(true) },
      { root: scrollRoot, rootMargin: '400px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    if (!visible || rendered || !pdfDoc) return
    let cancelled = false
    const render = async () => {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelled) return
      const vp = page.getViewport({ scale: 0.3 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise.catch(() => {})
      if (!cancelled) setRendered(true)
    }
    render()
    return () => { cancelled = true }
  }, [visible, rendered, pdfDoc, pageNum])

  const isActive = currentPage === pageNum

  return (
    <div
      ref={containerRef}
      onClick={() => scrollToPage(pageNum)}
      style={{
        padding: 8, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}
    >
      <div style={{
        border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 2, overflow: 'hidden', background: '#fff',
        minHeight: 150, width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', visibility: rendered ? 'visible' : 'hidden' }} />
      </div>
      <span style={{ fontSize: 11, color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>{pageNum}</span>
    </div>
  )
}

export default function ThumbnailPanel() {
  const { numPages } = usePdfViewer()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  useEffect(() => { setScrollEl(scrollRef.current) }, [])

  return (
    <div ref={scrollRef} style={{ height: '100%', overflow: 'auto', paddingBottom: 80 }}>
      {Array.from({ length: numPages }, (_, i) => (
        <Thumbnail key={i + 1} pageNum={i + 1} scrollRoot={scrollEl} />
      ))}
    </div>
  )
}
