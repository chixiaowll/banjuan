import { LOCALE_TAGS } from '../../i18n/index.js'
import type { Locale, MessageKey } from '../../i18n/index.js'

export interface Document {
  id: string
  title: string
  type: string
  path: string
  authors: string[]
  hash: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface LibraryTag {
  id: string
  name: string
  color: string | null
}

export interface LibraryViewProps {
  rootPath: string
  libraryName: string
  onOpenDoc: (doc: Document) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
  onOpenGraph?: () => void
  onOpenTagManager?: () => void
  onOpenPluginView?: (pluginId: string, viewType: string) => void
  detailOpen?: boolean
  onToggleDetail?: () => void
  detailPortalTarget?: HTMLElement | null
  onSwitchLibrary?: () => void
  onLibraryRenamed?: (name: string) => void
}

export type SidebarSection = 'home' | 'documents' | 'notes' | 'sync' | 'plugins' | 'settings' | 'trash' | 'tags' | 'tag-results'

export interface DirNode {
  name: string
  path: string
  children: DirNode[]
  count?: number
}

export function buildDirTree(docs: Document[], extraDirs?: string[]): DirNode[] {
  const root: Record<string, any> = {}
  const dirCounts: Record<string, number> = {}
  const addPath = (parts: string[]) => {
    let current = root
    let pathSoFar = ''
    for (const part of parts) {
      pathSoFar = pathSoFar ? pathSoFar + '/' + part : part
      if (!current[part]) current[part] = { __path: pathSoFar }
      current = current[part]
    }
  }
  for (const doc of docs) {
    const parts = doc.path.split('/')
    if (parts.length <= 1) continue
    addPath(parts.slice(0, -1))
    let pathSoFar = ''
    for (let i = 0; i < parts.length - 1; i++) {
      pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i]
      dirCounts[pathSoFar] = (dirCounts[pathSoFar] || 0) + 1
    }
  }
  if (extraDirs) {
    for (const dir of extraDirs) {
      addPath(dir.split('/'))
    }
  }

  function toNodes(obj: Record<string, any>): DirNode[] {
    return Object.keys(obj)
      .filter(k => k !== '__path')
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map(k => ({
        name: k,
        path: obj[k].__path,
        children: toNodes(obj[k]),
        count: dirCounts[obj[k].__path],
      }))
  }
  return toNodes(root)
}

export const TYPE_PILLS: Record<string, { bg: string; color: string; label: string }> = {
  markdown:    { bg: 'var(--tag-md-bg)', color: 'var(--tag-md-color)', label: 'MD' },
  mindmap:     { bg: 'var(--tag-mind-bg)', color: 'var(--tag-mind-color)', label: 'MIND' },
  handwriting: { bg: 'var(--tag-hand-bg)', color: 'var(--tag-hand-color)', label: 'HAND' },
  pdf:         { bg: 'var(--tag-pdf-bg)', color: 'var(--tag-pdf-color)', label: 'PDF' },
  epub:        { bg: 'var(--tag-epub-bg)', color: 'var(--tag-epub-color)', label: 'EPUB' },
  txt:         { bg: 'var(--tag-txt-bg)', color: 'var(--tag-txt-color)', label: 'TXT' },
  md:          { bg: 'var(--tag-md-bg)', color: 'var(--tag-md-color)', label: 'MD' },
  image:       { bg: 'var(--tag-img-bg)', color: 'var(--tag-img-color)', label: 'IMG' },
  video:       { bg: 'var(--tag-video-bg)', color: 'var(--tag-video-color)', label: 'VIDEO' },
  html:        { bg: 'var(--tag-html-bg)', color: 'var(--tag-html-color)', label: 'HTML' },
  other:       { bg: 'var(--tag-txt-bg)', color: 'var(--tag-txt-color)', label: 'OTHER' },
}

export function formatDate(dateStr: string, locale: Locale): string {
  try {
    return new Date(dateStr).toLocaleDateString(LOCALE_TAGS[locale], {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch { return dateStr }
}

export function formatRelativeTime(dateStr: string, locale: Locale, t: (key: MessageKey, ...args: Array<string | number>) => string): { relative: string; absolute: string } {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMs / 3600000)
    const absolute = d.toLocaleDateString(LOCALE_TAGS[locale], { year: 'numeric', month: '2-digit', day: '2-digit' })
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()
    const timeStr = d.toLocaleTimeString(LOCALE_TAGS[locale], { hour: '2-digit', minute: '2-digit' })

    let relative: string
    if (diffMin < 1) relative = t('library.justNow')
    else if (diffMin < 60) relative = t('library.minutesAgo', diffMin)
    else if (diffHr < 24 && isToday) relative = t('library.hoursAgo', diffHr)
    else if (isYesterday) relative = t('library.yesterdayAt', timeStr)
    else {
      const diffDay = Math.floor(diffMs / 86400000)
      relative = t('library.daysAgo', diffDay)
    }
    return { relative, absolute }
  } catch { return { relative: dateStr, absolute: dateStr } }
}

/** Group (already sorted) items into day buckets by `field`, labelled in the UI locale. */
export function groupByDate(items: any[], locale: string, field: 'updatedAt' | 'createdAt' = 'updatedAt'): { label: string; items: any[] }[] {
  const now = new Date()
  const today = now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toDateString()
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
  const monthDay = (d: Date) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  const groups: Map<string, any[]> = new Map()
  const groupLabels: Map<string, string> = new Map()

  for (const item of items) {
    const d = new Date((field === 'createdAt' ? item.createdAt : item.updatedAt || item.createdAt) || '')
    const ds = d.toDateString()
    const key = ds
    if (!groups.has(key)) {
      groups.set(key, [])
      let label: string
      if (ds === today) label = `${cap(rel.format(0, 'day'))} · ${monthDay(d)}`
      else if (ds === yesterdayStr) label = `${cap(rel.format(-1, 'day'))} · ${monthDay(d)}`
      else label = `${monthDay(d)} · ${d.toLocaleDateString(locale, { weekday: 'short' })}`
      groupLabels.set(key, label)
    }
    groups.get(key)!.push(item)
  }
  return Array.from(groups.entries()).map(([key, items]) => ({ label: groupLabels.get(key)!, items }))
}

export const COVER_PALETTES: Record<string, string[]> = {
  pdf: ['#E07856', '#5FA3A0', '#A8835C', '#2C2825', '#6B95C9'],
  markdown: ['#F0A858', '#7AAE7E', '#6B95C9', '#E6C84A', '#9881B8'],
  epub: ['#9881B8', '#5FA3A0', '#E07856', '#6B95C9'],
  mindmap: ['#6B95C9', '#9881B8', '#7AAE7E'],
  handwriting: ['#E6C84A', '#F0A858', '#D89AA8'],
  txt: ['#A8835C', '#8A8377', '#5FA3A0'],
  image: ['#7AAE7E', '#6B95C9', '#5FA3A0'],
  video: ['#D89AA8', '#9881B8', '#E07856'],
  html: ['#5FA3A0', '#6B95C9', '#7AAE7E'],
  other: ['#A8835C', '#8A8377'],
}

export function coverColorFor(type: string, title: string) {
  const palette = COVER_PALETTES[type] || COVER_PALETTES.other!
  let h = 0
  for (let i = 0; i < title.length; i++) h = ((h << 5) - h + title.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

export const COVER_COLORS: Record<string, string> = {
  pdf: '#E07856', epub: '#9881B8', markdown: '#F0A858', mindmap: '#6B95C9',
  handwriting: '#E6C84A', txt: '#A8835C', image: '#7AAE7E', video: '#D89AA8',
  html: '#5FA3A0', other: '#A8835C',
}

export const FOLDER_COLORS = ['#6B95C9', '#F0A858', '#7AAE7E', '#9881B8', '#E07856', '#5FA3A0', '#D89AA8', '#A8835C', '#E6C84A', '#6BAABD']
