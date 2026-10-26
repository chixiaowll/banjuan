import { useState, useEffect } from 'react'
import { MantineProvider } from '@mantine/core'
import { BanjuanAPIProvider, I18nProvider, ThemeProvider, TabManager, FeedbackHost } from '@banjuan/shared-ui'
import { createCapacitorAPI } from './capacitor-api.js'
import { WelcomeView } from './WelcomeView.js'

import '@mantine/core/styles.css'
import '../../shared-ui/src/global.css'

const api = createCapacitorAPI()

export function App() {
  const [library, setLibrary] = useState<{ path: string; name: string } | null>(null)
  // Simulator self-test builds only (vite --mode selftest): let the test drive the app.
  useEffect(() => {
    if (import.meta.env.MODE !== 'selftest') return
    ;(window as any).__selftest = { api, open: (path: string, name: string) => setLibrary({ path, name }) }
  }, [])

  return (
    <MantineProvider>
      <ThemeProvider>
      <I18nProvider>
        <BanjuanAPIProvider value={api}>
          {library
            ? <TabManager libraryPath={library.path} libraryName={library.name} onSwitchLibrary={() => setLibrary(null)} onLibraryRenamed={(name) => setLibrary(prev => prev ? { ...prev, name } : prev)} />
            : <WelcomeView onOpen={(path, name) => setLibrary({ path, name })} />
          }
          <FeedbackHost />
        </BanjuanAPIProvider>
      </I18nProvider>
      </ThemeProvider>
    </MantineProvider>
  )
}
