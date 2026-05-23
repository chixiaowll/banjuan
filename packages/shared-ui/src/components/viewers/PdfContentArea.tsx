import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import PdfPage, { type TextSelectInfo, type PageInfo } from './PdfPage.js'
import { usePdfViewer } from './PdfViewerContext.js'
import { useT } from '../../i18n/index.js'

const PAGE_GAP = 16
const OVERSCAN = 3

interface AnnotationData {
  id: string
  page: number | null
  position: any
  color: string
  type: string
}

const SCROLLBAR_WIDTH = 17
const CONTENT_PADDING = 24

interface Props {
  annotations: AnnotationData[]
  docId: string
  onTextSelect: (info: TextSelectInfo) => void
  onHighlightClick: (id: string) => void
  onAnnotationContextMenu?: (e: React.MouseEvent, id: string) => void
  onAnnotationCreated: () => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
  onPageSizesComputed?: (sizes: Array<{ w: number; h: number }>) => void
}

function computePageOffsets(pageSizes: Array<{ w: number; h: number }>): number[] {
  const offsets: number[] = []
  let y = 0
  for (const sz of pageSizes) {
    offsets.push(y)
    y += sz.h + PAGE_GAP
  }
  return offsets
}

function getVisibleRange(
  offsets: number[],
  pageSizes: Array<{ w: number; h: number }>,
  scrollTop: number,
  viewportHeight: number,
): [number, number] {
  if (offsets.length === 0) return [0, 0]
  let first = 0
  let last = offsets.length - 1

  // Binary search for first visible page
  let lo = 0, hi = offsets.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const bottom = offsets[mid] + pageSizes[mid].h + PAGE_GAP
    if (bottom < scrollTop) lo = mid + 1
    else hi = mid - 1
  }
  first = Math.max(0, lo - OVERSCAN)

  // Binary search for last visible page
  const viewBottom = scrollTop + viewportHeight
  lo = first
  hi = offsets.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (offsets[mid] > viewBottom) hi = mid - 1
    else lo = mid + 1
  }
  last = Math.min(offsets.length - 1, hi + OVERSCAN)

  return [first, last]
}

export default function PdfContentArea({ annotations, docId, onTextSelect, onHighlightClick, onAnnotationContextMenu, onAnnotationCreated, onAnnotationDelete, onAnnotationUpdate, onPageSizesComputed }: Props) {
  const t = useT()
  const ctx = usePdfViewer()
  const { pdfDoc, rawPageSize, rawPageSizes, pageSizes, zoom, scrollRef, setCurrentPage, setPageSizes,
          numPages, searchMatches, currentMatchIndex, pageInfoMap,
          activeTool, activeColor } = ctx
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 5])
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    setScrollEl(scrollRef.current as HTMLElement | null)
  }, [scrollRef])

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setContainerWidth(w)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [scrollRef])

  // Compute page sizes from container width + raw page sizes + zoom,
  // and preserve scroll position across size changes.
  const prevSizesRef = useRef(pageSizes)
  useEffect(() => {
    if (rawPageSizes.length === 0 || containerWidth <= 0 || numPages <= 0) return
    const availableWidth = containerWidth - SCROLLBAR_WIDTH - CONTENT_PADDING
    const refW = rawPageSizes[0].w
    const baseScale = availableWidth / refW
    const scale = baseScale * zoom
    const newSizes = rawPageSizes.map(raw => ({
      w: raw.w * scale,
      h: raw.h * scale,
    }))

    // Capture current position before sizes change
    const el = scrollRef.current
    const oldSizes = prevSizesRef.current
    let savedPage = 0
    let savedFraction = 0
    if (el && oldSizes.length > 0 && el.scrollTop > 0) {
      let cumTop = 0
      for (let i = 0; i < oldSizes.length; i++) {
        const pageBottom = cumTop + oldSizes[i].h + PAGE_GAP
        if (pageBottom > el.scrollTop || i === oldSizes.length - 1) {
          savedPage = i
          savedFraction = oldSizes[i].h > 0 ? (el.scrollTop - cumTop) / oldSizes[i].h : 0
          break
        }
        cumTop = pageBottom
      }
    }

    prevSizesRef.current = newSizes
    setPageSizes(newSizes)
    onPageSizesComputed?.(newSizes)

    // Restore position after sizes change
    if (el && savedPage > 0 || savedFraction > 0) {
      requestAnimationFrame(() => {
        let newTop = 0
        for (let i = 0; i < savedPage && i < newSizes.length; i++) {
          newTop += newSizes[i].h + PAGE_GAP
        }
        newTop += savedFraction * (newSizes[savedPage]?.h ?? 0)
        el!.scrollTo({ top: newTop, behavior: 'instant' as ScrollBehavior })
      })
    }
  }, [rawPageSizes, containerWidth, zoom, numPages, scrollRef, setPageSizes, onPageSizesComputed])

  const pdfScale = useMemo(() => {
    if (rawPageSizes.length === 0 || containerWidth <= 0) return zoom * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS
    const availableWidth = containerWidth - SCROLLBAR_WIDTH - CONTENT_PADDING
    return (availableWidth / rawPageSizes[0].w) * zoom
  }, [rawPageSizes, containerWidth, zoom])

  const pageOffsets = useMemo(() => computePageOffsets(pageSizes), [pageSizes])
  const totalHeight = useMemo(() => {
    if (pageSizes.length === 0) return 0
    const last = pageSizes.length - 1
    return pageOffsets[last] + pageSizes[last].h + PAGE_GAP
  }, [pageOffsets, pageSizes])

  // Track current page + visible range by scroll position
  useEffect(() => {
    const el = scrollRef.current
    if (!el || pageSizes.length === 0) return
    let ticking = false

    const update = () => {
      const scrollTop = el.scrollTop
      const viewH = el.clientHeight
      const viewMid = scrollTop + viewH / 2

      let cumHeight = 0
      for (let i = 0; i < pageSizes.length; i++) {
        cumHeight += pageSizes[i].h + PAGE_GAP
        if (cumHeight > viewMid) {
          setCurrentPage(i + 1)
          break
        }
      }

      const range = getVisibleRange(pageOffsets, pageSizes, scrollTop, viewH)
      setVisibleRange(range)
    }

    // Initial computation
    update()

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        update()
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    const resizeObs = new ResizeObserver(() => {
      requestAnimationFrame(update)
    })
    resizeObs.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      resizeObs.disconnect()
    }
  }, [scrollRef, pageSizes, pageOffsets, setCurrentPage])

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Array<{ id: string; color: string; type?: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>>()
    for (const ann of annotations) {
      if (ann.page == null) continue
      const rects = ann.position?.rects
      if (!Array.isArray(rects) || rects.length === 0) continue
      if (!map.has(ann.page)) map.set(ann.page, [])
      map.get(ann.page)!.push({ id: ann.id, color: ann.color, type: ann.type, rects })
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

  const [firstVisible, lastVisible] = visibleRange

  return (
    <div
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      style={{ flex: 1, overflow: 'auto', background: '#525659' }}
    >
      {!pdfDoc || pageSizes.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa' }}>
          {t('pdf.loadingPdf')}
        </div>
      ) : (
        <div style={{ position: 'relative', height: totalHeight }}>
          {pageSizes.map((sz, idx) => {
            if (idx < firstVisible || idx > lastVisible) return null
            const pageNum = idx + 1
            return (
              <div
                key={pageNum}
                style={{
                  position: 'absolute',
                  top: pageOffsets[idx],
                  left: 0,
                  right: 0,
                }}
              >
                <PdfPage
                  pdfDoc={pdfDoc}
                  pageNum={pageNum}
                  scale={pdfScale}
                  baseSize={sz}
                  scrollRoot={scrollEl}
                  highlights={ctx.annotationsVisible ? (highlightsByPage.get(pageNum) || []) : []}
                  searchHighlights={searchHighlightsByPage.get(pageNum)}
                  onTextSelect={onTextSelect}
                  onHighlightClick={onHighlightClick}
                  onAnnotationContextMenu={onAnnotationContextMenu}
                  onPageReady={handlePageReady}
                  activeTool={activeTool}
                  activeColor={activeColor}
                  inkWidth={ctx.inkWidth}
                  inkEraserActive={ctx.inkEraserActive}
                  docId={docId}
                  annotations={ctx.annotationsVisible ? annotations : []}
                  onAnnotationCreated={onAnnotationCreated}
                  onAnnotationDelete={onAnnotationDelete}
                  onAnnotationUpdate={onAnnotationUpdate}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
