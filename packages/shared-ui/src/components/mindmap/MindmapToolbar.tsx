import React, { useState, useCallback, useRef } from 'react'
import { PanelLeft, PanelRight, Undo2, Redo2, Trash2, FileDown, Image, FileCode, FileJson, FileText, FileImage, GripVertical, GitBranchPlus, Ungroup, Link2, Square, Braces } from 'lucide-react'
import { useMindmapStore, useMindmapStoreApi } from './useMindmapStore.js'
import { THEMES, themeNameKey } from './themes.js'
import { toPng, toSvg } from 'html-to-image'
import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'
import { exportToDirectory, exportSingleNote } from '../../utils/exportToDirectory.js'
import { useEscapeKey } from '../../utils/useEscapeKey.js'
import { useShallow } from 'zustand/react/shallow'

interface TitleBarProps {
  onToggleLeftSidebar?: () => void
  onToggleRightSidebar?: () => void
}

export function MindmapTitleBar({ onToggleLeftSidebar, onToggleRightSidebar }: TitleBarProps) {
  const t = useT()
  const api = useBanjuanAPI()
  const { mindmapId, mindmapTitle, layout, theme, setTitle, setLayout, setTheme } = useMindmapStore(useShallow(s => ({ mindmapId: s.mindmapId, mindmapTitle: s.mindmapTitle, layout: s.layout, theme: s.theme, setTitle: s.setTitle, setLayout: s.setLayout, setTheme: s.setTheme })))
  // Nodes and edges are read when exporting, not subscribed to: they change on
  // every frame of a drag, and the title bar re-rendered with them.
  const storeApi = useMindmapStoreApi()

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  useEscapeKey(exportMenuOpen, () => setExportMenuOpen(false))
  const barRef = useRef<HTMLDivElement>(null)

  // Where the page has no file download (iPad's web view ignores <a download>),
  // a file goes through the platform's export instead (its share sheet).
  const saveFile = useCallback(async (format: 'png' | 'svg' | 'json', file: { name: string; dataUrl?: string; text?: string }) => {
    if (!api.batchExport && api.export?.writeFile) {
      await exportToDirectory(api, [{ id: mindmapId || 'mindmap', title: mindmapTitle || 'mindmap', generate: async () => ({ attachments: [], files: [file] }) }], format)
      return
    }
    const a = document.createElement('a')
    const url = file.dataUrl ?? URL.createObjectURL(new Blob([file.text ?? ''], { type: 'application/json' }))
    a.href = url
    a.download = file.name
    a.click()
    if (!file.dataUrl) URL.revokeObjectURL(url)
  }, [api, mindmapId, mindmapTitle])

  const handleExport = useCallback(async (format: 'png' | 'svg' | 'json' | 'pdf' | 'markdown') => {
    setExportMenuOpen(false)
    const { rfNodes, rfEdges, boundaries, summaries } = storeApi.getState()

    if (format === 'json') {
      const data = JSON.stringify({ nodes: rfNodes.map(n => n.data), edges: rfEdges }, null, 2)
      await saveFile('json', { name: `${mindmapTitle || 'mindmap'}.json`, text: data })
      return
    }
    // Render-heavy formats run in the background export window (re-rendered from
    // saved data) so they never block this window.
    if (mindmapId && await exportSingleNote(api, { id: mindmapId, title: mindmapTitle || 'mindmap' }, format)) return

    // This map's canvas — the first one in the page could be another tab's, or a preview.
    const scope = barRef.current?.closest('[data-tab-panel]') ?? barRef.current?.parentElement?.parentElement ?? document
    const canvasEl = scope.querySelector('.mindmap-canvas') as HTMLElement | null
    if (!canvasEl || rfNodes.length === 0) return

    const rfViewport = canvasEl.querySelector('.react-flow__viewport') as HTMLElement
    if (!rfViewport) return

    const nodeBounds = getNodesBounds(rfNodes)
    let minX = nodeBounds.x, minY = nodeBounds.y
    let maxX = nodeBounds.x + nodeBounds.width, maxY = nodeBounds.y + nodeBounds.height

    const BOUNDARY_PAD = 24
    for (const b of boundaries) {
      const bNodes = rfNodes.filter(n => b.nodeIds.includes(n.id))
      for (const n of bNodes) {
        const w = n.measured?.width ?? n.width ?? 160
        const h = n.measured?.height ?? n.height ?? 40
        minX = Math.min(minX, n.position.x - BOUNDARY_PAD)
        minY = Math.min(minY, n.position.y - BOUNDARY_PAD)
        maxX = Math.max(maxX, n.position.x + w + BOUNDARY_PAD)
        maxY = Math.max(maxY, n.position.y + h + BOUNDARY_PAD)
      }
    }

    const BRACE_W = 20, SUMMARY_GAP = 16
    for (const s of summaries) {
      const sNode = rfNodes.find(n => n.id === s.summaryNodeId)
      if (sNode) {
        const sw = sNode.measured?.width ?? sNode.width ?? 160
        const sh = sNode.measured?.height ?? sNode.height ?? 40
        maxX = Math.max(maxX, sNode.position.x + sw)
        maxY = Math.max(maxY, sNode.position.y + sh)
      }
      const sNodes = rfNodes.filter(n => s.nodeIds.includes(n.id))
      for (const n of sNodes) {
        const w = n.measured?.width ?? n.width ?? 160
        maxX = Math.max(maxX, n.position.x + w + SUMMARY_GAP + BRACE_W)
      }
    }

    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    const margin = 40
    const imgWidth = Math.ceil(bounds.width + margin * 2)
    const imgHeight = Math.ceil(bounds.height + margin * 2)
    const vp = getViewportForBounds(bounds, imgWidth, imgHeight, 0.5, 2, `${margin}px`)

    if (format === 'markdown' || format === 'pdf') {
      if (!api.export) return
      const capturedRfViewport = rfViewport
      const capturedImgW = imgWidth, capturedImgH = imgHeight, capturedVp = vp
      const safeTitle = (mindmapTitle || 'mindmap').replace(/[/\\:*?"<>|]/g, '_')
      exportToDirectory(api, [{
        id: mindmapId || 'mindmap', title: mindmapTitle || 'mindmap',
        generate: async () => {
          const dataUrl = await toPng(capturedRfViewport, {
            backgroundColor: '#ffffff',
            width: capturedImgW, height: capturedImgH, pixelRatio: 3,
            style: {
              width: `${capturedImgW}px`, height: `${capturedImgH}px`,
              transform: `translate(${capturedVp.x}px, ${capturedVp.y}px) scale(${capturedVp.zoom})`,
            },
          })
          if (format === 'markdown') {
            const imgName = `${safeTitle}.png`
            return { markdown: `![${mindmapTitle || 'mindmap'}](images/${imgName})`, attachments: [], files: [{ name: imgName, dataUrl }] }
          }
          return { html: `<div class="mindmap-export"><img src="${dataUrl}" style="max-width:100%" /></div>`, attachments: [] }
        },
      }], format)
      return
    }

    const exporter = format === 'png' ? toPng : toSvg

    const dataUrl = await exporter(rfViewport, {
      backgroundColor: format === 'png' ? '#ffffff' : undefined,
      width: imgWidth,
      height: imgHeight,
      pixelRatio: format === 'png' ? 3 : 1,
      style: {
        width: `${imgWidth}px`,
        height: `${imgHeight}px`,
        transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
      },
    })
    await saveFile(format, { name: `${mindmapTitle || 'mindmap'}.${format}`, dataUrl })
  }, [storeApi, mindmapTitle, mindmapId, api, saveFile])

  const iconBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', fontSize: 14, cursor: 'pointer',
    color: 'var(--text-muted)', padding: '4px', display: 'inline-flex', alignItems: 'center',
  }

  const selectStyle: React.CSSProperties = {
    border: '1px solid var(--border, #e0e0e0)', background: 'var(--surface, #fff)', borderRadius: 4,
    fontSize: 11, padding: '3px 4px', color: 'var(--text, #333)', flexShrink: 0,
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', right: 0, marginTop: 4,
    background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 100, minWidth: 120, padding: '4px 0',
  }

  const dropdownItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '6px 12px', border: 'none', background: 'none',
    textAlign: 'left', fontSize: 12, cursor: 'pointer', color: 'var(--text, #333)',
  }

  return (
    <div ref={barRef} style={{
      height: 40, padding: '0 12px', borderBottom: '1px solid var(--border, #e0e0e0)',
      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      background: 'var(--surface, #fff)', minWidth: 0,
      position: 'relative', zIndex: 10,
    }}>
      {onToggleLeftSidebar && (
        <button onClick={onToggleLeftSidebar} title={t('common.toggleSidebar')} style={iconBtnStyle}><PanelLeft size={16} /></button>
      )}
      <input
        value={mindmapTitle}
        onChange={e => setTitle(e.target.value)}
        style={{ border: 'none', fontSize: 15, fontWeight: 600, minWidth: 80, flex: '1 1 200px', outline: 'none', background: 'transparent', color: 'var(--text, #333)', overflow: 'hidden', textOverflow: 'ellipsis' }}
      />

      <select value={layout} onChange={e => setLayout(e.target.value)} style={selectStyle}>
        <option value="mindmap">{t('mindmap.layoutMindmap')}</option>
        <option value="logical">{t('mindmap.layoutLogical')}</option>
        <option value="organization">{t('mindmap.layoutOrg')}</option>
      </select>

      <select value={theme} onChange={e => setTheme(e.target.value)} style={selectStyle}>
        {Object.entries(THEMES).map(([key, th]) => (
          <option key={key} value={key}>{t(themeNameKey(key) as any) || th.name}</option>
        ))}
      </select>

      {/* Export */}
      <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => setExportMenuOpen(v => !v)} title={t('mindmap.export')} style={iconBtnStyle}>
          <FileDown size={15} />
        </button>
        {exportMenuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setExportMenuOpen(false)} />
            <div style={dropdownStyle}>
              {([['pdf', FileImage, 'PDF'], ['markdown', FileText, 'Markdown'], ['png', Image, 'PNG'], ['svg', FileCode, 'SVG'], ['json', FileJson, 'JSON']] as const).map(([fmt, Icon, label]) => (
                <button key={fmt} onClick={() => handleExport(fmt as any)}
                  style={dropdownItemStyle}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {onToggleRightSidebar && (
        <button onClick={onToggleRightSidebar} title={t('common.toggleSidebar')} style={iconBtnStyle}><PanelRight size={16} /></button>
      )}
    </div>
  )
}

export function MindmapFloatingToolbar() {
  const t = useT()
  const {
    selectedNodeIds, addNode, addFloatingNode, removeNode, undo, redo,
    historyIndex, history,
    connectMode, setConnectMode,
    addBoundary, addSummary, removeRelationEdge,
  } = useMindmapStore(useShallow(s => ({ selectedNodeIds: s.selectedNodeIds, addNode: s.addNode, addFloatingNode: s.addFloatingNode, removeNode: s.removeNode, undo: s.undo, redo: s.redo, historyIndex: s.historyIndex, history: s.history, connectMode: s.connectMode, setConnectMode: s.setConnectMode, addBoundary: s.addBoundary, addSummary: s.addSummary, removeRelationEdge: s.removeRelationEdge })))

  const selected = selectedNodeIds[0]
  // Plain values, not the node / edge arrays: those change on every frame of a drag.
  const canDeleteNode = useMindmapStore(s => {
    const node = selected ? s.rfNodes.find(n => n.id === selected) : undefined
    return !!node && (!!node.data.parentId || !!node.data.floating)
  })
  const selectedEdgeId = useMindmapStore(s => s.rfEdges.find(e => e.selected && e.type === 'relationEdge')?.id ?? null)
  const canDelete = canDeleteNode || !!selectedEdgeId

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const rect = barRef.current?.getBoundingClientRect()
    const parent = barRef.current?.offsetParent as HTMLElement | null
    const parentRect = parent?.getBoundingClientRect()
    if (!rect || !parentRect) return
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left - parentRect.left,
      origY: rect.top - parentRect.top,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragging.current.startX
    const dy = e.clientY - dragging.current.startY
    setPos({ x: dragging.current.origX + dx, y: dragging.current.origY + dy })
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  const floatStyle: React.CSSProperties = pos
    ? { position: 'absolute', zIndex: 20, left: pos.x, top: pos.y }
    : { position: 'absolute', zIndex: 20, top: 8, left: '50%', transform: 'translateX(-50%)' }

  const btnStyle: React.CSSProperties = {
    border: 'none', background: 'none', borderRadius: 6,
    cursor: 'pointer', padding: '6px', color: 'var(--text-muted)',
    flexShrink: 0, display: 'inline-flex', alignItems: 'center',
  }

  const addBtnBase: React.CSSProperties = {
    border: 'none', borderRadius: 8,
    cursor: 'pointer', padding: '5px 10px', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 500,
  }

  return (
    <div
      ref={barRef}
      data-floating-toolbar
      style={{
        ...floatStyle,
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 8px',
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #e0e0e0)',
        borderRadius: 10,
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        userSelect: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <GripVertical size={14} style={{ color: 'var(--text-muted)', cursor: 'grab', flexShrink: 0, marginRight: 2 }} />

      <button onClick={() => addNode(selected ?? null)} title={t('mindmap.addChild')}
        style={{ ...addBtnBase, background: 'var(--accent, #5e81ac)', color: '#fff' }}>
        <GitBranchPlus size={14} />{t('mindmap.addChild')}
      </button>

      <button onClick={() => addFloatingNode()} title={t('mindmap.addFloating')}
        style={{ ...addBtnBase, background: 'var(--surface-raised, #f0f0f0)', color: 'var(--text, #333)' }}>
        <Ungroup size={14} />{t('mindmap.addFloating')}
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)', flexShrink: 0 }} />

      <button onClick={() => setConnectMode(!connectMode)} title={t('mindmap.relationship')}
        style={{ ...btnStyle, background: connectMode ? 'rgba(74,144,217,0.15)' : 'none', color: connectMode ? '#4A90D9' : undefined }}>
        <Link2 size={15} />
      </button>

      <button onClick={() => addBoundary(selectedNodeIds)} title={t('mindmap.addBoundary')}
        disabled={selectedNodeIds.length < 2}
        style={{
          ...btnStyle,
          opacity: selectedNodeIds.length < 2 ? 0.3 : 1,
          color: selectedNodeIds.length >= 2 ? '#5e81ac' : undefined,
        }}>
        <Square size={15} strokeWidth={2} />
      </button>
      <button onClick={() => addSummary(selectedNodeIds)} title={t('mindmap.addSummary')}
        disabled={selectedNodeIds.length < 2}
        style={{
          ...btnStyle,
          opacity: selectedNodeIds.length < 2 ? 0.3 : 1,
          color: selectedNodeIds.length >= 2 ? '#5e81ac' : undefined,
        }}>
        <Braces size={15} strokeWidth={2} />
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)', flexShrink: 0 }} />

      <button onClick={() => {
        if (selectedEdgeId) removeRelationEdge(selectedEdgeId)
        else if (canDeleteNode) removeNode(selected!)
      }} disabled={!canDelete} title={t('mindmap.delete')}
        style={{ ...btnStyle, color: canDelete ? '#e74c3c' : undefined, opacity: canDelete ? 1 : 0.3 }}>
        <Trash2 size={15} />
      </button>
      <button onClick={() => undo()} disabled={historyIndex <= 0} title={t('mindmap.undo')}
        style={{ ...btnStyle, opacity: historyIndex <= 0 ? 0.3 : 1 }}>
        <Undo2 size={15} />
      </button>
      <button onClick={() => redo()} disabled={historyIndex >= history.length - 1} title={t('mindmap.redo')}
        style={{ ...btnStyle, opacity: historyIndex >= history.length - 1 ? 0.3 : 1 }}>
        <Redo2 size={15} />
      </button>
    </div>
  )
}

interface Props {
  onToggleLeftSidebar?: () => void
  onToggleRightSidebar?: () => void
}

export default function MindmapToolbar({ onToggleLeftSidebar, onToggleRightSidebar }: Props) {
  return (
    <>
      <MindmapTitleBar onToggleLeftSidebar={onToggleLeftSidebar} onToggleRightSidebar={onToggleRightSidebar} />
      <MindmapFloatingToolbar />
    </>
  )
}
