import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { renderAllStrokes } from '../../handwriting/renderStrokes.js'
import type { HandwritingPage } from '@banjuan/core'

interface Props {
  noteId: string
  noteTitle: string
  pageIndex?: number
}

interface HandwritingData {
  pages: HandwritingPage[]
  currentPageIndex: number
  pageSize: { width: number; height: number }
}

function PageCanvas({ page, pageSize, maxWidth }: {
  page: HandwritingPage
  pageSize: { width: number; height: number }
  maxWidth?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const aspect = pageSize.height / pageSize.width

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = pageSize.width * dpr
    canvas.height = pageSize.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    renderAllStrokes(ctx, page.snapshot.strokes, pageSize.width, pageSize.height)
  }, [page, pageSize])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: maxWidth != null ? Math.min(maxWidth, pageSize.width) : '100%',
        maxWidth: '100%',
        aspectRatio: `${pageSize.width} / ${pageSize.height}`,
        height: 'auto',
        borderRadius: 4,
        background: 'white',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}
    />
  )
}

export default function HandwritingEmbedPreview({ noteId, noteTitle, pageIndex }: Props) {
  const [data, setData] = useState<HandwritingData | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(600)

  useEffect(() => {
    if (!noteId) return
    window.electronAPI.notes.get(noteId).then((note: any) => {
      if (!note) return
      try {
        const parsed = JSON.parse(note.content)
        const typeMeta = note.typeMeta ?? {}
        setData({
          pages: parsed.pages ?? [],
          currentPageIndex: parsed.currentPageIndex ?? 0,
          pageSize: (typeMeta as any).pageSize ?? { width: 1024, height: 768 },
        })
      } catch { /* ignore */ }
    })
  }, [noteId])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const targetPage = pageIndex != null && data ? data.pages[pageIndex] : undefined

  // Screenshot handler for export
  const handleScreenshot = useCallback(async (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.noteId !== noteId) return
    if (!data || data.pages.length === 0) { detail.resolve(null); return }

    try {
      const page = targetPage ?? data.pages[data.currentPageIndex] ?? data.pages[0]
      const dpr = 2
      const canvas = document.createElement('canvas')
      canvas.width = data.pageSize.width * dpr
      canvas.height = data.pageSize.height * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) { detail.resolve(null); return }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(dpr, dpr)
      renderAllStrokes(ctx, page.snapshot.strokes, data.pageSize.width, data.pageSize.height)
      detail.resolve(canvas.toDataURL('image/png'))
    } catch {
      detail.resolve(null)
    }
  }, [noteId, data, targetPage])

  useEffect(() => {
    document.addEventListener('handwriting-screenshot-request', handleScreenshot)
    return () => document.removeEventListener('handwriting-screenshot-request', handleScreenshot)
  }, [handleScreenshot])

  if (!data) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</span>
  }

  if (data.pages.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Empty handwriting note</span>
  }

  if (targetPage) {
    return (
      <div style={{ padding: '10px 12px' }}>
        <PageCanvas
          page={targetPage}
          pageSize={data.pageSize}
        />
      </div>
    )
  }

  const showPages = data.pages.length <= 3 ? data.pages : data.pages.slice(0, 3)
  const hasMore = data.pages.length > 3

  return (
    <div ref={containerRef} style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {showPages.map((page, i) => (
          <div key={page.id} style={{ position: 'relative' }}>
            <PageCanvas
              page={page}
              pageSize={data.pageSize}
              maxWidth={data.pages.length === 1 ? containerWidth - 24 : Math.min(280, (containerWidth - 40) / Math.min(3, data.pages.length))}
            />
            {data.pages.length > 1 && (
              <span style={{
                position: 'absolute', bottom: 4, right: 6,
                fontSize: 10, color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.85)',
                padding: '1px 5px', borderRadius: 3,
              }}>
                {i + 1}
              </span>
            )}
          </div>
        ))}
      </div>
      {hasMore && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          +{data.pages.length - 3} more pages
        </div>
      )}
    </div>
  )
}
