import React, { useState } from 'react'
import WelcomeView from './views/WelcomeView.js'
import LibraryView from './views/LibraryView.js'
import DocumentViewer from './components/viewers/DocumentViewer.js'
import NoteView from './views/NoteView.js'

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [viewingDoc, setViewingDoc] = useState<any>(null)
  const [viewingNote, setViewingNote] = useState<any>(null)

  if (!libraryPath) return <WelcomeView onOpen={setLibraryPath} />
  if (viewingNote) return <NoteView note={viewingNote} onBack={() => setViewingNote(null)} />
  if (viewingDoc) return <DocumentViewer doc={viewingDoc} onBack={() => setViewingDoc(null)} />
  return <LibraryView rootPath={libraryPath} onOpenDoc={setViewingDoc} onOpenNote={setViewingNote} />
}
