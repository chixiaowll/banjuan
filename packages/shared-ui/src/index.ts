// API context
export { BanjuanAPIProvider, useBanjuanAPI } from './api.js'
export type { BanjuanAPI } from './api.js'

// i18n
export { I18nProvider, useT, useI18n } from './i18n/index.js'
export type { Locale } from './i18n/index.js'

// Theme
export { ThemeProvider, useTheme, APP_THEMES } from './theme/index.js'
export type { AppTheme } from './theme/index.js'

// Views
export { default as LibraryView } from './views/LibraryView.js'
export { default as NoteView } from './views/NoteView.js'
export { default as GraphView } from './views/GraphView.js'
export { default as TagManagerView } from './views/TagManagerView.js'
export { default as PluginViewHost } from './views/PluginViewHost.js'

// Top-level components
export { default as TabManager } from './components/TabManager.js'
export { default as NoteRenderService } from './components/NoteRenderService.js'
export { default as TitleBar } from './components/TitleBar.js'
export { ResizeHandle, useResizable } from './components/ResizeHandle.js'
export { PoetryCard } from './components/PoetryCard.js'

// Hooks
export { useAnnotations } from './hooks/useAnnotations.js'
export { useLongPress } from './hooks/useLongPress.js'
