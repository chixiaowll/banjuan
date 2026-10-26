import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // pdf.js CMaps (bcmaps/) and standard fonts, shared with the desktop renderer:
  // the PDF viewer loads them from /bcmaps/ and /standard_fonts/. Without them,
  // PDFs with non-embedded CJK fonts showed and extracted wrong text on iPad.
  publicDir: '../app/src/renderer/public',
  build: {
    outDir: 'dist',
  },
})
