import { describe, it, expect } from 'vitest'
import { isSyncablePath, isExcluded, isDeviceLocalPath } from './exclusions.js'

describe('isSyncablePath', () => {
  it('accepts plain relative library paths', () => {
    for (const p of ['a.md', 'Notes/读书 笔记.md', '.banjuan/notes/x.json', '.banjuan/attachments/n1/img.png']) {
      expect(isSyncablePath(p)).toBe(true)
    }
  })
  it('rejects paths that escape the library or are not plain', () => {
    for (const p of ['', '/abs.md', '../x', 'a/../../x', './a', 'a//b', 'a/', 'a\\..\\b', 'C:/x', 'c:x', 'a\0b']) {
      expect(isSyncablePath(p)).toBe(false)
    }
  })
  it('rejects excluded and per-device paths whatever the case', () => {
    for (const p of ['.banjuan/plugins/x/index.js', '.banjuan/PLUGINS/x/index.js', '.banjuan/Plugins/x/manifest.json',
      '.banjuan/sync.json', '.banjuan/SYNC.json', '.banjuan/config.JSON', '.banjuan/paired-devices.json',
      '.banjuan/.trash/a', '.banjuan/.TRASH/a', '.banjuan/db.sqlite', '.banjuan/DB.SQLITE', 'x/.DS_Store', 'a.md.banjuan-tmp']) {
      expect(isSyncablePath(p)).toBe(false)
    }
  })
  it('exclusion and device-local checks ignore case', () => {
    expect(isExcluded('Plugins', true)).toBe(true)
    expect(isExcluded('.ds_store', false)).toBe(true)
    expect(isDeviceLocalPath('.BANJUAN/Sync.Json')).toBe(true)
  })
})
