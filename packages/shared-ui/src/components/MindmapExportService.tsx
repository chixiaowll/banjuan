import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { ReactFlowProvider, useReactFlow, useNodesInitialized, getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng } from 'html-to-image'
import MindmapCanvas from './mindmap/MindmapCanvas.js'
import { MindmapStoreContext, createMindmapStore } from './mindmap/useMindmapStore.js'
import type { MindmapStoreApi } from './mindmap/useMindmapStore.js'
import { useBanjuanAPI } from '../api.js'

type RenderRequest = {
  noteId: string
  resolve: (dataUrl: string | null) => void
}

let pendingRequest: RenderRequest | null = null
let notifyService: (() => void) | null = null

export function renderMindmapToImage(noteId: string): Promise<string | null> {
  return new Promise(resolve => {
    pendingRequest = { noteId, resolve }
    notifyService?.()
  })
}

function MindmapExportInner({ noteId, store, onDone }: {
  noteId: string
  store: MindmapStoreApi
  onDone: (dataUrl: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { fitView, getNodes } = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const capturedRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    capturedRef.current = false
    store.getState().init(noteId).then(() => setReady(true))
  }, [noteId, store])

  useEffect(() => {
    if (!nodesInitialized || capturedRef.current || !ready) return
    const nodes = getNodes()
    if (nodes.length === 0) return
    capturedRef.current = true

    setTimeout(async () => {
      try {
        fitView({ duration: 0, padding: 0.02 })
        await new Promise(r => setTimeout(r, 200))

        const container = containerRef.current
        const rfViewport = container?.querySelector('.react-flow__viewport') as HTMLElement | null
        if (!rfViewport || nodes.length === 0) { onDone(null); return }

        const bounds = getNodesBounds(nodes)
        const margin = 40
        const imgWidth = Math.ceil(bounds.width + margin * 2)
        const imgHeight = Math.ceil(bounds.height + margin * 2)
        const vp = getViewportForBounds(bounds, imgWidth, imgHeight, 0.5, 2, `${margin}px`)

        const dataUrl = await toPng(rfViewport, {
          backgroundColor: '#ffffff',
          width: imgWidth,
          height: imgHeight,
          pixelRatio: 2,
          style: {
            width: `${imgWidth}px`,
            height: `${imgHeight}px`,
            transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
          },
        })
        onDone(dataUrl)
      } catch {
        onDone(null)
      }
    }, 100)
  }, [nodesInitialized, ready, getNodes, fitView, onDone])

  if (!ready) return <div ref={containerRef} />

  return (
    <div ref={containerRef} style={{ width: 1200, height: 800 }}>
      <MindmapCanvas readonly />
    </div>
  )
}

export default function MindmapExportService() {
  const api = useBanjuanAPI()
  const [request, setRequest] = useState<RenderRequest | null>(null)
  const store = useMemo(() => createMindmapStore(api), [api])

  useEffect(() => {
    notifyService = () => {
      if (pendingRequest) {
        setRequest(pendingRequest)
        pendingRequest = null
      }
    }
    return () => { notifyService = null }
  }, [])

  const handleDone = useCallback((dataUrl: string | null) => {
    request?.resolve(dataUrl)
    setRequest(null)
  }, [request])

  return (
    <div style={{ position: 'fixed', left: -9999, top: -9999, width: 1200, height: 800, overflow: 'hidden' }}>
      {request && (
        <MindmapStoreContext.Provider value={store}>
          <ReactFlowProvider>
            <MindmapExportInner
              key={request.noteId}
              noteId={request.noteId}
              store={store}
              onDone={handleDone}
            />
          </ReactFlowProvider>
        </MindmapStoreContext.Provider>
      )}
    </div>
  )
}
