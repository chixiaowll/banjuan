import React, { useEffect, useState } from 'react'
import { History, RotateCcw, X } from 'lucide-react'
import { blocksToMarkdown } from '@banjuan/core/dist/notes/export-markdown.js'
import { useBanjuanAPI, type NoteVersion } from '../../api.js'
import { useI18n, LOCALE_TAGS } from '../../i18n/index.js'
import { toast, confirmDialog, errorMessage } from '../feedback.js'
import { announceNoteChanged } from '../../utils/noteChanges.js'

/**
 * A note's earlier versions — kept before every write from a program and, as
 * you edit, every 10 minutes (on this device) — with who wrote each one; look
 * at one and put it back.
 */
export function NoteHistoryDialog({ noteId, onClose, beforeRestore }: {
  noteId: string
  onClose: () => void
  /** Write what the editor still holds first, so restoring isn't undone by a pending save. */
  beforeRestore?: () => Promise<void> | void
}) {
  const api = useBanjuanAPI()
  const { t, locale } = useI18n()
  const [versions, setVersions] = useState<NoteVersion[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.notes.history?.(noteId).then(v => { setVersions(v); setSelected(v[0]?.version ?? null) }).catch(e => { toast.error(errorMessage(e)); setVersions([]) })
  }, [api, noteId])

  useEffect(() => {
    if (!selected || !api.notes.readVersion) { setPreview(''); return }
    let live = true
    api.notes.readVersion(noteId, selected)
      .then(v => { if (live) setPreview(blocksToMarkdown(JSON.parse(v.content))) })
      .catch(e => { if (live) setPreview(errorMessage(e)) })
    return () => { live = false }
  }, [api, noteId, selected])

  const when = (iso: string) => new Date(iso).toLocaleString(LOCALE_TAGS[locale], { dateStyle: 'medium', timeStyle: 'short' })
  const who = (by: string) => by === 'app' ? t('history.byApp') : by === 'external' ? t('history.byExternal') : by || t('history.byUnknown')
  const why = (reason: string) => reason === 'edit' ? t('history.reasonEdit') : reason === 'restore' ? t('history.reasonRestore') : t('history.reasonExternal')

  const restore = async () => {
    const v = versions?.find(x => x.version === selected)
    if (!v || !api.notes.restore) return
    if (!await confirmDialog({ message: t('history.restoreConfirm', when(v.at)), confirmText: t('history.restore') })) return
    setBusy(true)
    try {
      await beforeRestore?.()
      await api.notes.restore(noteId, v.version)
      announceNoteChanged(noteId)   // the open editor loads it
      toast.success(t('history.restored'))
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div data-note-history onClick={e => e.stopPropagation()} style={{
        width: 'min(880px, 92vw)', height: 'min(560px, 84vh)', background: 'var(--bg)', color: 'var(--text)',
        borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <History size={16} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t('history.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, flex: 1 }}>{t('history.subtitle')}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={16} /></button>
        </div>
        {versions && versions.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{t('history.empty')}</div>
        ) : (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ width: 280, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
              {versions?.map(v => (
                <div key={v.version} data-version={v.version} onClick={() => setSelected(v.version)} style={{
                  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: v.version === selected ? 'var(--accent-soft, rgba(0,0,0,0.04))' : 'transparent',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{when(v.at)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('history.writtenBy', who(v.by))} · {why(v.reason)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.preview}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <pre data-version-preview style={{ flex: 1, margin: 0, padding: 16, overflow: 'auto', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{preview}</pre>
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={restore} disabled={!selected || busy} data-restore-version style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 13, borderRadius: 6,
                  border: 'none', background: 'var(--accent)', color: '#fff', cursor: selected && !busy ? 'pointer' : 'default', opacity: selected && !busy ? 1 : 0.5,
                }}><RotateCcw size={14} />{t('history.restore')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
