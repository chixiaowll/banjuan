import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { ReactFlowProvider, useReactFlow, useNodesInitialized, getNodesBounds } from '@xyflow/react'
import MindmapCanvas from '../../mindmap/MindmapCanvas.js'
import { MindmapStoreContext, createMindmapStore } from '../../mindmap/useMindmapStore.js'
import type { MindmapStoreApi } from '../../mindmap/useMindmapStore.js'

interface Props {
  noteId: string
  noteTitle: string
}

const PADDING = 20

function MindmapEmbedInner({ noteId, store }: { noteId: string; store: MindmapStoreApi }) {
  const [ready, setReady] = useState(false)
  const [height, setHeight] = useState(400)
  const containerRef = useRef<HTMLDivElement>(null)
  const { fitView, getNodes, getViewport } = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const sizedRef = useRef(false)

  useEffect(() => {
    if (!noteId) return
    store.getState().init(noteId).then(() => setReady(true))
  }, [noteId, store])

  useEffect(() => {
    if (!nodesInitialized || sizedRef.current) return
    const nodes = getNodes()
    if (nodes.length === 0) return
    sizedRef.current = true

    const bounds = getNodesBounds(nodes)
    const fullW = bounds.width + PADDING * 2
    const fullH = bounds.height + PADDING * 2
    const containerW = containerRef.current?.clientWidth ?? fullW
    const scale = Math.min(1, containerW / fullW)
    setHeight(fullH * scale)

    setTimeout(() => fitView({ duration: 0, padding: 0.02 }), 60)
  }, [nodesInitialized, getNodes, fitView, getViewport])

  const handleScreenshot = useCallback(async (e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.noteId !== noteId) return
    const container = containerRef.current
    if (!container) { detail.resolve(null); return }

    const nodes = getNodes()
    if (nodes.length === 0) { detail.resolve(null); return }

    const bounds = getNodesBounds(nodes)
    const fullWidth = bounds.width + PADDING * 2
    const fullHeight = bounds.height + PADDING * 2

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
    }
  }, [noteId, getNodes, fitView])

  useEffect(() => {
    document.addEventListener('mindmap-screenshot-request', handleScreenshot)
    return () => document.removeEventListener('mindmap-screenshot-request', handleScreenshot)
  }, [handleScreenshot])

  if (!ready) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading mindmap...</span>
  }

  const style: React.CSSProperties = {
    width: '100%',
    height,
    borderRadius: 6,
    overflow: 'hidden',
  }

  return (
    <div ref={containerRef} style={style}>
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
