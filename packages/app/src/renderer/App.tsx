import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BanjuanAPIProvider, I18nProvider, ThemeProvider, TabManager, NoteRenderService, FeedbackHost, FileWindowApp, useT, useI18n, flushAll, type ImportOpenTarget } from '@banjuan/shared-ui'
import WelcomeView from './views/WelcomeView.js'
import { electronAPI } from './electron-api.js'

interface LibraryInfo {
  path: string
  name: string
}

/**
 * The hidden background export window loads index.html with this hash. It runs
 * only the export worker (no library picker, no main UI) — main maps the
 * visible window's open library to this window before dispatching a job.
 */
const IS_EXPORT_WORKER = window.location.hash === '#export-worker'

/** A single-file window (a file opened on its own); main tells it which file. */
const IS_FILE_WINDOW = window.location.hash === '#file'

/**
 * A library window opened for a file handed over from a single-file window:
 * `#library=<path>&importOpen=<file>[&rel=<path in library>]`.
 */
function launchTarget(): { library: string; importOpen?: ImportOpenTarget } | null {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const library = params.get('library')
  if (!library) return null
  const absPath = params.get('importOpen')
  // Once: a reload of this window shouldn't bring the file in again.
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return { library, importOpen: absPath ? { absPath, relPath: params.get('rel') ?? undefined } : undefined }
}

// Only the hidden export window runs the worker (BlockNote + mind-map export):
// load it on demand so the main window's startup bundle doesn't carry it.
const ExportWorkerApp = lazy(() => import('@banjuan/shared-ui/src/components/ExportWorkerApp'))

function ExportWorkerRoot() {
  return (
    <BanjuanAPIProvider value={electronAPI}>
      <ThemeProvider>
        <I18nProvider>
          <Suspense fallback={null}><ExportWorkerApp /></Suspense>
        </I18nProvider>
      </ThemeProvider>
    </BanjuanAPIProvider>
  )
}

/** Tells main the UI language (the menu bar menu uses it). */
function LocaleReporter() {
  const { locale } = useI18n()
  useEffect(() => { electronAPI.menuBar?.setLocale(locale) }, [locale])
  return null
}

function FileWindowRoot() {
  return (
    <BanjuanAPIProvider value={electronAPI}>
      <ThemeProvider>
        <I18nProvider>
          <LocaleReporter />
          <FileWindowApp />
          <FeedbackHost />
        </I18nProvider>
      </ThemeProvider>
    </BanjuanAPIProvider>
  )
}

function LoadingLabel() {
  const t = useT()
  return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('common.loading')}</div>
}

export default function App() {
  if (IS_EXPORT_WORKER) return <ExportWorkerRoot />
  if (IS_FILE_WINDOW) return <FileWindowRoot />
  return <MainApp />
}

function MainApp() {
  const [library, setLibrary] = useState<LibraryInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [target] = useState(launchTarget)

  useEffect(() => {
    if (target) {
      electronAPI.library.open(target.library)
        .then((result: any) => setLibrary({ path: result.rootPath, name: result.name }))
        .catch(() => setReady(true))
      return
    }
    electronAPI.library.getHistory?.().then((h: any[]) => {
      if (h && h.length > 0) {
        const last = h[0]
        electronAPI.library.open(last.path)
          .then((result: any) => {
            setLibrary({ path: result.rootPath, name: result.name || last.name })
          })
          .catch(() => {
            setReady(true)
          })
      } else {
        setReady(true)
      }
    }).catch(() => {
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (library) setReady(true)
  }, [library])

  // Window close / app quit: write every pending edit first (main waits for this).
  useEffect(() => electronAPI.lifecycle?.onFlushRequest(flushAll), [])

  if (!ready) {
    return (
      <BanjuanAPIProvider value={electronAPI}>
        <ThemeProvider>
        <I18nProvider>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: 'var(--bg)',
          }}>
            <LoadingLabel />
          </div>
        </I18nProvider>
        </ThemeProvider>
      </BanjuanAPIProvider>
    )
  }

  return (
    <BanjuanAPIProvider value={electronAPI}>
      <ThemeProvider>
      <I18nProvider>
        <LocaleReporter />
        {!library
          ? <WelcomeView onOpen={(path, name) => setLibrary({ path, name })} />
          : <TabManager
              libraryPath={library.path}
              libraryName={library.name}
              onSwitchLibrary={() => setLibrary(null)}
              onLibraryRenamed={(name) => setLibrary(prev => prev ? { ...prev, name } : prev)}
              pendingImportOpen={target?.importOpen}
            />}
        <NoteRenderService />
        <FeedbackHost />
      </I18nProvider>
      </ThemeProvider>
    </BanjuanAPIProvider>
  )
}
