import React, { useState, useCallback, useRef } from 'react'
import { PanelLeft, PanelRight, Undo2, Redo2, Plus, Trash2, FileDown, Image, FileCode, FileJson, GripVertical, GitBranchPlus, Ungroup, Link2, Square, Braces } from 'lucide-react'
import { useMindmapStore } from './useMindmapStore.js'
import { THEMES } from './themes.js'
import { toPng, toSvg } from 'html-to-image'
import { useT } from '../../i18n/index.js'

interface TitleBarProps {
  onToggleLeftSidebar?: () => void
  onToggleRightSidebar?: () => void
}

export function MindmapTitleBar({ onToggleLeftSidebar, onToggleRightSidebar }: TitleBarProps) {
  const t = useT()
  const { mindmapTitle, layout, theme, setTitle, setLayout, setTheme, rfNodes, rfEdges } = useMindmapStore()

  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const handleExport = useCallback(async (format: 'png' | 'svg' | 'json') => {
    setExportMenuOpen(false)
    const el = document.querySelector('.mindmap-canvas') as HTMLElement
    if (!el && format !== 'json') return

    if (format === 'json') {
      const data = JSON.stringify({ nodes: rfNodes.map(n => n.data), edges: rfEdges }, null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${mindmapTitle || 'mindmap'}.json`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    const exporter = format === 'png' ? toPng : toSvg
    const dataUrl = await exporter(el, {
      backgroundColor: format === 'png' ? '#ffffff' : undefined,
      pixelRatio: 2,
      filter: (node: HTMLElement) => {
        if (!(node instanceof HTMLElement)) return true
        const cls = node.className ?? ''
        if (typeof cls === 'string' && (cls.includes('react-flow__minimap') || cls.includes('react-flow__controls'))) return false
        return true
      },
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${mindmapTitle || 'mindmap'}.${format}`
    a.click()
  }, [rfNodes, rfEdges, mindmapTitle])

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
    <div style={{
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
        <option value="mindmap">Mindmap</option>
        <option value="logical">Logical</option>
        <option value="organization">Org</option>
      </select>

      <select value={theme} onChange={e => setTheme(e.target.value)} style={selectStyle}>
        {Object.entries(THEMES).map(([key, t]) => (
          <option key={key} value={key}>{t.name}</option>
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
              {([['png', Image], ['svg', FileCode], ['json', FileJson]] as const).map(([fmt, Icon]) => (
                <button key={fmt} onClick={() => handleExport(fmt)}
                  style={dropdownItemStyle}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <Icon size={13} />{fmt.toUpperCase()}
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
    historyIndex, history, rfNodes, rfEdges,
    connectMode, setConnectMode,
    addBoundary, addSummary, removeRelationEdge,
  } = useMindmapStore()

  const selected = selectedNodeIds[0]
  const selectedNode = rfNodes.find(n => n.id === selected)
  const canDeleteNode = !!selected && (!!selectedNode?.data.parentId || !!selectedNode?.data.floating)
  const selectedEdge = rfEdges.find(e => e.selected && e.type === 'relationEdge')
  const canDelete = canDeleteNode || !!selectedEdge

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

      <button onClick={() => setConnectMode(!connectMode)} title="Relationship"
        style={{ ...btnStyle, background: connectMode ? 'rgba(74,144,217,0.15)' : 'none', color: connectMode ? '#4A90D9' : undefined }}>
        <Link2 size={15} />
      </button>

      <button onClick={() => addBoundary(selectedNodeIds)} title="Add Boundary (select 2+ nodes)"
        disabled={selectedNodeIds.length < 2}
        style={{
          ...btnStyle,
          opacity: selectedNodeIds.length < 2 ? 0.3 : 1,
          color: selectedNodeIds.length >= 2 ? '#5e81ac' : undefined,
        }}>
        <Square size={15} strokeWidth={2} />
      </button>
      <button onClick={() => addSummary(selectedNodeIds)} title="Add Summary (select 2+ nodes)"
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
        if (selectedEdge) removeRelationEdge(selectedEdge.id)
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
