import { useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { BanjuanAPIProvider } from '@banjuan/shared-ui'
import { createCapacitorAPI } from './capacitor-api.js'
import { WelcomeView } from './WelcomeView.js'

import '@mantine/core/styles.css'

const api = createCapacitorAPI()

export function App() {
  const [libraryOpen, setLibraryOpen] = useState(false)

  return (
    <MantineProvider>
      <BanjuanAPIProvider value={api}>
        {libraryOpen
          ? <div>Library Open (TabManager will be imported from shared-ui)</div>
          : <WelcomeView onOpen={() => setLibraryOpen(true)} />
        }
      </BanjuanAPIProvider>
    </MantineProvider>
  )
}
