import React, { useEffect, useMemo, useState } from 'react'
import { FileText, Brain, PenTool, X } from 'lucide-react'
import type { NoteTemplate } from '@banjuan/core'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'
import { confirmDialog, toast, errorMessage } from '../feedback.js'
import { builtinTemplates } from './builtinTemplates.js'
import { useEscapeKey } from '../../utils/useEscapeKey.js'

export type NoteType = 'markdown' | 'mindmap' | 'handwriting'

interface Props {
  /** templateId: a saved template; content: a built-in template's blocks (JSON). */
  onSelect: (templateId: string | null, title: string, type: NoteType, content?: string) => void
  onClose: () => void
  error?: string | null
}

const NOTE_TYPES: Array<{ type: NoteType; icon: React.ReactNode; color: string; bg: string }> = [
  { type: 'markdown', icon: <FileText size={20} />, color: '#4a7ab5', bg: '#e8eff8' },
  { type: 'mindmap', icon: <Brain size={20} />, color: '#7b6ba8', bg: '#eeebf6' },
  { type: 'handwriting', icon: <PenTool size={20} />, color: '#a07842', bg: '#f4ede4' },
]

export default function TemplatePicker({ onSelect, onClose, error }: Props) {
  useEscapeKey(true, onClose)
  const t = useT()
  const api = useBanjuanAPI()
  const [title, setTitle] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('markdown')
  // '' = blank, 'b:<key>' = built-in, 'u:<id>' = the user's own template
  const [templateKey, setTemplateKey] = useState('')
  const builtins = useMemo(() => builtinTemplates(t), [t])
  const [mine, setMine] = useState<NoteTemplate[]>([])
  const loadMine = () => api.templates.list().then(list => setMine(list.filter(x => !x.isBuiltin))).catch(() => {})
  useEffect(() => { void loadMine() }, [api])

  const handleConfirm = () => {
    if (!title.trim()) return
    if (noteType !== 'markdown' || !templateKey) return onSelect(null, title.trim(), noteType)
    if (templateKey.startsWith('b:')) return onSelect(null, title.trim(), noteType, builtins.find(b => `b:${b.key}` === templateKey)?.content)
    onSelect(templateKey.slice(2), title.trim(), noteType)
  }

  const removeTemplate = async (tpl: NoteTemplate) => {
    if (!await confirmDialog({ message: t('template.deleteConfirm', tpl.name), danger: true, confirmText: t('common.delete') })) return
    try { await api.templates.delete(tpl.id) } catch (e) { toast.error(errorMessage(e)) }
    if (templateKey === `u:${tpl.id}`) setTemplateKey('')
    void loadMine()
  }

  const option = (key: string, name: string, description: string, onRemove?: () => void) => {
    const active = templateKey === key
    return (
      <div key={key} onClick={() => setTemplateKey(key)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
        // Same colours as the selected "text note" card above (templates only apply to it).
        border: active ? `1px solid ${NOTE_TYPES[0].color}` : '1px solid var(--border)',
        background: active ? NOTE_TYPES[0].bg : 'transparent',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{name}</div>
          {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{description}</div>}
        </div>
        {onRemove && (
          <button onClick={e => { e.stopPropagation(); onRemove() }} title={t('common.delete')}
            style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={13} />
          </button>
        )}
      </div>
    )
  }

  const typeLabels: Record<NoteType, string> = {
    markdown: t('template.typeMarkdown'),
    mindmap: t('template.typeMindmap'),
    handwriting: t('template.typeHandwriting'),
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
          placeholder={t('template.titlePlaceholder')}
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

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('template.noteType')}</div>
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

        {noteType === 'markdown' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('template.selectTemplate')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 264, overflowY: 'auto', marginBottom: 16 }}>
              {option('', t('template.blank'), t('template.blankDesc'))}
              {builtins.map(b => option(`b:${b.key}`, b.name, b.description))}
              {mine.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('template.mine')}</div>}
              {mine.map(m => option(`u:${m.id}`, m.name, m.description, () => void removeTemplate(m)))}
            </div>
          </>
        )}

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
