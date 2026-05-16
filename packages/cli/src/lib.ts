import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import chalk from 'chalk'

const BANJUAN_DIR = join(homedir(), '.banjuan')
const PORT_FILE = join(BANJUAN_DIR, 'api-port')
const HISTORY_FILE = join(BANJUAN_DIR, 'library-history.json')

export function readLibraryHistory(): Array<{ path: string; name: string; lastOpened: string }> {
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function getApiPort(): number | null {
  try {
    return parseInt(readFileSync(PORT_FILE, 'utf-8').trim(), 10)
  } catch {
    return null
  }
}

function launchApp(): void {
  if (process.platform === 'darwin') {
    try {
      execSync('open -a 半卷', { stdio: 'ignore' })
    } catch {
      try {
        execSync('open -a Banjuan', { stdio: 'ignore' })
      } catch {
        console.error(chalk.red('✗ 无法启动半卷闲书'))
        console.error(chalk.gray('  请确保已安装桌面应用'))
        process.exit(1)
      }
    }
  } else {
    console.error(chalk.red('✗ 半卷闲书未运行'))
    console.error(chalk.gray('  请先启动桌面应用'))
    process.exit(1)
  }
}

async function waitForApp(timeoutMs = 15000): Promise<number> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const port = getApiPort()
    if (port) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/status`)
        if (res.ok) return port
      } catch {}
    }
    await new Promise(r => setTimeout(r, 500))
  }
  console.error(chalk.red('✗ 等待应用启动超时'))
  process.exit(1)
}

export async function ensureApp(): Promise<string> {
  const port = getApiPort()
  if (port) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`)
      if (res.ok) return `http://127.0.0.1:${port}`
    } catch {}
  }
  console.log(chalk.gray('正在启动半卷闲书...'))
  launchApp()
  const newPort = await waitForApp()
  return `http://127.0.0.1:${newPort}`
}

export function isAppRunning(): boolean {
  const port = getApiPort()
  if (!port) return false
  try {
    execSync(`curl -sf http://127.0.0.1:${port}/api/status`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

let cachedBaseUrl: string | null = null
let libraryOption: string | null = null

export function setLibraryOption(path: string): void {
  libraryOption = path
}

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl
  cachedBaseUrl = await ensureApp()
  return cachedBaseUrl
}

function appendLibrary(path: string): string {
  if (!libraryOption) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}library=${encodeURIComponent(libraryOption)}`
}

function handleError(status: number, body: string): never {
  if (status === 503) {
    console.error(chalk.red('✗ 尚未打开书房'))
    console.error(chalk.gray('  请运行 banjuan open <路径> 打开一个书房'))
    process.exit(1)
  }
  try {
    const parsed = JSON.parse(body)
    console.error(chalk.red(`✗ ${parsed.error ?? body}`))
  } catch {
    console.error(chalk.red(`✗ API ${status}: ${body}`))
  }
  process.exit(1)
}

export async function apiGet(path: string): Promise<any> {
  const base = await getBaseUrl()
  const res = await fetch(`${base}${appendLibrary(path)}`)
  if (!res.ok) handleError(res.status, await res.text())
  return res.json()
}

export async function apiPost(path: string, body?: unknown): Promise<any> {
  const base = await getBaseUrl()
  const res = await fetch(`${base}${appendLibrary(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) handleError(res.status, await res.text())
  return res.json()
}

export async function apiPut(path: string, body: unknown): Promise<any> {
  const base = await getBaseUrl()
  const res = await fetch(`${base}${appendLibrary(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) handleError(res.status, await res.text())
  return res.json()
}

export async function apiDelete(path: string): Promise<any> {
  const base = await getBaseUrl()
  const res = await fetch(`${base}${appendLibrary(path)}`, { method: 'DELETE' })
  if (!res.ok) handleError(res.status, await res.text())
  return res.json()
}
