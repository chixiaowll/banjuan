import { Library } from '@banjuan/core'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function openLibrary(opts: { library?: string }): Library {
  const libPath = resolve(opts.library ?? process.cwd())
  if (!existsSync(libPath)) {
    console.error(`Path does not exist: ${libPath}`)
    process.exit(1)
  }
  try {
    return Library.open(libPath)
  } catch (e: any) {
    console.error(e.message)
    process.exit(1)
  }
}
