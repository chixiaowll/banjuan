/**
 * Electron accelerator helpers for recording and displaying a global hotkey.
 * See https://www.electronjs.org/docs/latest/api/accelerator
 */

export interface KeyLike {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const CODE_TO_KEY: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
}

/** Accelerator key name for a KeyboardEvent.code, or null if it is a modifier / unsupported. */
function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return CODE_TO_KEY[code] ?? null
}

/**
 * Build an accelerator from a keydown. Uses the physical `code` (Option+A types
 * "å" on macOS). Returns null while only modifiers are held, for keys that
 * can't be expressed, and for combos without Cmd/Ctrl/Alt — a global hotkey on
 * a bare or Shift-only key would swallow normal typing. F-keys are allowed alone.
 */
export function acceleratorFromKeyEvent(e: KeyLike, isMac: boolean): string | null {
  const name = keyName(e.code)
  if (!name) return null
  const isFnKey = /^F\d+$/.test(name)
  if (!isFnKey && !e.metaKey && !e.ctrlKey && !e.altKey) return null
  const parts: string[] = []
  if (e.metaKey) parts.push(isMac ? 'Command' : 'Super')
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(name)
  return parts.join('+')
}

const MAC_SYMBOLS: Array<[string[], string]> = [
  [['Control', 'Ctrl'], '⌃'],
  [['Alt', 'Option', 'AltGr'], '⌥'],
  [['Shift'], '⇧'],
  [['Command', 'Cmd', 'CommandOrControl', 'CmdOrCtrl', 'Super', 'Meta'], '⌘'],
]

const WORDS: Record<string, string> = {
  Control: 'Ctrl', CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Command: 'Cmd', Cmd: 'Cmd',
  Super: 'Win', Meta: 'Win', Option: 'Alt',
}

/** Human-readable accelerator: "⌃⇧A" on macOS, "Ctrl+Shift+A" elsewhere. */
export function formatAccelerator(accel: string, isMac: boolean): string {
  const parts = accel.split('+').filter(Boolean)
  const key = parts.pop() ?? ''
  if (isMac) {
    const symbols = MAC_SYMBOLS.filter(([names]) => parts.some(p => names.includes(p))).map(([, s]) => s)
    return symbols.join('') + key
  }
  return [...parts.map(p => WORDS[p] ?? p), key].join('+')
}
