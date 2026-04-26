import React, { useEffect, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import PdfPage, { type TextSelectInfo, type PageInfo } from './PdfPage.js'
import { usePdfViewer } from './PdfViewerContext.js'

interface AnnotationData {
  id: string
  page: number | null
  position: any
  color: string
}

interface Props {
  annotations: AnnotationData[]
  onTextSelect: (info: TextSelectInfo) => void
  onHighlightClick: (id: string) => void
}

export default function PdfContentArea({ annotations, onTextSelect, onHighlightClick }: Props) {
  const ctx = usePdfViewer()
  const { pdfDoc, pageSizes, zoom, scrollRef, setCurrentPage, setPageSizes,
          searchMatches, currentMatchIndex, pageInfoMap } = ctx
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  const pdfScale = zoom * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS

  useEffect(() => {
    setScrollEl(scrollRef.current as HTMLElement | null)
  }, [scrollRef])

  // Recompute page sizes when zoom changes
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    const recalc = async () => {
      const sizes: Array<{ w: number; h: number }> = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        if (cancelled) return
        const vp = page.getViewport({ scale: pdfScale })
        sizes.push({ w: vp.width, h: vp.height })
      }
      if (!cancelled) setPageSizes(sizes)
    }
    recalc()
    return () => { cancelled = true }
  }, [pdfDoc, pdfScale, setPageSizes])

  // Track current page by scroll position
  useEffect(() => {
    const el = scrollRef.current
    if (!el || pageSizes.length === 0) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const scrollTop = el.scrollTop
        const viewMid = scrollTop + el.clientHeight / 2
        let cumHeight = 0
        for (let i = 0; i < pageSizes.length; i++) {
          cumHeight += pageSizes[i].h + 16
          if (cumHeight > viewMid) {
            setCurrentPage(i + 1)
            break
          }
        }
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, pageSizes, setCurrentPage])

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Array<{ id: string; color: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>>()
    for (const ann of annotations) {
      if (ann.page == null) continue
      const rects = ann.position?.rects
      if (!Array.isArray(rects) || rects.length === 0) continue
      if (!map.has(ann.page)) map.set(ann.page, [])
      map.get(ann.page)!.push({ id: ann.id, color: ann.color, rects })
    }
    return map
  }, [annotations])

  const searchHighlightsByPage = useMemo(() => {
    const map = new Map<number, Array<{ rects: Array<{ x: number; y: number; w: number; h: number }>; active: boolean }>>()
    searchMatches.forEach((match, idx) => {
      if (!map.has(match.page)) map.set(match.page, [])
      map.get(match.page)!.push({ rects: match.rects, active: idx === currentMatchIndex })
    })
    return map
  }, [searchMatches, currentMatchIndex])

  const handlePageReady = useCallback((pageNum: number, info: PageInfo) => {
    pageInfoMap.set(pageNum, info)
  }, [pageInfoMap])

  return (
    <div
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      style={{ flex: 1, overflow: 'auto', background: '#525659' }}
    >
      {pdfDoc && pageSizes.map((sz, idx) => {
        const pageNum = idx + 1
        return (
          <PdfPage
            key={pageNum}
            pdfDoc={pdfDoc}
            pageNum={pageNum}
            scale={pdfScale}
            baseSize={sz}
            scrollRoot={scrollEl}
            highlights={highlightsByPage.get(pageNum) || []}
            searchHighlights={searchHighlightsByPage.get(pageNum)}
            onTextSelect={onTextSelect}
            onHighlightClick={onHighlightClick}
            onPageReady={handlePageReady}
          />
        )
      })}
    </div>
  )
}
