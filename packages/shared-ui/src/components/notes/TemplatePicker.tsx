import React, { useState } from 'react'
import { FileText, Brain, PenTool } from 'lucide-react'
import { useT } from '../../i18n/index.js'

export type NoteType = 'markdown' | 'mindmap' | 'handwriting'

interface Props {
  onSelect: (templateId: string | null, title: string, type: NoteType) => void
  onClose: () => void
  error?: string | null
}

const NOTE_TYPES: Array<{ type: NoteType; icon: React.ReactNode; color: string; bg: string }> = [
  { type: 'markdown', icon: <FileText size={20} />, color: '#4a7ab5', bg: '#e8eff8' },
  { type: 'mindmap', icon: <Brain size={20} />, color: '#7b6ba8', bg: '#eeebf6' },
  { type: 'handwriting', icon: <PenTool size={20} />, color: '#a07842', bg: '#f4ede4' },
]

export default function TemplatePicker({ onSelect, onClose, error }: Props) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('markdown')

  const handleConfirm = () => {
    if (!title.trim()) return
    onSelect(null, title.trim(), noteType)
  }

  const typeLabels: Record<NoteType, string> = {
    markdown: t('template.typeMarkdown' as any),
    mindmap: t('template.typeMindmap' as any),
    handwriting: t('template.typeHandwriting' as any),
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface, white)', borderRadius: 12, padding: 24, width: 400,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('library.newNote')}</h3>

        <input
          autoFocus
          type="text"
          placeholder={t('template.titlePlaceholder' as any)}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
          style={{
            width: '100%', fontSize: 14, padding: '8px 12px', marginBottom: error ? 4 : 16,
            border: `1px solid ${error ? '#e53e3e' : 'var(--border)'}`, borderRadius: 6, boxSizing: 'border-box',
            background: 'var(--bg, #fff)', color: 'var(--text, #000)',
          }}
        />
        {error && <div style={{ fontSize: 12, color: '#e53e3e', marginBottom: 12 }}>{error}</div>}

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('template.noteType' as any)}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {NOTE_TYPES.map(({ type, icon, color, bg }) => (
            <div
              key={type}
              onClick={() => setNoteType(type)}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                textAlign: 'center', transition: 'all 0.15s',
                border: noteType === type ? `2px solid ${color}` : '1px solid var(--border)',
                background: noteType === type ? bg : 'transparent',
              }}
            >
              <div style={{ color, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{icon}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: noteType === type ? color : 'var(--text)' }}>
                {typeLabels[type]}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: '6px 16px' }}>{t('common.cancel')}</button>
          <button
            onClick={handleConfirm}
            disabled={!title.trim()}
            style={{
              fontSize: 13, padding: '6px 16px',
              background: title.trim() ? 'var(--accent, #5e81ac)' : '#ccc',
              color: '#fff', border: 'none', borderRadius: 6, cursor: title.trim() ? 'pointer' : 'default',
            }}
          >{t('welcome.create')}</button>
        </div>
      </div>
    </div>
  )
}
