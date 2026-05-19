export interface NoteTheme {
  name: string
  preview: { h1: string; h2: string; h3: string }
  vars: Record<string, string>
}

const classic: NoteTheme = {
  name: 'Classic',
  preview: { h1: '#2b579a', h2: '#1b7332', h3: '#b5600e' },
  vars: {
    '--note-h1-color': '#2b579a',
    '--note-h2-color': '#1b7332',
    '--note-h3-color': '#b5600e',
    '--note-h1-border': '#d6e0f0',
    '--note-text': '#2c2c2c',
    '--note-bold-color': '#1a1a2e',
    '--note-code-color': '#c7254e',
    '--note-code-bg': '#f3f4f6',
    '--note-code-border': '#eaecef',
    '--note-codeblock-bg': '#f6f8fa',
    '--note-codeblock-border': '#e1e4e8',
    '--note-codeblock-text': '#24292e',
    '--note-blockquote-border': '#dfe2e5',
    '--note-blockquote-bg': '#fafbfc',
    '--note-blockquote-text': '#555',
    '--note-link-color': '#1a73e8',
    '--note-mark-bg': '#fff3bf',
    '--note-table-header-bg': '#f6f8fa',
    '--note-table-border': '#e1e4e8',
  },
}

const business: NoteTheme = {
  name: 'Business',
  preview: { h1: '#2C3E50', h2: '#34495E', h3: '#7F8C8D' },
  vars: {
    '--note-h1-color': '#2C3E50',
    '--note-h2-color': '#34495E',
    '--note-h3-color': '#7F8C8D',
    '--note-h1-border': '#BDC3C7',
    '--note-text': '#2C3E50',
    '--note-bold-color': '#1A252F',
    '--note-code-color': '#E74C3C',
    '--note-code-bg': '#F8F9FA',
    '--note-code-border': '#DEE2E6',
    '--note-codeblock-bg': '#F8F9FA',
    '--note-codeblock-border': '#DEE2E6',
    '--note-codeblock-text': '#2C3E50',
    '--note-blockquote-border': '#BDC3C7',
    '--note-blockquote-bg': '#F8F9FA',
    '--note-blockquote-text': '#495057',
    '--note-link-color': '#2C3E50',
    '--note-mark-bg': '#FFF9C4',
    '--note-table-header-bg': '#ECF0F1',
    '--note-table-border': '#DEE2E6',
  },
}

const minimal: NoteTheme = {
  name: 'Minimal',
  preview: { h1: '#222222', h2: '#444444', h3: '#666666' },
  vars: {
    '--note-h1-color': '#222222',
    '--note-h2-color': '#444444',
    '--note-h3-color': '#666666',
    '--note-h1-border': '#E0E0E0',
    '--note-text': '#333333',
    '--note-bold-color': '#111111',
    '--note-code-color': '#555555',
    '--note-code-bg': '#F5F5F5',
    '--note-code-border': '#E8E8E8',
    '--note-codeblock-bg': '#F5F5F5',
    '--note-codeblock-border': '#E0E0E0',
    '--note-codeblock-text': '#333333',
    '--note-blockquote-border': '#BDBDBD',
    '--note-blockquote-bg': '#FAFAFA',
    '--note-blockquote-text': '#616161',
    '--note-link-color': '#333333',
    '--note-mark-bg': '#EEEEEE',
    '--note-table-header-bg': '#F5F5F5',
    '--note-table-border': '#E0E0E0',
  },
}

const nord: NoteTheme = {
  name: 'Nord',
  preview: { h1: '#5e81ac', h2: '#4a8fa0', h3: '#5f9190' },
  vars: {
    '--note-h1-color': '#5e81ac',
    '--note-h2-color': '#4a8fa0',
    '--note-h3-color': '#5f9190',
    '--note-h1-border': '#d8dee9',
    '--note-text': '#2e3440',
    '--note-bold-color': '#2e3440',
    '--note-code-color': '#bf616a',
    '--note-code-bg': '#fdf2f3',
    '--note-code-border': '#e5e9f0',
    '--note-codeblock-bg': '#eceff4',
    '--note-codeblock-border': '#d8dee9',
    '--note-codeblock-text': '#2e3440',
    '--note-blockquote-border': '#b0c4d8',
    '--note-blockquote-bg': '#eceff4',
    '--note-blockquote-text': '#4c566a',
    '--note-link-color': '#5e81ac',
    '--note-mark-bg': '#fdf5e0',
    '--note-table-header-bg': '#eceff4',
    '--note-table-border': '#d8dee9',
  },
}

const solarized: NoteTheme = {
  name: 'Solarized',
  preview: { h1: '#268bd2', h2: '#6c71c4', h3: '#2aa198' },
  vars: {
    '--note-h1-color': '#268bd2',
    '--note-h2-color': '#6c71c4',
    '--note-h3-color': '#2aa198',
    '--note-h1-border': '#eee8d5',
    '--note-text': '#657b83',
    '--note-bold-color': '#586e75',
    '--note-code-color': '#cb4b16',
    '--note-code-bg': '#fdf6e3',
    '--note-code-border': '#eee8d5',
    '--note-codeblock-bg': '#fdf6e3',
    '--note-codeblock-border': '#eee8d5',
    '--note-codeblock-text': '#657b83',
    '--note-blockquote-border': '#93a1a1',
    '--note-blockquote-bg': '#fdf6e3',
    '--note-blockquote-text': '#586e75',
    '--note-link-color': '#268bd2',
    '--note-mark-bg': '#fff8dc',
    '--note-table-header-bg': '#fdf6e3',
    '--note-table-border': '#eee8d5',
  },
}

const catppuccin: NoteTheme = {
  name: 'Catppuccin',
  preview: { h1: '#8839ef', h2: '#209fb5', h3: '#dd7878' },
  vars: {
    '--note-h1-color': '#8839ef',
    '--note-h2-color': '#209fb5',
    '--note-h3-color': '#dd7878',
    '--note-h1-border': '#e6cff5',
    '--note-text': '#4c4f69',
    '--note-bold-color': '#3c3f52',
    '--note-code-color': '#d2691e',
    '--note-code-bg': '#fef3ec',
    '--note-code-border': '#e6e9ef',
    '--note-codeblock-bg': '#e6e9ef',
    '--note-codeblock-border': '#ccd0da',
    '--note-codeblock-text': '#4c4f69',
    '--note-blockquote-border': '#bcc0cc',
    '--note-blockquote-bg': '#eff1f5',
    '--note-blockquote-text': '#5c5f77',
    '--note-link-color': '#1e66f5',
    '--note-mark-bg': '#fff9db',
    '--note-table-header-bg': '#eff1f5',
    '--note-table-border': '#ccd0da',
  },
}

const gruvbox: NoteTheme = {
  name: 'Gruvbox',
  preview: { h1: '#9d0006', h2: '#427b58', h3: '#8f3f71' },
  vars: {
    '--note-h1-color': '#9d0006',
    '--note-h2-color': '#427b58',
    '--note-h3-color': '#8f3f71',
    '--note-h1-border': '#ebdbb2',
    '--note-text': '#3c3836',
    '--note-bold-color': '#282828',
    '--note-code-color': '#af3a03',
    '--note-code-bg': '#fdf4e8',
    '--note-code-border': '#ebdbb2',
    '--note-codeblock-bg': '#fbf1c7',
    '--note-codeblock-border': '#ebdbb2',
    '--note-codeblock-text': '#3c3836',
    '--note-blockquote-border': '#bdae93',
    '--note-blockquote-bg': '#fbf1c7',
    '--note-blockquote-text': '#504945',
    '--note-link-color': '#076678',
    '--note-mark-bg': '#f9e8a0',
    '--note-table-header-bg': '#fbf1c7',
    '--note-table-border': '#ebdbb2',
  },
}

const tokyoLight: NoteTheme = {
  name: 'Tokyo Light',
  preview: { h1: '#34548a', h2: '#7847a0', h3: '#006c86' },
  vars: {
    '--note-h1-color': '#34548a',
    '--note-h2-color': '#7847a0',
    '--note-h3-color': '#006c86',
    '--note-h1-border': '#d5d6db',
    '--note-text': '#343b58',
    '--note-bold-color': '#2a2f4a',
    '--note-code-color': '#965027',
    '--note-code-bg': '#fef5ef',
    '--note-code-border': '#e9e9ed',
    '--note-codeblock-bg': '#f0f0f5',
    '--note-codeblock-border': '#e0e0e6',
    '--note-codeblock-text': '#343b58',
    '--note-blockquote-border': '#9699a3',
    '--note-blockquote-bg': '#f0f0f5',
    '--note-blockquote-text': '#4c505e',
    '--note-link-color': '#34548a',
    '--note-mark-bg': '#fff5cc',
    '--note-table-header-bg': '#f0f0f5',
    '--note-table-border': '#e0e0e6',
  },
}

const bear: NoteTheme = {
  name: 'Bear',
  preview: { h1: '#a33327', h2: '#4e6e8e', h3: '#6b7f54' },
  vars: {
    '--note-h1-color': '#a33327',
    '--note-h2-color': '#4e6e8e',
    '--note-h3-color': '#6b7f54',
    '--note-h1-border': '#e8d5d2',
    '--note-text': '#333333',
    '--note-bold-color': '#222222',
    '--note-code-color': '#c0504d',
    '--note-code-bg': '#fdf2f2',
    '--note-code-border': '#e8e0de',
    '--note-codeblock-bg': '#f9f8f6',
    '--note-codeblock-border': '#e8e5e0',
    '--note-codeblock-text': '#333333',
    '--note-blockquote-border': '#d1d5db',
    '--note-blockquote-bg': '#f9f8f6',
    '--note-blockquote-text': '#555555',
    '--note-link-color': '#3b82c4',
    '--note-mark-bg': '#fde8d0',
    '--note-table-header-bg': '#f9f8f6',
    '--note-table-border': '#e8e5e0',
  },
}

const oneLight: NoteTheme = {
  name: 'One Light',
  preview: { h1: '#a0321f', h2: '#2f65d4', h3: '#a626a4' },
  vars: {
    '--note-h1-color': '#a0321f',
    '--note-h2-color': '#2f65d4',
    '--note-h3-color': '#a626a4',
    '--note-h1-border': '#e0d6d4',
    '--note-text': '#383a42',
    '--note-bold-color': '#2c2e34',
    '--note-code-color': '#50a14f',
    '--note-code-bg': '#f0faf0',
    '--note-code-border': '#e0e8e0',
    '--note-codeblock-bg': '#f5f5f5',
    '--note-codeblock-border': '#e0e0e0',
    '--note-codeblock-text': '#383a42',
    '--note-blockquote-border': '#a0a1a7',
    '--note-blockquote-bg': '#f5f5f5',
    '--note-blockquote-text': '#696c77',
    '--note-link-color': '#4078f2',
    '--note-mark-bg': '#fff3cd',
    '--note-table-header-bg': '#f5f5f5',
    '--note-table-border': '#e0e0e0',
  },
}

export const NOTE_THEMES: Record<string, NoteTheme> = {
  classic,
  business,
  minimal,
  nord,
  solarized,
  catppuccin,
  gruvbox,
  tokyoLight,
  bear,
  oneLight,
}

export const NOTE_THEME_KEYS = Object.keys(NOTE_THEMES)

const STORAGE_KEY = 'banjuan-note-theme'

export function applyNoteTheme(key: string) {
  const theme = NOTE_THEMES[key] ?? NOTE_THEMES.classic
  const root = document.documentElement
  for (const [prop, val] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, val)
  }
  try { localStorage.setItem(STORAGE_KEY, key) } catch {}
}

export function getStoredNoteTheme(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && NOTE_THEMES[stored]) return stored
  } catch {}
  return 'classic'
}

if (typeof window !== 'undefined') {
  applyNoteTheme(getStoredNoteTheme())
}
