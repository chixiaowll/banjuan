import React, { useState } from 'react'
import { BanjuanAPIProvider, I18nProvider, TabManager, NoteRenderService } from '@banjuan/shared-ui'
import WelcomeView from './views/WelcomeView.js'
import { electronAPI } from './electron-api.js'

interface LibraryInfo {
  path: string
  name: string
}

export default function App() {
  const [library, setLibrary] = useState<LibraryInfo | null>(null)

  return (
    <BanjuanAPIProvider value={electronAPI}>
      <I18nProvider>
        {!library
          ? <WelcomeView onOpen={(path, name) => setLibrary({ path, name })} />
          : <TabManager libraryPath={library.path} libraryName={library.name} />}
        <NoteRenderService />
      </I18nProvider>
    </BanjuanAPIProvider>
  )
}
