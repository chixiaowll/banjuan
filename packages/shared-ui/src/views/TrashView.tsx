import React, { useCallback, useEffect, useState } from 'react'
import { FileText, Brain, PenTool, LibraryBig, Folder, RotateCcw, Trash2 } from 'lucide-react'
import type { TrashEntry } from '@banjuan/core'
import { useBanjuanAPI } from '../api.js'
import { useI18n, LOCALE_TAGS } from '../i18n/index.js'
import { toast, confirmDialog, errorMessage } from '../components/feedback.js'
import { notifyDocumentsChanged, notifyNotesChanged } from '../utils/libraryEvents.js'

/** The recycle bin: deleted documents, notes and folders, restorable for 30 days. */

function EntryIcon({ entry }: { entry: TrashEntry }) {
  const size = 16
  if (entry.kind === 'folder') return <Folder size={size} />
  if (entry.kind === 'document') return <LibraryBig size={size} />
  if (entry.itemType === 'mindmap') return <Brain size={size} />
  if (entry.itemType === 'handwriting') return <PenTool size={size} />
  return <FileText size={size} />
}

export default function TrashView({ onRestored }: { onRestored?: (kind: TrashEntry['kind']) => void }) {
  const api = useBanjuanAPI()
  const { t, locale } = useI18n()
  const [entries, setEntries] = useState<TrashEntry[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setEntries(await api.trash?.list() ?? []) }
    catch (e) { toast.error(errorMessage(e)); setEntries([]) }
  }, [api])
  useEffect(() => { void load() }, [load])

  // Where it was: the folder for notes / documents, the full path for folders.
  const location = (e: TrashEntry) => {
    if (e.kind === 'folder') return e.originalPath
    const dir = e.originalPath.includes('/') ? e.originalPath.slice(0, e.originalPath.lastIndexOf('/')) : ''
    if (e.kind === 'note') return dir || t('library.notes')
    return dir || t('library.documents')
  }

  const restore = async (e: TrashEntry) => {
    setBusy(e.id)
    try {
      await api.trash!.restore(e.id)
      toast.success(t('trash.restored', e.title))
      if (e.kind === 'note' || e.area === 'notes') notifyNotesChanged()
      else notifyDocumentsChanged()
      onRestored?.(e.kind)
    } catch (err) {
      toast.error(t('trash.restoreFailed', errorMessage(err)))
    } finally {
      setBusy(null)
      void load()
    }
  }

  const purge = async (e: TrashEntry) => {
    if (!await confirmDialog({ message: t('trash.purgeConfirm', e.title), danger: true, confirmText: t('trash.purge') })) return
    setBusy(e.id)
    try { await api.trash!.purge(e.id) } catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(null); void load() }
  }

  const empty = async () => {
    if (!entries?.length) return
    if (!await confirmDialog({ message: t('trash.emptyConfirm', entries.length), danger: true, confirmText: t('trash.emptyBin') })) return
    setBusy('*')
    try { await api.trash!.empty() } catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(null); void load() }
  }

  const button: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, borderRadius: 6,
    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer',
  }

  return (
    <div style={{ padding: 24, overflow: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>{t('trash.title')}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('trash.subtitle')}</div>
        </div>
        {!!entries?.length && (
          <button onClick={empty} disabled={busy !== null} style={{ ...button, color: '#c0392b', borderColor: 'rgba(192,57,43,0.35)' }}>
            <Trash2 size={13} />{t('trash.emptyBin')}
          </button>
        )}
      </div>

      {entries && entries.length === 0 && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{t('trash.empty')}</div>
      )}

      {entries?.map(e => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border)', opacity: busy === e.id ? 0.5 : 1 }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}><EntryIcon entry={e} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {location(e)} · {t('trash.deletedAt', new Date(e.deletedAt).toLocaleString(LOCALE_TAGS[locale], { dateStyle: 'medium', timeStyle: 'short' }))}
            </div>
          </div>
          <button onClick={() => restore(e)} disabled={busy !== null} style={button}><RotateCcw size={13} />{t('trash.restore')}</button>
          <button onClick={() => purge(e)} disabled={busy !== null} style={{ ...button, color: '#c0392b' }}>{t('trash.purge')}</button>
        </div>
      ))}
    </div>
  )
}
