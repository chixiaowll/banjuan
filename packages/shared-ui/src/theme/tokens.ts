import type { AppTheme } from './index.js'

export interface ThemeLayout {
  // Content area
  contentMaxWidth: number | null
  centeredContent: boolean
  showBreadcrumb: boolean
  homePadding: string
  listPadding: string

  // Sidebar
  sidebar: {
    width: number
    minWidth: number
    collapsedWidth: number
    background: string
    borderColor: string
    padding: string
    itemHeight: number | 'auto'
    itemPadding: string
    itemMargin: string
    itemRadius: number
    itemFontSize: number
    iconSize: number
    fontFamily: string | undefined
    activeColor: string
    activeBackground: string
    activeShadow: string
    inactiveColor: string
    hoverBackground: string
    showBadge: boolean
    dividerMargin: string
    collapsedItemSize: number
    collapsedRadius: number
    treeIndent: number
    tagPadding: string
  }

  // Toolbar
  toolbar: {
    padding: string
    gap: number
    showBorder: boolean
    showSectionButtons: boolean
  }

  // Page header (for list pages)
  pageHeader: {
    show: boolean
    padding: string
    maxWidth: number | null
  }

  // Home page
  home: {
    showDailyPick: boolean
    showSyncBadge: boolean
    sectionHeaderStyle: 'emoji' | 'text'
    linkColor: string
    primaryButtonBg: string
    primaryButtonShadow: string
    primaryButtonHoverBg: string
    importButtonBg: string
    headerAlign: 'flex-start' | 'flex-end'
    headerBorderBottom: string
    headerPaddingBottom: number
    headerMarginBottom: number
    showSealChar: boolean
    showPathBreadcrumb: boolean
    titleFontSize: number
    titleFontWeight: number
    titleFont: string | undefined
    titleLetterSpacing: string
    statsMarginBottom: number
    poetryMarginBottom: number
    poetryPaddingBottom: number
    poetryBorderBottom: string
    sectionCardStyle: 'card' | 'list'
    sectionTitleLetterSpacing: string
    sectionTitleFont: string | undefined
    sectionBg: string | undefined
    sectionBorder: string | undefined
    sectionRadius: number
    sectionPadding: string | undefined
    listItemBorderBottom: string
    listHoverStyle: 'expand' | 'highlight'
    annotationLayout: 'grid-card' | 'border-left'
    annotationGridColumns: string
    annotationSlice: number
    buttonHeight: number | undefined
    buttonPadding: string
    buttonRadius: number
  }

  // PoetryCard variant
  poetryCardVariant: 'classic' | 'minimal' | 'notebook'

  // Resizable sidebar
  sidebarResizable: boolean
}

const xuanPaper: ThemeLayout = {
  contentMaxWidth: null,
  centeredContent: false,
  showBreadcrumb: false,
  homePadding: '36px 56px 80px',
  listPadding: '10px 28px 80px',

  sidebar: {
    width: 240,
    minWidth: 180,
    collapsedWidth: 60,
    background: 'linear-gradient(180deg, #EFE8D7 0%, #E8DFC8 100%)',
    borderColor: 'var(--paper-edge)',
    padding: '',
    itemHeight: 32,
    itemPadding: '0 8px',
    itemMargin: '1px 8px',
    itemRadius: 5,
    itemFontSize: 13,
    iconSize: 18,
    fontFamily: undefined,
    activeColor: 'var(--vermilion)',
    activeBackground: 'var(--paper)',
    activeShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 3px rgba(0,0,0,0.04)',
    inactiveColor: 'var(--ink-mute)',
    hoverBackground: 'var(--hover)',
    showBadge: false,
    dividerMargin: '8px 16px',
    collapsedItemSize: 38,
    collapsedRadius: 9,
    treeIndent: 0,
    tagPadding: '4px 20px',
  },

  toolbar: {
    padding: '10px 28px',
    gap: 8,
    showBorder: true,
    showSectionButtons: true,
  },

  pageHeader: {
    show: false,
    padding: '',
    maxWidth: null,
  },

  home: {
    showDailyPick: false,
    showSyncBadge: false,
    sectionHeaderStyle: 'text',
    linkColor: 'var(--ink-mute)',
    primaryButtonBg: 'var(--ink)',
    primaryButtonShadow: '0 1px 2px rgba(0,0,0,0.1)',
    primaryButtonHoverBg: '#000',
    importButtonBg: 'transparent',
    headerAlign: 'flex-end',
    headerBorderBottom: '1px solid rgba(28,26,23,0.08)',
    headerPaddingBottom: 24,
    headerMarginBottom: 32,
    showSealChar: true,
    showPathBreadcrumb: false,
    titleFontSize: 34,
    titleFontWeight: 900,
    titleFont: 'var(--font-display)',
    titleLetterSpacing: '0.04em',
    statsMarginBottom: 36,
    poetryMarginBottom: 36,
    poetryPaddingBottom: 0,
    poetryBorderBottom: 'none',
    sectionCardStyle: 'list',
    sectionTitleLetterSpacing: '0.06em',
    sectionTitleFont: 'var(--font-display)',
    sectionBg: 'rgba(255,255,255,0.45)',
    sectionBorder: '1px solid rgba(28,26,23,0.08)',
    sectionRadius: 6,
    sectionPadding: '22px 24px',
    listItemBorderBottom: 'none',
    listHoverStyle: 'highlight',
    annotationLayout: 'border-left',
    annotationGridColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    annotationSlice: 6,
    buttonHeight: undefined,
    buttonPadding: '9px 18px',
    buttonRadius: 6,
  },

  poetryCardVariant: 'classic',
  sidebarResizable: true,
}

const minimal: ThemeLayout = {
  contentMaxWidth: null,
  centeredContent: false,
  showBreadcrumb: true,
  homePadding: '36px 48px 48px',
  listPadding: '10px 28px 80px',

  sidebar: {
    width: 220,
    minWidth: 220,
    collapsedWidth: 60,
    background: 'var(--bg)',
    borderColor: 'var(--border)',
    padding: '',
    itemHeight: 32,
    itemPadding: '0 8px',
    itemMargin: '1px 8px',
    itemRadius: 5,
    itemFontSize: 13,
    iconSize: 14,
    fontFamily: 'var(--font-cjk, var(--font-body))',
    activeColor: 'var(--ink)',
    activeBackground: 'var(--hover)',
    activeShadow: 'none',
    inactiveColor: 'var(--ink-mute)',
    hoverBackground: 'var(--hover)',
    showBadge: false,
    dividerMargin: '8px 16px',
    collapsedItemSize: 38,
    collapsedRadius: 9,
    treeIndent: 0,
    tagPadding: '4px 20px',
  },

  toolbar: {
    padding: '10px 28px',
    gap: 8,
    showBorder: true,
    showSectionButtons: true,
  },

  pageHeader: {
    show: false,
    padding: '',
    maxWidth: null,
  },

  home: {
    showDailyPick: false,
    showSyncBadge: false,
    sectionHeaderStyle: 'text',
    linkColor: 'var(--ink-mute)',
    primaryButtonBg: 'var(--ink)',
    primaryButtonShadow: '0 1px 2px rgba(0,0,0,0.1)',
    primaryButtonHoverBg: '#000',
    importButtonBg: 'var(--surface-raised)',
    headerAlign: 'flex-start',
    headerBorderBottom: 'none',
    headerPaddingBottom: 0,
    headerMarginBottom: 8,
    showSealChar: false,
    showPathBreadcrumb: true,
    titleFontSize: 30,
    titleFontWeight: 600,
    titleFont: undefined,
    titleLetterSpacing: '-0.02em',
    statsMarginBottom: 36,
    poetryMarginBottom: 40,
    poetryPaddingBottom: 32,
    poetryBorderBottom: '1px solid var(--border)',
    sectionCardStyle: 'list',
    sectionTitleLetterSpacing: '.01em',
    sectionTitleFont: undefined,
    sectionBg: undefined,
    sectionBorder: undefined,
    sectionRadius: 0,
    sectionPadding: undefined,
    listItemBorderBottom: '1px solid var(--border-soft, var(--border))',
    listHoverStyle: 'expand',
    annotationLayout: 'grid-card',
    annotationGridColumns: 'repeat(3, 1fr)',
    annotationSlice: 3,
    buttonHeight: 32,
    buttonPadding: '0 12px',
    buttonRadius: 6,
  },

  poetryCardVariant: 'minimal',
  sidebarResizable: false,
}

const notebook: ThemeLayout = {
  contentMaxWidth: 1100,
  centeredContent: true,
  showBreadcrumb: true,
  homePadding: '36px 48px 48px',
  listPadding: '10px 40px 80px',

  sidebar: {
    width: 240,
    minWidth: 200,
    collapsedWidth: 60,
    background: 'var(--surface, #F5EFE0)',
    borderColor: 'var(--border)',
    padding: '18px 12px 14px',
    itemHeight: 'auto',
    itemPadding: '8px 10px',
    itemMargin: '0 0 2px',
    itemRadius: 9,
    itemFontSize: 14,
    iconSize: 16,
    fontFamily: 'var(--font-cjk, var(--font-body))',
    activeColor: '#fff',
    activeBackground: '#4A90E2',
    activeShadow: '0 2px 6px rgba(74,144,226,0.3)',
    inactiveColor: 'var(--ink-soft, #5C564E)',
    hoverBackground: 'rgba(255,255,255,.6)',
    showBadge: true,
    dividerMargin: '14px 10px 14px',
    collapsedItemSize: 38,
    collapsedRadius: 9,
    treeIndent: 18,
    tagPadding: '4px 10px',
  },

  toolbar: {
    padding: '12px 40px',
    gap: 12,
    showBorder: false,
    showSectionButtons: false,
  },

  pageHeader: {
    show: true,
    padding: '36px 48px 0',
    maxWidth: 1100,
  },

  home: {
    showDailyPick: true,
    showSyncBadge: true,
    sectionHeaderStyle: 'emoji',
    linkColor: '#4A90E2',
    primaryButtonBg: '#4A90E2',
    primaryButtonShadow: '0 2px 8px rgba(74,144,226,0.3)',
    primaryButtonHoverBg: '#3A7BC8',
    importButtonBg: 'var(--surface-raised)',
    headerAlign: 'flex-start',
    headerBorderBottom: 'none',
    headerPaddingBottom: 0,
    headerMarginBottom: 8,
    showSealChar: false,
    showPathBreadcrumb: true,
    titleFontSize: 30,
    titleFontWeight: 600,
    titleFont: undefined,
    titleLetterSpacing: '-0.02em',
    statsMarginBottom: 36,
    poetryMarginBottom: 40,
    poetryPaddingBottom: 0,
    poetryBorderBottom: 'none',
    sectionCardStyle: 'card',
    sectionTitleLetterSpacing: '.01em',
    sectionTitleFont: undefined,
    sectionBg: undefined,
    sectionBorder: undefined,
    sectionRadius: 0,
    sectionPadding: undefined,
    listItemBorderBottom: '1px solid var(--border-soft, var(--border))',
    listHoverStyle: 'expand',
    annotationLayout: 'grid-card',
    annotationGridColumns: 'repeat(3, 1fr)',
    annotationSlice: 3,
    buttonHeight: 32,
    buttonPadding: '0 12px',
    buttonRadius: 9,
  },

  poetryCardVariant: 'notebook',
  sidebarResizable: true,
}

const THEME_LAYOUTS: Record<AppTheme, ThemeLayout> = {
  'xuan-paper': xuanPaper,
  'minimal': minimal,
  'notebook': notebook,
}

export function getThemeLayout(theme: AppTheme): ThemeLayout {
  return THEME_LAYOUTS[theme] ?? THEME_LAYOUTS['xuan-paper']
}
