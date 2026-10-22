import { COLORS, WIDTHS, FONT_SIZES, DEFAULT_STYLE, type ShapeStyle } from './shapes.js'

const KEY = 'banjuan-screenshot-style'

/** Last used colour / width / font size; anything unrecognised falls back to the default. */
export function loadStyle(): ShapeStyle {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && COLORS.includes(v.color) && WIDTHS.includes(v.width) && FONT_SIZES.includes(v.fontSize)) return v
  } catch { /* storage unavailable or corrupt */ }
  return DEFAULT_STYLE
}

export function saveStyle(s: ShapeStyle): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}
