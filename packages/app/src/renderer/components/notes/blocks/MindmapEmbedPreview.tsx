import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { ReactFlowProvider, useReactFlow, getNodesBounds } from '@xyflow/react'
import MindmapCanvas from '../../mindmap/MindmapCanvas.js'
import { MindmapStoreContext, createMindmapStore, useMindmapStore } from '../../mindmap/useMindmapStore.js'
import type { MindmapStoreApi } from '../../mindmap/useMindmapStore.js'

interface Props {
  noteId: string
  noteTitle: string
}

function MindmapEmbedInner({ noteId, store }: { noteId: string; store: MindmapStoreApi }) {
  const [ready, setReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { fitView, getNodes } = useReactFlow()

  useEffect(() => {
    if (!noteId) return
    store.getState().init(noteId).then(() => setReady(true))
  }, [noteId, store])

  const handleScreenshot = useCallback(async (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.noteId !== noteId) return
    const container = containerRef.current
    if (!container) { detail.resolve(null); return }

    const nodes = getNodes()
    if (nodes.length === 0) { detail.resolve(null); return }

    const bounds = getNodesBounds(nodes)
    const padding = 40
    const fullWidth = bounds.width + padding * 2
    const fullHeight = bounds.height + padding * 2

    const origWidth = container.style.width
    const origHeight = container.style.height
    const origOverflow = container.style.overflow

    container.style.width = `${fullWidth}px`
    container.style.height = `${fullHeight}px`
    container.style.overflow = 'hidden'

    await new Promise(r => setTimeout(r, 50))
    fitView({ duration: 0, padding: 0.05, maxZoom: 1, minZoom: 1 })
    await new Promise(r => setTimeout(r, 100))

    try {
      const viewport = container.querySelector('.react-flow__viewport') as HTMLElement
      if (!viewport) { detail.resolve(null); return }
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(viewport, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: fullWidth,
        height: fullHeight,
      })
      detail.resolve(dataUrl)
    } catch {
      detail.resolve(null)
    } finally {
      container.style.width = origWidth
      container.style.height = origHeight
      container.style.overflow = origOverflow
      setTimeout(() => fitView({ duration: 0, padding: 0.2, maxZoom: 1 }), 50)
    }
  }, [noteId, getNodes, fitView])

  useEffect(() => {
    document.addEventListener('mindmap-screenshot-request', handleScreenshot)
    return () => document.removeEventListener('mindmap-screenshot-request', handleScreenshot)
  }, [handleScreenshot])

  if (!ready) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading mindmap...</span>
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: 400, borderRadius: 6, overflow: 'hidden' }}>
      <MindmapCanvas readonly />
    </div>
  )
}

export default function MindmapEmbedPreview({ noteId, noteTitle }: Props) {
  const store = useMemo(() => createMindmapStore(), [])

  return (
    <MindmapStoreContext.Provider value={store}>
      <ReactFlowProvider>
        <MindmapEmbedInner noteId={noteId} store={store} />
      </ReactFlowProvider>
    </MindmapStoreContext.Provider>
  )
}
