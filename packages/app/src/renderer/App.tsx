import React, { useState, useEffect } from 'react'
import { BanjuanAPIProvider, I18nProvider, ThemeProvider, TabManager, NoteRenderService, ExportWorkerApp } from '@banjuan/shared-ui'
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

function ExportWorkerRoot() {
  return (
    <BanjuanAPIProvider value={electronAPI}>
      <ThemeProvider>
        <I18nProvider>
          <ExportWorkerApp />
        </I18nProvider>
      </ThemeProvider>
    </BanjuanAPIProvider>
  )
}

export default function App() {
  if (IS_EXPORT_WORKER) return <ExportWorkerRoot />
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
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
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
      </I18nProvider>
      </ThemeProvider>
    </BanjuanAPIProvider>
  )
}
