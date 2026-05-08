import React, { useState } from 'react'
import { I18nProvider } from './i18n/index.js'
import WelcomeView from './views/WelcomeView.js'
import TabManager from './components/TabManager.js'
import NoteRenderService from './components/NoteRenderService.js'

interface LibraryInfo {
  path: string
  name: string
}

export default function App() {
  const [library, setLibrary] = useState<LibraryInfo | null>(null)

  return (
    <I18nProvider>
      {!library
        ? <WelcomeView onOpen={(path, name) => setLibrary({ path, name })} />
        : <TabManager libraryPath={library.path} libraryName={library.name} />}
      <NoteRenderService />
    </I18nProvider>
  )
}
