import { Download, FolderPlus, Pencil, Trash2, FilePlus, FolderOutput, NotebookPen } from 'lucide-react'
import { notifyDocumentsChanged, notifyNotesChanged } from '../../utils/libraryEvents.js'
import { confirmDialog, alertDialog, toast, errorMessage } from '../../components/feedback.js'
import { createReadingNote } from '../../utils/readingNote.js'
import { useLibrary } from './LibraryContext.js'

/** The right-click menu for folders, documents and notes. */
export default function LibraryContextMenu() {
  const {
    api, contextMenu, ctxItemStyle, handleCreateFolder, handleCreateNote, handleDelete,
    handleRenameDir, handleRenameNote, loadDocuments, loadNoteDirs, loadNotes, menuRef, notes,
    onOpenNote, selectedDir, selectedNoteDir, setContextMenu, setDocDirs, setExportDirPath,
    setMoveDocDialog, setSelectedDir, setSelectedNoteDir, setShowDocFolderInput,
    setShowExportDialog, t,
  } = useLibrary()
  return (
    <>
      {contextMenu && (
        <div ref={menuRef} style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 2000,
          background: 'var(--surface, #fff)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          padding: '4px 0', minWidth: 160,
        }}>
          {(contextMenu.type === 'documents' || contextMenu.type === 'docDir') && (
            <>
              <div onClick={async () => {
                setContextMenu(null)
                const dest = contextMenu.dirPath || selectedDir || undefined
                if (api.documents.importFilesDialog) {
                  await api.documents.importFilesDialog(dest)
                } else {
                  await api.documents.import(dest)
                }
                await loadDocuments()
              }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Download size={14} />{t('common.import')}</div>
              <div onClick={() => { setContextMenu(null); setShowDocFolderInput(true) }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FolderPlus size={14} />{t('library.newFolder')}</div>
              {contextMenu.type === 'docDir' && contextMenu.dirPath && (<>
                <div onClick={handleRenameDir} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                ><Pencil size={14} />{t('library.rename')}</div>
                <div onClick={async () => {
                  const dirPath = contextMenu.dirPath!
                  setContextMenu(null)
                  if (!await confirmDialog({ message: t('library.confirmDeleteDocFolder', dirPath.split('/').pop() ?? dirPath), danger: true, confirmText: t('common.delete') })) return
                  if (api.documents.deleteDir) await api.documents.deleteDir(dirPath)
                  await loadDocuments()
                  notifyDocumentsChanged()
                  if (selectedDir === dirPath || selectedDir?.startsWith(dirPath + '/')) setSelectedDir(null)
                }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6, color: '#f38ba8' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                ><Trash2 size={14} />{t('common.delete')}</div>
              </>)}
            </>
          )}
          {(contextMenu.type === 'notes' || contextMenu.type === 'noteDir') && (
            <>
              <div onClick={handleCreateNote} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FilePlus size={14} />{t('library.newNote')}</div>
              {api.notes.importMarkdownDialog && <div onClick={async () => {
                setContextMenu(null)
                const results = await api.notes.importMarkdownDialog!(contextMenu.dirPath || selectedNoteDir)
                if (results) {
                  const failed = results.filter((r: any) => !r.success && r.error !== 'NOT_MARKDOWN')
                  if (failed.length > 0) void alertDialog({ title: t('import.someFailed'), message: failed.map((r: any) => `${r.title}: ${r.error}`).join('\n') })
                }
                await loadNotes()
                await loadNoteDirs()
              }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Download size={14} />{t('common.import')}</div>}
              {api.export?.markdown && <div onClick={() => {
                setExportDirPath(contextMenu.dirPath || selectedNoteDir)
                setContextMenu(null)
                setShowExportDialog(true)
              }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FolderOutput size={14} />{t('note.export')}</div>}
              <div onClick={handleCreateFolder} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FolderPlus size={14} />{t('library.newFolder')}</div>
              {contextMenu.type === 'noteDir' && contextMenu.dirPath && (<>
                <div onClick={handleRenameDir} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                ><Pencil size={14} />{t('library.rename')}</div>
                <div onClick={async () => {
                  const dirPath = contextMenu.dirPath!
                  setContextMenu(null)
                  if (!await confirmDialog({ message: t('library.confirmDeleteNoteFolder', dirPath.split('/').pop() ?? dirPath), danger: true, confirmText: t('common.delete') })) return
                  if (api.notes.deleteDir) await api.notes.deleteDir(dirPath)
                  await loadNotes()
                  await loadNoteDirs()
                  notifyNotesChanged()
                  if (selectedNoteDir === dirPath || selectedNoteDir?.startsWith(dirPath + '/')) setSelectedNoteDir(null)
                }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6, color: '#f38ba8' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                ><Trash2 size={14} />{t('common.delete')}</div>
              </>)}
            </>
          )}
          {contextMenu.type === 'docItem' && (
            <>
              <div onClick={async () => {
                if (contextMenu.docId) {
                  const dirs = await api.documents.listDirs()
                  setDocDirs(dirs)
                  setMoveDocDialog({ docId: contextMenu.docId, docTitle: contextMenu.docTitle || '' })
                }
                setContextMenu(null)
              }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FolderOutput size={14} />{t('library.move')}</div>
              <div onClick={async () => {
                const docId = contextMenu.docId
                setContextMenu(null)
                if (!docId) return
                try {
                  const result = await createReadingNote(api, docId, t)
                  if (!result) { toast.info(t('readingNote.empty')); return }
                  notifyNotesChanged()
                  toast.success(t('readingNote.created', result.count))
                  onOpenNote(result.note)
                } catch (e) {
                  toast.error(errorMessage(e))
                }
              }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><NotebookPen size={14} />{t('readingNote.generate')}</div>
              <div onClick={async () => {
                const { docId, docTitle } = contextMenu
                setContextMenu(null)
                if (docId && await confirmDialog({ message: t('library.confirmDeleteDoc', docTitle || ''), danger: true, confirmText: t('common.delete') })) {
                  handleDelete(docId)
                }
              }} style={{ ...ctxItemStyle, color: '#c44040', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Trash2 size={14} />{t('common.delete')}</div>
            </>
          )}
          {contextMenu.type === 'noteItem' && (
            <>
              <div onClick={handleRenameNote} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Pencil size={14} />{t('library.rename')}</div>
              <div onClick={async () => { const noteId = contextMenu.noteId; if (!noteId) return; setContextMenu(null); const title = notes.find((n: any) => n.id === noteId)?.title || ''; if (await confirmDialog({ message: t('folderTree.confirmDeleteNote', title), danger: true, confirmText: t('common.delete') })) handleDelete(noteId) }} style={{ ...ctxItemStyle, color: '#c44040', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Trash2 size={14} />{t('common.delete')}</div>
            </>
          )}
        </div>
      )}
    </>
  )
}
