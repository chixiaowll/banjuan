import React, { useEffect, useRef, useState, useCallback } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'

interface ThumbProps {
  pageNum: number
  scrollRoot: HTMLElement | null
  onClickPage: (pageNum: number) => void
}

function Thumbnail({ pageNum, scrollRoot, onClickPage }: ThumbProps) {
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

  const handleClick = () => {
    onClickPage(pageNum)
    scrollToPage(pageNum)
  }

  return (
    <div
      ref={containerRef}
      data-page={pageNum}
      onClick={handleClick}
      style={{
        padding: 8, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}
    >
      <div style={{
        border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 2, overflow: 'hidden', background: 'var(--surface-raised)',
        width: '100%', aspectRatio: '0.707',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', visibility: rendered ? 'visible' : 'hidden' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'var(--pdf-tint, transparent)', pointerEvents: 'none' }} />
      </div>
      <span style={{ fontSize: 11, color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>{pageNum}</span>
    </div>
  )
}

export default function ThumbnailPanel() {
  const { numPages, currentPage } = usePdfViewer()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const skipNextScroll = useRef(false)

  useEffect(() => { setScrollEl(scrollRef.current) }, [])

  const scrollToActive = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    if (skipNextScroll.current) {
      skipNextScroll.current = false
      return
    }
    const el = container.querySelector(`[data-page="${currentPage}"]`) as HTMLElement | null
    if (!el) return
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const elTopInContainer = elRect.top - containerRect.top + container.scrollTop
    const target = elTopInContainer - container.clientHeight / 2 + elRect.height / 2
    container.scrollTop = target
  }, [currentPage])

  useEffect(() => {
    const raf = requestAnimationFrame(scrollToActive)
    return () => cancelAnimationFrame(raf)
  }, [scrollToActive])

  const handleClickPage = useCallback(() => {
    skipNextScroll.current = true
  }, [])

  return (
    <div ref={scrollRef} style={{ position: 'absolute', inset: 0, overflow: 'auto', paddingBottom: 80 }}>
      {Array.from({ length: numPages }, (_, i) => (
        <Thumbnail key={i + 1} pageNum={i + 1} scrollRoot={scrollEl} onClickPage={handleClickPage} />
      ))}
    </div>
  )
}
