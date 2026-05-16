import { existsSync, symlinkSync, unlinkSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const SYMLINK_PATH = '/usr/local/bin/banjuan'

export async function installCli(): Promise<void> {
  if (process.platform !== 'darwin') return

  const cliSource = join(process.resourcesPath, 'cli', 'banjuan-cli')
  if (!existsSync(cliSource)) return

  try {
    if (existsSync(SYMLINK_PATH)) {
      const target = readlinkSync(SYMLINK_PATH)
      if (target === cliSource) return
      unlinkSync(SYMLINK_PATH)
    }
    symlinkSync(cliSource, SYMLINK_PATH)
    console.log(`CLI installed: ${SYMLINK_PATH} -> ${cliSource}`)
  } catch {
    // /usr/local/bin may require elevated permissions — silently skip
  }
}
