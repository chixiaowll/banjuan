import { createRoot } from 'react-dom/client'
import { App } from './App.js'

createRoot(document.getElementById('root')!).render(<App />)

if (import.meta.env.MODE === 'selftest') void import('./selftest.js').then(m => m.runSelftest())
