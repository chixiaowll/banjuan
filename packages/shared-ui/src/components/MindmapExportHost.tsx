import { useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import MindmapCanvas from './mindmap/MindmapCanvas.js'
import { MindmapStoreContext, createMindmapStore } from './mindmap/useMindmapStore.js'
import { useBanjuanAPI } from '../api.js'
import { _dequeueMindmapExport, captureMindmapFromTabPanel } from './MindmapExportService.js'

/**
 * Renders a single mindmap off-screen on demand so `renderMindmapToImage` can
 * screenshot it. The mindmap is laid out at full container size but clipped from
 * view (`clipPath: inset(100%)`) — it must keep real layout dimensions for
 * React Flow to measure nodes and for html-to-image to capture them.
 *
 * Mounted both in the visible window (in-window export fallback) and in the
 * hidden background export window (the non-blocking batch path).
 */
export default function MindmapExportHost() {
  const api = useBanjuanAPI()
  const [exportMindmapId, setExportMindmapId] = useState<string | null>(null)
  const exportPanelIdRef = useRef<string | null>(null)
  const exportStoreRef = useRef<ReturnType<typeof createMindmapStore> | null>(null)
  const exportBusyRef = useRef(false)
  if (!exportStoreRef.current) exportStoreRef.current = createMindmapStore(api)

  useEffect(() => {
    const handler = async () => {
      const req = _dequeueMindmapExport()
      if (!req || exportBusyRef.current) {
        if (req) req.resolve(null)
        return
      }
      exportBusyRef.current = true
      try {
        const panelId = `__export-mm-${req.noteId}`
        exportPanelIdRef.current = panelId
        const store = exportStoreRef.current!
        await store.getState().init(req.noteId)
        setExportMindmapId(req.noteId)

        const pollForNodes = () => new Promise<HTMLElement | null>(resolve => {
          let elapsed = 0
          const iv = setInterval(() => {
            elapsed += 200
            const panel = document.querySelector(`[data-tab-panel="${panelId}"]`) as HTMLElement | null
            if (panel) {
              const nodeEls = panel.querySelectorAll('.react-flow__node')
              if (nodeEls.length > 0) {
                clearInterval(iv)
                resolve(panel)
                return
              }
            }
            if (elapsed > 20000) { clearInterval(iv); resolve(null) }
          }, 200)
        })

        const panel = await pollForNodes()
        if (!panel) {
          req.resolve(null)
          setExportMindmapId(null)
          exportPanelIdRef.current = null
          return
        }

        // Wait for fonts and a settle frame so glyphs and edges render before capture.
        try { await (document as any).fonts?.ready } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 2000))

        const dataUrl = await captureMindmapFromTabPanel(panel, req.format)
        req.resolve(dataUrl)

        setExportMindmapId(null)
        exportPanelIdRef.current = null
      } catch {
        req.resolve(null)
      } finally {
        exportBusyRef.current = false
      }
    }
    document.addEventListener('mindmap-export-request', handler)
    return () => document.removeEventListener('mindmap-export-request', handler)
  }, [api])

  if (!exportMindmapId || !exportPanelIdRef.current || !exportStoreRef.current) return null

  return (
    <div
      key={exportMindmapId}
      data-tab-panel={exportPanelIdRef.current}
      style={{
        position: 'absolute',
        inset: 0,
        clipPath: 'inset(100%)',
        pointerEvents: 'none',
      }}
    >
      <MindmapStoreContext.Provider value={exportStoreRef.current}>
        <ReactFlowProvider>
          <MindmapCanvas readonly />
        </ReactFlowProvider>
      </MindmapStoreContext.Provider>
    </div>
  )
}
