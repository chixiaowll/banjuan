import React, { useState, useCallback } from 'react'
import { useMindmapStore } from './useMindmapStore.js'
import { THEMES } from './themes.js'
import { toPng, toSvg } from 'html-to-image'

interface Props {
  onBack: () => void
}

export default function MindmapToolbar({ onBack }: Props) {
  const {
    mindmapTitle, layout, theme, selectedNodeIds,
    setTitle, setLayout, setTheme, addNode, removeNode, undo, redo,
    historyIndex, history, rfNodes,
  } = useMindmapStore()

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const selected = selectedNodeIds[0]
  const selectedNode = rfNodes.find(n => n.id === selected)
  const canDelete = !!selected && !!selectedNode?.data.parentId

  const handleExport = useCallback(async (format: 'png' | 'svg' | 'json') => {
    setExportMenuOpen(false)
    const el = document.querySelector('.react-flow__viewport') as HTMLElement
    if (!el && format !== 'json') return

    if (format === 'json') {
      const data = JSON.stringify({ nodes: rfNodes.map(n => n.data), edges: useMindmapStore.getState().rfEdges }, null, 2)
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
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${mindmapTitle || 'mindmap'}.${format}`
    a.click()
  }, [rfNodes, mindmapTitle])

  const toolbarStyle: React.CSSProperties = {
    height: 44, padding: '0 12px', borderBottom: '1px solid var(--border, #e0e0e0)',
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
    background: 'var(--surface, #fff)',
  }

  const btnStyle: React.CSSProperties = {
    border: '1px solid var(--border, #e0e0e0)', background: 'none', borderRadius: 4,
    fontSize: 12, cursor: 'pointer', padding: '4px 10px', color: 'var(--text, #333)',
  }

  const selectStyle: React.CSSProperties = {
    border: '1px solid var(--border, #e0e0e0)', background: 'none', borderRadius: 4,
    fontSize: 12, padding: '4px 6px', color: 'var(--text, #333)',
  }

  return (
    <div style={toolbarStyle}>
      <button onClick={onBack} style={{ ...btnStyle, border: 'none' }}>← Back</button>

      <input
        value={mindmapTitle}
        onChange={e => setTitle(e.target.value)}
        style={{ border: 'none', fontSize: 15, fontWeight: 600, width: 200, outline: 'none', background: 'transparent', color: 'var(--text, #333)' }}
      />

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)' }} />

      <select value={layout} onChange={e => setLayout(e.target.value)} style={selectStyle}>
        <option value="mindmap">Mindmap</option>
        <option value="logical">Logical</option>
        <option value="organization">Organization</option>
      </select>

      <select value={theme} onChange={e => setTheme(e.target.value)} style={selectStyle}>
        {Object.entries(THEMES).map(([key, t]) => (
          <option key={key} value={key}>{t.name}</option>
        ))}
      </select>

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)' }} />

      <button onClick={() => undo()} disabled={historyIndex <= 0} style={{ ...btnStyle, opacity: historyIndex <= 0 ? 0.3 : 1 }}>Undo</button>
      <button onClick={() => redo()} disabled={historyIndex >= history.length - 1} style={{ ...btnStyle, opacity: historyIndex >= history.length - 1 ? 0.3 : 1 }}>Redo</button>

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)' }} />

      <button onClick={() => addNode(selected ?? null)} style={btnStyle}>+ Child</button>
      <button onClick={() => removeNode(selected!)} disabled={!canDelete} style={{ ...btnStyle, color: canDelete ? '#e74c3c' : undefined, opacity: canDelete ? 1 : 0.3 }}>Delete</button>

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={() => setExportMenuOpen(v => !v)} style={btnStyle}>Export</button>
        {exportMenuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100, minWidth: 120, padding: '4px 0',
          }}>
            {(['png', 'svg', 'json'] as const).map(fmt => (
              <button key={fmt} onClick={() => handleExport(fmt)}
                style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: 'var(--text, #333)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
