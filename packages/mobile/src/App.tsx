import { useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { BanjuanAPIProvider, I18nProvider, ThemeProvider, TabManager } from '@banjuan/shared-ui'
import { createCapacitorAPI } from './capacitor-api.js'
import { WelcomeView } from './WelcomeView.js'

import '@mantine/core/styles.css'
import '../../shared-ui/src/global.css'

const api = createCapacitorAPI()

export function App() {
  const [library, setLibrary] = useState<{ path: string; name: string } | null>(null)

  return (
    <MantineProvider>
      <ThemeProvider>
      <I18nProvider>
        <BanjuanAPIProvider value={api}>
          {library
            ? <TabManager libraryPath={library.path} libraryName={library.name} onSwitchLibrary={() => setLibrary(null)} />
            : <WelcomeView onOpen={(path, name) => setLibrary({ path, name })} />
          }
        </BanjuanAPIProvider>
      </I18nProvider>
      </ThemeProvider>
    </MantineProvider>
  )
}
