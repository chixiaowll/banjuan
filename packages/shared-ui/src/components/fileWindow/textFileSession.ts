/**
 * Editing a Markdown / text file in place (single-file window): its bytes go
 * through this unchanged apart from the edits — UTF-8 with or without BOM, LF
 * or CRLF line endings — and it is saved a moment after typing stops, never
 * over a change made elsewhere without asking.
 */

export interface DecodedText {
  /** With LF line endings (what the editor works with). */
  text: string
  bom: boolean
  eol: '\n' | '\r\n'
  /** Set when the file can't be edited safely: not valid UTF-8. */
  readOnlyReason?: 'encoding'
}

const BOM = [0xef, 0xbb, 0xbf]

export function decodeTextFile(bytes: Uint8Array): DecodedText {
  const bom = bytes.length >= 3 && bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2]
  const body = bom ? bytes.subarray(3) : bytes
  let raw: string
  let readOnlyReason: DecodedText['readOnlyReason']
  try {
    raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body)
  } catch {
    raw = new TextDecoder('utf-8', { ignoreBOM: true }).decode(body)
    readOnlyReason = 'encoding'
  }
  const crlf = (raw.match(/\r\n/g) ?? []).length
  const lf = (raw.match(/(^|[^\r])\n/g) ?? []).length
  // Mixed endings come back as the more common one.
  const eol: DecodedText['eol'] = crlf > lf ? '\r\n' : '\n'
  return { text: raw.replace(/\r\n?/g, '\n'), bom, eol, readOnlyReason }
}

export function encodeTextFile(text: string, opts: Pick<DecodedText, 'bom' | 'eol'>): Uint8Array {
  const body = new TextEncoder().encode(opts.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text)
  if (!opts.bom) return body
  const out = new Uint8Array(body.length + 3)
  out.set(BOM, 0)
  out.set(body, 3)
  return out
}

export type SessionStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'gone' | 'readonly'

export interface SessionOptions {
  decoded: DecodedText
  /** Write the file's new bytes; resolves to its new stamp. Rejects with message FILE_GONE if it disappeared. */
  write: (bytes: Uint8Array) => Promise<{ stamp: string }>
  onStatus: (status: SessionStatus) => void
  /** Replace the editor's text (a change made elsewhere was loaded). */
  onReload: (text: string) => void
  /** Autosave this long after the last edit. */
  delay?: number
}

export class TextFileSession {
  status: SessionStatus
  private text: string
  private savedText: string
  private format: Pick<DecodedText, 'bom' | 'eol'>
  private timer: ReturnType<typeof setTimeout> | null = null
  private saving: Promise<void> | null = null
  private ownStamps = new Set<string>()
  private pendingOutside: Uint8Array | null = null

  constructor(private opts: SessionOptions) {
    this.text = opts.decoded.text
    this.savedText = opts.decoded.text
    this.format = { bom: opts.decoded.bom, eol: opts.decoded.eol }
    this.status = opts.decoded.readOnlyReason ? 'readonly' : 'saved'
  }

  get dirty(): boolean {
    return this.text !== this.savedText
  }

  setText(text: string): void {
    this.text = text
    if (this.status === 'readonly' || this.status === 'gone' || this.status === 'conflict') return
    if (this.status !== 'saving') this.setStatus(this.dirty ? 'dirty' : 'saved')
    this.schedule()
  }

  /** Save now (⌘S, closing). */
  async save(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.status === 'readonly' || this.status === 'gone' || this.status === 'conflict') return
    if (this.saving) { await this.saving; if (this.dirty) return this.save(); return }
    if (!this.dirty) { this.setStatus('saved'); return }
    const text = this.text
    this.setStatus('saving')
    this.saving = (async () => {
      try {
        const { stamp } = await this.opts.write(encodeTextFile(text, this.format))
        this.ownStamps.add(stamp)
        this.savedText = text
        this.setStatus(this.dirty ? 'dirty' : 'saved')
        if (this.dirty) this.schedule()
      } catch (e) {
        this.setStatus(/FILE_GONE/.test(String((e as Error)?.message ?? e)) ? 'gone' : 'error')
      } finally {
        this.saving = null
      }
    })()
    await this.saving
  }

  /** The file changed elsewhere, or went away. `read` gets its current bytes. */
  async external(e: { kind: 'changed'; stamp?: string } | { kind: 'gone' }, read: () => Promise<Uint8Array>): Promise<void> {
    if (e.kind === 'gone') {
      if (this.timer) { clearTimeout(this.timer); this.timer = null }
      if (this.status !== 'readonly') this.setStatus('gone')
      return
    }
    if (e.stamp && this.ownStamps.has(e.stamp)) return   // our own save
    if (this.saving) await this.saving
    const bytes = await read()
    if (this.dirty) {
      this.pendingOutside = bytes
      if (this.timer) { clearTimeout(this.timer); this.timer = null }
      this.setStatus('conflict')
      return
    }
    this.load(bytes)
  }

  /** After a conflict: keep this window's text (written over the other change), or load the other. */
  async resolveConflict(choice: 'mine' | 'theirs'): Promise<void> {
    const outside = this.pendingOutside
    this.pendingOutside = null
    if (choice === 'theirs' && outside) { this.load(outside); return }
    this.setStatus('dirty')
    await this.save()
  }

  private load(bytes: Uint8Array): void {
    const decoded = decodeTextFile(bytes)
    this.format = { bom: decoded.bom, eol: decoded.eol }
    this.text = decoded.text
    this.savedText = decoded.text
    this.opts.onReload(decoded.text)
    this.setStatus(decoded.readOnlyReason ? 'readonly' : 'saved')
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; void this.save() }, this.opts.delay ?? 1000)
  }

  private setStatus(status: SessionStatus): void {
    if (this.status === status) return
    this.status = status
    this.opts.onStatus(status)
  }
}
