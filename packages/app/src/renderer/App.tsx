import React, { useState, useEffect } from 'react'
import { BanjuanAPIProvider, I18nProvider, ThemeProvider, TabManager, NoteRenderService } from '@banjuan/shared-ui'
import WelcomeView from './views/WelcomeView.js'
import { electronAPI } from './electron-api.js'

interface LibraryInfo {
  path: string
  name: string
}

export default function App() {
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
