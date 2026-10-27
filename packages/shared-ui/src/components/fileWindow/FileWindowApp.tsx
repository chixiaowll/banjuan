import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BanjuanAPIProvider, useBanjuanAPI, type SingleFileInfo } from '../../api.js'
import { useT } from '../../i18n/index.js'
import { flushAll, registerFlushUntilWritten } from '../../utils/flushRegistry.js'
import { useEscapeKey } from '../../utils/useEscapeKey.js'
import { createSingleFileApi } from '../../utils/singleFileApi.js'
import { ViewerCapabilitiesContext, type ViewerCapabilities } from '../viewers/viewerCapabilities.js'
import DocumentViewer from '../viewers/DocumentViewer.js'
import TextFileEditor from './TextFileEditor.js'
import { decodeTextFile, TextFileSession, type SessionStatus } from './textFileSession.js'
import { toast, errorMessage } from '../feedback.js'

/** A file on its own is in no library: nothing to annotate into, no tags, notes or reading time. */
const ON_ITS_OWN: ViewerCapabilities = { annotate: false, library: false }

const toBytes = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(b))
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/**
 * The single-file window (a file opened on its own, like VS Code without a
 * folder): Markdown / text edited in place, PDF / EPUB / images viewed with the
 * library's viewers minus everything that needs a library, and a way into a
 * library when wanted.
 */
export default function FileWindowApp() {
  const api = useBanjuanAPI()
  const t = useT()
  const [info, setInfo] = useState<SingleFileInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<SessionStatus | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Window close / app quit: write what's pending first (main waits for this).
  useEffect(() => api.lifecycle?.onFlushRequest(flushAll), [api])

  useEffect(() => {
    if (!api.file) { setLoadError('no file'); return }
    api.file.info()
      .then(i => { setInfo(i); document.title = i.name })
      .catch(e => setLoadError(errorMessage(e)))
  }, [api])

  if (loadError) return <Centered>{t('fileWindow.loadFailed', loadError)}</Centered>
  if (!info) return <Centered>{t('common.loading')}</Centered>

  const isText = info.type === 'markdown' || info.type === 'text'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <FileTitleBar
        info={info}
        status={isText ? status : null}
        showPreview={showPreview}
        onTogglePreview={info.type === 'markdown' ? () => setShowPreview(v => !v) : undefined}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {isText
          ? <TextFileBody info={info} showPreview={showPreview} onStatus={setStatus} />
          : info.type === 'unsupported'
            ? <Unsupported />
            : <ViewerBody info={info} />}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexDirection: 'column', background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>
      {children}
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  ...noDrag,
  padding: '4px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface, transparent)', color: 'var(--text)',
  whiteSpace: 'nowrap',
}

function FileTitleBar({ info, status, showPreview, onTogglePreview }: {
  info: SingleFileInfo
  status: SessionStatus | null
  showPreview: boolean
  onTogglePreview?: () => void
}) {
  const api = useBanjuanAPI()
  const t = useT()
  const [libraries, setLibraries] = useState<Array<{ path: string; name: string }> | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  useEscapeKey(menuOpen, () => setMenuOpen(false))

  useEffect(() => {
    if (info.library) return
    api.file!.libraries().then(setLibraries).catch(() => setLibraries([]))
  }, [api, info])

  const statusLabel = status && ({
    saved: t('fileWindow.saved'),
    dirty: t('fileWindow.unsaved'),
    saving: t('fileWindow.saving'),
    error: t('fileWindow.saveFailed'),
    conflict: t('fileWindow.unsaved'),
    gone: t('fileWindow.unsaved'),
    readonly: t('fileWindow.readOnly'),
  } as Record<SessionStatus, string>)[status]

  const addTo = (path: string) => {
    setMenuOpen(false)
    api.file!.addToLibrary(path).catch(e => toast.error(errorMessage(e)))
  }

  return (
    <div className="title-bar" style={{ position: 'relative' }}>
      <div className="title-bar-drag" />
      <div className="title-bar-spacer" />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 0 4px' }}>
        <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={info.path}>{info.name}</span>
        {statusLabel && (
          <span data-save-status={status} style={{ fontSize: 11, color: status === 'error' ? 'var(--danger, #c53030)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {statusLabel}
          </span>
        )}
        {info.library && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t('fileWindow.inLibrary', info.library.name)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {onTogglePreview && (
          <button
            onClick={onTogglePreview}
            style={{ ...buttonStyle, background: showPreview ? 'var(--selected, var(--hover))' : buttonStyle.background }}
          >
            {t('fileWindow.preview')}
          </button>
        )}
        {info.library ? (
          <button style={buttonStyle} onClick={() => api.file!.openInLibrary().catch(e => toast.error(errorMessage(e)))}>
            {t('fileWindow.openInLibrary')}
          </button>
        ) : (
          <div style={{ position: 'relative', ...noDrag }}>
            <button
              data-add-to-library
              style={{ ...buttonStyle, opacity: libraries && libraries.length === 0 ? 0.5 : 1, cursor: libraries && libraries.length === 0 ? 'default' : 'pointer' }}
              disabled={!libraries || libraries.length === 0}
              title={libraries && libraries.length === 0 ? t('fileWindow.noLibrary') : t('fileWindow.addToLibraryHint')}
              onClick={() => (libraries && libraries.length === 1 ? addTo(libraries[0].path) : setMenuOpen(v => !v))}
            >
              {t('fileWindow.addToLibrary')}
            </button>
            {menuOpen && libraries && libraries.length > 1 && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100, minWidth: 220,
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 4,
                boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
              }}>
                <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{t('fileWindow.chooseLibrary')}</div>
                {libraries.map(lib => (
                  <button
                    key={lib.path}
                    onClick={() => addTo(lib.path)}
                    title={lib.path}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 13, border: 'none', borderRadius: 5, background: 'none', color: 'var(--text)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {lib.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0,
      padding: '8px 16px', fontSize: 12, borderBottom: '1px solid var(--border)',
      background: 'var(--surface, var(--bg))', color: 'var(--text)',
    }}>
      {children}
    </div>
  )
}

function TextFileBody({ info, showPreview, onStatus }: { info: SingleFileInfo; showPreview: boolean; onStatus: (s: SessionStatus) => void }) {
  const api = useBanjuanAPI()
  const t = useT()
  const file = api.file!
  const [opened, setOpened] = useState<{ text: string; readOnly: boolean } | null>(null)
  const [reload, setReload] = useState<{ text: string; version: number } | null>(null)
  const [status, setStatus] = useState<SessionStatus>('saved')
  const sessionRef = useRef<TextFileSession | null>(null)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  useEffect(() => {
    let cancelled = false
    const cleanups: Array<() => void> = []
    file.readBuffer().then(buf => {
      if (cancelled) return
      const decoded = decodeTextFile(toBytes(buf))
      const report = (s: SessionStatus) => { setStatus(s); onStatusRef.current(s) }
      const session = new TextFileSession({
        decoded,
        write: bytes => file.writeBytes(bytes),
        onStatus: report,
        onReload: text => setReload(r => ({ text, version: (r?.version ?? 0) + 1 })),
      })
      sessionRef.current = session
      report(session.status)
      setOpened({ text: decoded.text, readOnly: !!decoded.readOnlyReason })
      cleanups.push(file.onChanged(e => { void session.external(e, async () => toBytes(await file.readBuffer())) }))
      // Closing the window or quitting writes the last edit first.
      cleanups.push(registerFlushUntilWritten(() => session.save()))
    }).catch(e => toast.error(t('fileWindow.loadFailed', errorMessage(e))))
    return () => { cancelled = true; for (const c of cleanups) c() }
  }, [file])

  if (!opened) return null
  return (
    <>
      {status === 'readonly' && <Banner>{t('fileWindow.encodingReadOnly')}</Banner>}
      {status === 'gone' && <Banner>{t('fileWindow.gone')}</Banner>}
      {status === 'conflict' && (
        <Banner>
          <span>{t('fileWindow.changedOutside')}</span>
          <button style={buttonStyle} onClick={() => void sessionRef.current?.resolveConflict('theirs')}>{t('fileWindow.loadOutside')}</button>
          <button style={buttonStyle} onClick={() => void sessionRef.current?.resolveConflict('mine')}>{t('fileWindow.keepMine')}</button>
        </Banner>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TextFileEditor
          initialText={opened.text}
          reload={reload}
          readOnly={opened.readOnly}
          isMarkdown={info.type === 'markdown'}
          showPreview={showPreview}
          filePath={info.path}
          onChange={text => sessionRef.current?.setText(text)}
          onSaveNow={() => void sessionRef.current?.save()}
        />
      </div>
    </>
  )
}

function ViewerBody({ info }: { info: SingleFileInfo }) {
  const api = useBanjuanAPI()
  const fileApi = useMemo(() => createSingleFileApi(api, api.file!, info), [api, info])
  const [doc, setDoc] = useState<any>(null)

  useEffect(() => { fileApi.documents.get('').then(setDoc) }, [fileApi])

  if (!doc) return null
  return (
    <ViewerCapabilitiesContext.Provider value={ON_ITS_OWN}>
      <BanjuanAPIProvider value={fileApi}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <DocumentViewer doc={doc} onBack={() => window.close()} />
        </div>
      </BanjuanAPIProvider>
    </ViewerCapabilitiesContext.Provider>
  )
}

function Unsupported() {
  const api = useBanjuanAPI()
  const t = useT()
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)', fontSize: 13 }}>
      <div>{t('fileWindow.unsupported')}</div>
      <button style={buttonStyle} onClick={() => api.file!.openInSystem().catch(e => toast.error(errorMessage(e)))}>
        {t('viewer.openInSystem')}
      </button>
    </div>
  )
}
