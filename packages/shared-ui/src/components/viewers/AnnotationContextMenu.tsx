import React, { useEffect, useRef } from 'react'
import { Trash2, Palette, Copy, StickyNote } from 'lucide-react'
import { ANNOTATION_COLORS } from './PdfViewerContext.js'
import { useT } from '../../i18n/index.js'

interface MenuPosition {
  x: number
  y: number
}

interface Props {
  position: MenuPosition
  annotationId: string
  annotationType: string
  annotationColor: string
  selectedText?: string
  onDelete: (id: string) => void
  onChangeColor: (id: string, color: string) => void
  onClose: () => void
}

export default function AnnotationContextMenu({
  position, annotationId, annotationType, annotationColor,
  selectedText, onDelete, onChangeColor, onClose,
}: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
    cursor: 'pointer', fontSize: 13, color: 'var(--text)', border: 'none',
    background: 'none', width: '100%', textAlign: 'left', borderRadius: 4,
  }

  return (
    <div ref={ref} style={{
      position: 'fixed', left: position.x, top: position.y, zIndex: 9999,
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 4, minWidth: 160,
    }}>
      {selectedText && (
        <button style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--selected)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          onClick={() => { navigator.clipboard.writeText(selectedText); onClose() }}>
          <Copy size={14} /> {t('common.copy' as any) || '复制文字'}
        </button>
      )}
      <div style={{ padding: '4px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
        <Palette size={14} style={{ color: 'var(--text-muted)', marginRight: 4 }} />
        {ANNOTATION_COLORS.map(c => (
          <button key={c.value} onClick={() => { onChangeColor(annotationId, c.value); onClose() }} style={{
            width: 18, height: 18, borderRadius: '50%', border: annotationColor === c.value ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: c.value, cursor: 'pointer', padding: 0,
          }} />
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <button style={{ ...itemStyle, color: '#e53e3e' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--selected)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        onClick={() => { onDelete(annotationId); onClose() }}>
        <Trash2 size={14} /> {t('common.delete' as any) || '删除'}
      </button>
    </div>
  )
}
