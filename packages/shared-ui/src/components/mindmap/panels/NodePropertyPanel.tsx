import React, { useState, useEffect } from 'react'
import { useMindmapStore } from '../useMindmapStore.js'
import type { ShapeName } from '../shapes.js'
import { useT } from '../../../i18n/index.js'

const SHAPES = [
  { value: 'roundedRect', labelKey: 'mindmap.shapeRounded' },
  { value: 'rectangle', labelKey: 'mindmap.shapeRectangle' },
  { value: 'capsule', labelKey: 'mindmap.shapeCapsule' },
  { value: 'diamond', labelKey: 'mindmap.shapeDiamond' },
  { value: 'ellipse', labelKey: 'mindmap.shapeEllipse' },
  { value: 'underline', labelKey: 'mindmap.shapeUnderline' },
] as const satisfies ReadonlyArray<{ value: ShapeName; labelKey: string }>

const COLORS = ['#4A90D9', '#27AE60', '#E74C3C', '#F39C12', '#8E44AD', '#1ABC9C', '#2C3E50', '#E67E22']

interface Props {
  nodeId: string
  onClose: () => void
}

export default function NodePropertyPanel({ nodeId, onClose }: Props) {
  const t = useT()
  const updateNodeData = useMindmapStore(s => s.updateNodeData)
  const node = useMindmapStore(s => s.rfNodes.find(n => n.id === nodeId))
  const [notes, setNotes] = useState(node?.data.notes ?? '')

  useEffect(() => {
    setNotes(node?.data.notes ?? '')
  }, [nodeId, node?.data.notes])

  if (!node) return null

  return (
    <div style={{ padding: '16px 16px 80px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{t('mindmap.properties')}</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>{t('mindmap.shape')}</label>
        <select
          value={node.data.shape ?? ''}
          onChange={e => updateNodeData(nodeId, { shape: e.target.value || null })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border, #e0e0e0)', fontSize: 13 }}
        >
          <option value="">{t('mindmap.shapeThemeDefault')}</option>
          {SHAPES.map(s => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>{t('mindmap.color')}</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => updateNodeData(nodeId, { color: null })}
            style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 10 }}
          >×</button>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => updateNodeData(nodeId, { color: c })}
              style={{
                width: 24, height: 24, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                outline: node.data.color === c ? '2px solid var(--text)' : 'none', outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>{t('mindmap.notes')}</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => updateNodeData(nodeId, { notes: notes || null })}
          rows={4}
          style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border, #e0e0e0)', fontSize: 13, resize: 'vertical' }}
          placeholder={t('mindmap.notesPlaceholder')}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>{t('mindmap.hyperlink')}</label>
        <input
          value={node.data.hyperlink ?? ''}
          onChange={e => updateNodeData(nodeId, { hyperlink: e.target.value || null })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border, #e0e0e0)', fontSize: 13 }}
          placeholder="https://..."
        />
      </div>
    </div>
  )
}
