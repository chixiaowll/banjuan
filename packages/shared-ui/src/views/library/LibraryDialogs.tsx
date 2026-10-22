import { X, Folder } from 'lucide-react'
import TemplatePicker from '../../components/notes/TemplatePicker.js'
import { newRunId, exportToDirectory } from '../../utils/exportToDirectory.js'
import { listExportNotes, buildExportEntries } from '../../utils/exportEntries.js'
import { useExportManagerStore } from '../../stores/useExportManagerStore.js'
import { useLibrary } from './LibraryContext.js'

/** The new-note picker and the new folder, rename, export and move dialogs. */
export default function LibraryDialogs() {
  const {
    api, composingRef, docDirs, exportDirPath, handleDocFolderInputConfirm,
    handleFolderInputConfirm, handleNoteTemplateSelect, handleRenameConfirm, loadDocuments,
    moveDocDialog, notePickerError, renameInputElRef, renameInputValue, setMoveDocDialog,
    setNotePickerError, setRenameInputValue, setShowDocFolderInput, setShowExportDialog,
    setShowFolderInput, setShowNotePicker, setShowRenameInput, showDocFolderInput,
    showExportDialog, showFolderInput, showNotePicker, showRenameInput, t,
  } = useLibrary()
  return (
    <>
      {showNotePicker && (
        <TemplatePicker onSelect={handleNoteTemplateSelect} onClose={() => { setShowNotePicker(false); setNotePickerError(null) }} error={notePickerError} />
      )}

      {showFolderInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowFolderInput(false)}>
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 10, padding: 24, width: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <form onSubmit={e => { e.preventDefault(); const v = new FormData(e.currentTarget).get('name') as string; handleFolderInputConfirm(v?.trim() || '') }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('library.newFolder')}</h3>
              <input
                autoFocus
                name="name"
                type="text"
                placeholder={t('library.newFolder')}
                style={{
                  width: '100%', fontSize: 14, padding: '8px 12px',
                  border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
                  background: 'var(--bg, #fff)', color: 'var(--text, #000)',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowFolderInput(false)} style={{ fontSize: 13, padding: '6px 16px' }}>{t('common.cancel')}</button>
                <button
                  type="submit"
                  style={{
                    fontSize: 13, padding: '6px 16px',
                    background: 'var(--accent, #5e81ac)',
                    color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                  }}
                >{t('welcome.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showDocFolderInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowDocFolderInput(false)}>
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 10, padding: 24, width: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <form onSubmit={e => { e.preventDefault(); const v = new FormData(e.currentTarget).get('name') as string; handleDocFolderInputConfirm(v?.trim() || '') }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('library.newFolder')}</h3>
              <input
                autoFocus
                name="name"
                type="text"
                placeholder={t('library.newFolder')}
                style={{
                  width: '100%', fontSize: 14, padding: '8px 12px',
                  border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
                  background: 'var(--bg, #fff)', color: 'var(--text, #000)',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowDocFolderInput(false)} style={{ fontSize: 13, padding: '6px 16px' }}>{t('common.cancel')}</button>
                <button
                  type="submit"
                  style={{
                    fontSize: 13, padding: '6px 16px',
                    background: 'var(--accent, #5e81ac)',
                    color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                  }}
                >{t('welcome.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRenameInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowRenameInput(false)}>
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 10, padding: 24, width: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('library.rename')}</h3>
            <input
              ref={renameInputElRef}
              autoFocus
              type="text"
              value={renameInputValue}
              onChange={e => setRenameInputValue(e.target.value)}
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={() => { composingRef.current = false }}
              onKeyDown={e => { if (e.key === 'Enter' && !composingRef.current) handleRenameConfirm() }}
              style={{
                width: '100%', fontSize: 14, padding: '8px 12px',
                border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
                background: 'var(--bg, #fff)', color: 'var(--text, #000)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRenameInput(false)} style={{ fontSize: 13, padding: '6px 16px' }}>{t('common.cancel')}</button>
              <button
                onClick={handleRenameConfirm}
                disabled={!renameInputValue.trim()}
                style={{
                  fontSize: 13, padding: '6px 16px',
                  background: renameInputValue.trim() ? 'var(--accent, #5e81ac)' : '#ccc',
                  color: '#fff', border: 'none', borderRadius: 6, cursor: renameInputValue.trim() ? 'pointer' : 'default',
                }}
              >{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {showExportDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowExportDialog(false)}>
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 10, padding: 24, width: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('library.exportNotes')}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
              {t('library.exportNotesDesc')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['markdown', 'pdf'] as const).map(fmt => (
                <button key={fmt} onClick={async () => {
                  setShowExportDialog(false)
                  await new Promise(r => requestAnimationFrame(r))

                  const folder = exportDirPath ?? null

                  // Preferred path: hand the run to the background export window so
                  // heavy mindmap rendering never blocks this window.
                  if (api.batchExport) {
                    const dir = await api.dialog.openDirectory()
                    if (!dir) return
                    const notes = await listExportNotes(api, folder)
                    if (notes.length === 0) return
                    const runId = newRunId()
                    useExportManagerStore.getState().startExport(
                      notes.map(({ note, subPath }) => ({ id: `${runId}/${note.id}`, noteId: note.id, title: note.title, subPath })),
                      dir, fmt,
                    )
                    await api.batchExport.run({ runId, format: fmt, outputDir: dir, folder })
                    return
                  }

                  // Fallback: run in-window (platforms without a background window).
                  const notes = await listExportNotes(api, folder)
                  if (notes.length === 0) return
                  // Loaded on demand: keeps BlockNote out of the library view's startup bundle.
                  const [{ BlockNoteEditor }, { schema: blockNoteSchema }] = await Promise.all([
                    import('@blocknote/core'), import('../../components/notes/BlockEditor.js'),
                  ])
                  const editor = BlockNoteEditor.create({ schema: blockNoteSchema } as any)
                  const entries = buildExportEntries(api, notes, fmt, editor)
                  exportToDirectory(api, entries, fmt)
                }} style={{
                  flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 500, borderRadius: 8,
                  background: fmt === 'markdown' ? 'var(--accent, #5e81ac)' : '#e07856',
                  color: '#fff', border: 'none', cursor: 'pointer',
                }}>{fmt === 'markdown' ? 'Markdown' : 'PDF'}</button>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button onClick={() => setShowExportDialog(false)} style={{ fontSize: 13, padding: '6px 16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {moveDocDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setMoveDocDialog(null)}
        >
          <div style={{ background: 'var(--surface-raised, #fff)', borderRadius: 12, padding: 24, width: 360, maxHeight: '60vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t('library.moveTitle', moveDocDialog.docTitle)}</span>
              <button onClick={() => setMoveDocDialog(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={async () => {
                  await api.documents.move(moveDocDialog.docId, '.')
                  setMoveDocDialog(null)
                  await loadDocuments()
                }}
              >
                <Folder size={14} /> {t('library.moveToRoot')}
              </div>
              {docDirs.map(dir => (
                <div
                  key={dir}
                  style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={async () => {
                    await api.documents.move(moveDocDialog.docId, dir)
                    setMoveDocDialog(null)
                    await loadDocuments()
                  }}
                >
                  <Folder size={14} /> {dir}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
