import React, { useState } from 'react'
import WelcomeView from './views/WelcomeView.js'
import LibraryView from './views/LibraryView.js'
import DocumentViewer from './components/viewers/DocumentViewer.js'

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [viewingDoc, setViewingDoc] = useState<any>(null)

  if (!libraryPath) {
    return <WelcomeView onOpen={setLibraryPath} />
  }

  if (viewingDoc) {
    return <DocumentViewer doc={viewingDoc} onBack={() => setViewingDoc(null)} />
  }

  return <LibraryView rootPath={libraryPath} onOpenDoc={setViewingDoc} />
}
