import { describe, it, expect } from 'vitest'
import { joinTextItems, stripHtml, normalizeText } from './doc-text-extract.js'

// pdf.js-like items: str, x/y position, width, font height
const item = (str: string, x: number, y: number, width: number, extra: { hasEOL?: boolean; h?: number } = {}) =>
  ({ str, transform: [extra.h ?? 10, 0, 0, extra.h ?? 10, x, y], width, height: extra.h ?? 10, hasEOL: extra.hasEOL })

describe('joinTextItems', () => {
  it('never puts spaces between CJK characters, even across items and lines', () => {
    const items = [item('机器', 0, 100, 20), item('学习', 20, 100, 20, { hasEOL: true }), item('是一种', 0, 85, 30)]
    expect(joinTextItems(items)).toBe('机器学习是一种')
  })

  it('separates Latin words at gaps and line breaks, not inside a word split into runs', () => {
    const items = [item('Atten', 0, 100, 25), item('tion', 25, 100, 20), item('is', 50, 100, 10, { hasEOL: true }), item('all', 0, 85, 15)]
    expect(joinTextItems(items)).toBe('Attention is all')
  })

  it('keeps explicit whitespace items and collapses runs of spaces', () => {
    const items = [item('深度', 0, 100, 20), item(' ', 20, 100, 5), item('learning', 25, 100, 40), item('  ', 65, 100, 5), item('模型', 70, 100, 20)]
    expect(joinTextItems(items)).toBe('深度 learning 模型')
  })

  it('a new line without hasEOL still separates words', () => {
    expect(joinTextItems([item('end', 0, 100, 15), item('start', 0, 80, 25)])).toBe('end start')
  })
})

describe('stripHtml', () => {
  it('drops tags, scripts and inlined images, decodes entities', () => {
    expect(stripHtml('<p>a&amp;b <img src="data:image/png;base64,AAAA"> &#20013;文</p><script>x()</script>')).toBe('a&b 中文')
  })
})

describe('normalizeText', () => {
  it('turns radical look-alikes from PDF fonts into the real characters', () => {
    const cp = (...c: number[]) => String.fromCodePoint(...c)
    // ⼩样本 (Kangxi radical "small") and 第1⻚ (radical supplement "leaf")
    expect(normalizeText(cp(0x2f29) + '样本')).toBe('小样本')
    expect(normalizeText('第1' + cp(0x2eda))).toBe('第1页')
    expect(normalizeText(cp(0x2f12, 0x2f42))).toBe('力文')
  })
  it('folds full-width forms and ligatures', () => {
    expect(normalizeText('ＡＢＣ１２３ ﬁnd，好。')).toBe('ABC123 find，好。')
  })
})
