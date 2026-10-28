import { describe, it, expect } from 'vitest'
import { contentToBlocks } from '../src/notes/migration.js'

describe('contentToBlocks', () => {
  it('takes BlockNote blocks as they are', () => {
    const blocks = [{ type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '小标题' }] }]
    expect(contentToBlocks(JSON.stringify(blocks))).toEqual(blocks)
    expect(contentToBlocks('[]')).toEqual([])
  })

  it('reads anything else as Markdown — also JSON that is not a list of blocks', () => {
    expect(contentToBlocks('## 小标题\n\n- 一')).toMatchObject([{ type: 'heading', props: { level: 2 } }, { type: 'bulletListItem' }])
    expect(contentToBlocks('[1, 2]')).toMatchObject([{ type: 'paragraph', content: [{ text: '[1, 2]' }] }])
    expect(contentToBlocks('"引号里的话"')).toMatchObject([{ type: 'paragraph' }])
    expect(contentToBlocks('42')).toMatchObject([{ type: 'paragraph' }])
  })
})
