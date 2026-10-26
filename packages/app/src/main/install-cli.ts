import { existsSync, symlinkSync, unlinkSync, readlinkSync, mkdirSync, lstatSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { app } from 'electron'

const SYMLINK_CANDIDATES = [
  '/opt/homebrew/bin/banjuan',
  '/usr/local/bin/banjuan',
]

function getLocalBinPath(): string {
  return join(process.env.HOME || '', '.local', 'bin', 'banjuan')
}

export function trySymlink(cliSource: string, target: string): boolean {
  try {
    // lstat, not exists: existsSync follows the link, so a dangling one (left by
    // an older install) looked absent, symlinkSync then failed on it, and every
    // launch fell through to the administrator prompt.
    let link: ReturnType<typeof lstatSync> | null = null
    try { link = lstatSync(target) } catch { /* nothing there */ }
    if (link) {
      if (!link.isSymbolicLink()) return false   // someone else's `banjuan`: leave it alone
      if (readlinkSync(target) === cliSource) return true
      unlinkSync(target)
    }
    symlinkSync(cliSource, target)
    console.log(`CLI installed: ${target} -> ${cliSource}`)
    return true
  } catch {
    return false
  }
}

// Asked for an administrator password once (whatever the answer): never again.
const ADMIN_ASKED_FILE = join(process.env.HOME || '', '.banjuan', 'cli-admin-asked')

export async function installCli(): Promise<void> {
  if (process.platform !== 'darwin') return

  const cliSource = join(process.resourcesPath, 'cli', 'banjuan-cli')
  if (!existsSync(cliSource)) return
  // Running from a disk image or a translocated copy: that path goes away.
  if (cliSource.includes('/AppTranslocation/') || cliSource.startsWith('/Volumes/')) return

  for (const candidate of SYMLINK_CANDIDATES) {
    if (trySymlink(cliSource, candidate)) return
  }

  const localBin = getLocalBinPath()
  const localBinDir = join(process.env.HOME || '', '.local', 'bin')
  mkdirSync(localBinDir, { recursive: true })
  if (trySymlink(cliSource, localBin)) {
    const shell = process.env.SHELL || '/bin/zsh'
    const rcFile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc'
    console.log(`CLI installed to ${localBin}. Add ~/.local/bin to PATH if not already: export PATH="$HOME/.local/bin:$PATH" in ${rcFile}`)
    return
  }

  // Last resort: ask for elevated permissions — once.
  if (existsSync(ADMIN_ASKED_FILE)) return
  try {
    mkdirSync(join(process.env.HOME || '', '.banjuan'), { recursive: true })
    writeFileSync(ADMIN_ASKED_FILE, new Date().toISOString())
  } catch { /* still ask this once */ }
  try {
    const target = SYMLINK_CANDIDATES[0]
    execSync(`osascript -e 'do shell script "ln -sf \\"${cliSource}\\" \\"${target}\\"" with administrator privileges'`)
    console.log(`CLI installed with admin privileges: ${target} -> ${cliSource}`)
  } catch {
    console.warn('CLI installation skipped: no suitable location found')
  }
}
