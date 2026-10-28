import { describe, it, expect } from 'vitest'
import { parseHeadingLine, upsertSection } from '../src/notes/sections.js'

const t = (text: string, styles: Record<string, boolean> = {}) => ({ type: 'text', text, styles })
const h = (level: number, text: string, styles: Record<string, boolean> = {}) => ({ type: 'heading', props: { level }, content: [t(text, styles)], children: [] })
const p = (text: string) => ({ type: 'paragraph', content: [t(text)], children: [] })
const titles = (blocks: any[]) => blocks.map(b => (b.type === 'heading' ? '#'.repeat(b.props.level) + ' ' : '') + b.content.map((c: any) => c.text).join(''))

const DIARY = [h(1, '十月工作日记'), h(2, '20261027'), h(3, '1. 项目'), p('昨天'), h(2, '20261026'), p('前天')]

describe('parseHeadingLine', () => {
  it('reads a Markdown heading line', () => {
    expect(parseHeadingLine('## 20261028')).toEqual({ level: 2, text: '20261028' })
    expect(parseHeadingLine('  # 标题  ')).toEqual({ level: 1, text: '标题' })
    expect(parseHeadingLine('#### 深')).toEqual({ level: 3, text: '深' })   // the editor has three levels
    for (const bad of ['20261028', '##x', '', '## ']) expect(parseHeadingLine(bad)).toBeNull()
  })
})

describe('upsertSection', () => {
  const heading = { level: 2, text: '20261027' }

  it('replaces a section up to the next heading of its level or higher, sub-headings included', () => {
    expect(titles(upsertSection(DIARY, { heading, content: [p('新')], mode: 'replace' })))
      .toEqual(['# 十月工作日记', '## 20261027', '新', '## 20261026', '前天'])
  })

  it('appends to the end of the section', () => {
    expect(titles(upsertSection(DIARY, { heading, content: [p('新')], mode: 'append' })))
      .toEqual(['# 十月工作日记', '## 20261027', '### 1. 项目', '昨天', '新', '## 20261026', '前天'])
  })

  it('adds a missing section before the first one of its level (top) or at the end (bottom)', () => {
    const day = { level: 2, text: '20261028' }
    expect(titles(upsertSection(DIARY, { heading: day, content: [p('今天')], newAt: 'top' })))
      .toEqual(['# 十月工作日记', '## 20261028', '今天', '## 20261027', '### 1. 项目', '昨天', '## 20261026', '前天'])
    expect(titles(upsertSection(DIARY, { heading: day, content: [p('今天')], newAt: 'bottom' })).slice(-2)).toEqual(['## 20261028', '今天'])
    expect(titles(upsertSection([h(1, 'T'), p('intro')], { heading: day, content: [p('x')], newAt: 'top' })))
      .toEqual(['# T', 'intro', '## 20261028', 'x'])
  })

  it('matches the heading by its plain text, and leaves every other block as it was', () => {
    const styled = [h(1, 'T'), h(2, '20261027', { bold: true }), p('旧'), h(2, '其他')]
    const out = upsertSection(styled, { heading, content: [p('新')], mode: 'replace' })
    expect(titles(out)).toEqual(['# T', '## 20261027', '新', '## 其他'])
    expect(out[1]).toBe(styled[1])
    expect(out[3]).toBe(styled[3])
  })

  it('adds a missing section where it sorts among those of its level (dates newest first by default)', () => {
    const month = [h(1, '十月'), h(2, '20261028'), p('a'), h(2, '20261024'), h(3, '小节'), p('b'), h(2, '20261022'), p('c')]
    const put = (text: string, order?: 'asc' | 'desc') => titles(upsertSection(month, { heading: { level: 2, text }, content: [p('新')], newAt: 'sorted', order }))
    expect(put('20261023')).toEqual(['# 十月', '## 20261028', 'a', '## 20261024', '### 小节', 'b', '## 20261023', '新', '## 20261022', 'c'])
    expect(put('20261030').slice(0, 3)).toEqual(['# 十月', '## 20261030', '新'])
    expect(put('20261020').slice(-2)).toEqual(['## 20261020', '新'])
    const names = [h(1, 'T'), h(2, 'Alpha'), h(2, 'Gamma'), h(1, '附录'), p('x')]
    expect(titles(upsertSection(names, { heading: { level: 2, text: 'Beta' }, content: [], newAt: 'sorted' })))
      .toEqual(['# T', '## Alpha', '## Beta', '## Gamma', '# 附录', 'x'])
    expect(titles(upsertSection(names, { heading: { level: 2, text: 'Zeta' }, content: [], newAt: 'sorted' })))
      .toEqual(['# T', '## Alpha', '## Gamma', '## Zeta', '# 附录', 'x'])
    expect(titles(upsertSection(names, { heading: { level: 2, text: 'Beta' }, content: [], newAt: 'sorted', order: 'desc' })))
      .toEqual(['# T', '## Beta', '## Alpha', '## Gamma', '# 附录', 'x'])
  })
})
