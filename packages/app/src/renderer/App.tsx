import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BanjuanAPIProvider, I18nProvider, ThemeProvider, TabManager, NoteRenderService, FeedbackHost, useT } from '@banjuan/shared-ui'
import WelcomeView from './views/WelcomeView.js'
import ScreenshotOverlay from './views/ScreenshotOverlay.js'
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
const IS_SCREENSHOT_OVERLAY = window.location.hash === '#screenshot-overlay'

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

function LoadingLabel() {
  const t = useT()
  return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('common.loading')}</div>
}

export default function App() {
  if (IS_EXPORT_WORKER) return <ExportWorkerRoot />
  if (IS_SCREENSHOT_OVERLAY) return <ScreenshotOverlay />
  return <MainApp />
}

function MainApp() {
  const [library, setLibrary] = useState<LibraryInfo | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
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
        {!library
          ? <WelcomeView onOpen={(path, name) => setLibrary({ path, name })} />
          : <TabManager
              libraryPath={library.path}
              libraryName={library.name}
              onSwitchLibrary={() => setLibrary(null)}
              onLibraryRenamed={(name) => setLibrary(prev => prev ? { ...prev, name } : prev)}
            />}
        <NoteRenderService />
        <FeedbackHost />
      </I18nProvider>
      </ThemeProvider>
    </BanjuanAPIProvider>
  )
}
