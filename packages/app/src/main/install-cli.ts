import { existsSync, symlinkSync, unlinkSync, readlinkSync, mkdirSync } from 'node:fs'
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

function trySymlink(cliSource: string, target: string): boolean {
  try {
    if (existsSync(target)) {
      const current = readlinkSync(target)
      if (current === cliSource) return true
      unlinkSync(target)
    }
    symlinkSync(cliSource, target)
    console.log(`CLI installed: ${target} -> ${cliSource}`)
    return true
  } catch {
    return false
  }
}

export async function installCli(): Promise<void> {
  if (process.platform !== 'darwin') return

  const cliSource = join(process.resourcesPath, 'cli', 'banjuan-cli')
  if (!existsSync(cliSource)) return

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

  // Last resort: ask for elevated permissions
  try {
    const target = SYMLINK_CANDIDATES[0]
    execSync(`osascript -e 'do shell script "ln -sf \\"${cliSource}\\" \\"${target}\\"" with administrator privileges'`)
    console.log(`CLI installed with admin privileges: ${target} -> ${cliSource}`)
  } catch {
    console.warn('CLI installation skipped: no suitable location found')
  }
}
