import { describe, it, expect } from 'vitest'
import { parseLink } from '@banjuan/core'
import { pickLibrary } from './deep-link-target.js'

const lib = (rootPath: string, ids: string[] = []) => ({ rootPath, ids })
const has = async (l: { ids: string[] }, link: { id: string }) => l.ids.includes(link.id)
const real = (p: string) => p.replace(/\/link$/, '/real')   // a symlinked path and the folder it points to

describe('pickLibrary', () => {
  const open = [lib('/b', ['d2']), lib('/a/real', ['d1'])]

  it('takes the library a link names when it is a known (recent) one, by real path', async () => {
    const link = parseLink('banjuan://doc/d9?library=%2Fa%2Flink')!
    expect(await pickLibrary(link, { history: ['/a/real', '/c'], open, real, has })).toEqual({ path: '/a/real', lib: open[1] })
    const notOpen = parseLink('banjuan://note/n1?library=%2Fc')!
    expect(await pickLibrary(notOpen, { history: ['/a/real', '/c'], open, real, has })).toEqual({ path: '/c', lib: undefined })
  })

  it('never opens a library path the user has not opened before', async () => {
    const link = parseLink('banjuan://doc/zz?library=%2Fevil')!
    expect(await pickLibrary(link, { history: ['/a/real'], open, real, has })).toBeNull()
  })

  it('otherwise looks for the item in the open libraries', async () => {
    expect(await pickLibrary(parseLink('banjuan://doc/d1')!, { history: [], open, real, has })).toEqual({ path: '/a/real', lib: open[1] })
    expect(await pickLibrary(parseLink('banjuan://doc/d1?library=%2Fevil')!, { history: [], open, real, has })).toEqual({ path: '/a/real', lib: open[1] })
    expect(await pickLibrary(parseLink('banjuan://doc/nowhere')!, { history: [], open, real, has })).toBeNull()
  })
})
