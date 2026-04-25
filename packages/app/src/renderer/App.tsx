import React, { useState } from 'react'
import WelcomeView from './views/WelcomeView.js'
import LibraryView from './views/LibraryView.js'

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)

  if (!libraryPath) {
    return <WelcomeView onOpen={setLibraryPath} />
  }

  return <LibraryView rootPath={libraryPath} />
}
