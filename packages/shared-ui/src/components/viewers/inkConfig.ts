export const INK_COLORS = [
  '#1a1a1a', '#5c5c5c', '#3182ce', '#805ad5',
  '#e53e3e', '#dd6b20', '#d69e2e', '#38a169',
  '#d53f8c', '#ffffff',
]

export const STROKE_WIDTHS = [
  { value: 1, height: 1 },
  { value: 3, height: 2 },
  { value: 6, height: 3 },
]

export interface InkPreset {
  color: string
  width: number
  tool: 'pen' | 'highlighter'
}

export const DEFAULT_PRESETS: InkPreset[] = [
  { color: '#3182ce', width: 2, tool: 'pen' },
  { color: '#1a1a1a', width: 4, tool: 'pen' },
  { color: '#d69e2e', width: 8, tool: 'highlighter' },
]