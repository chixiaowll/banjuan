import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Library } from '@banjuan/core'
import { saveClip } from './clip-service.js'

let server: ReturnType<typeof createServer> | null = null
let portFilePath = ''
let libraryGetter: () => Library | null = () => null

export function setLibraryGetter(getter: () => Library | null): void {
  libraryGetter = getter
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    json(res, 204, null)
    return
  }

  const url = req.url ?? ''

  if (url === '/api/status' && req.method === 'GET') {
    const lib = libraryGetter()
    json(res, 200, {
      status: 'ok',
      libraryOpen: lib !== null,
      libraryPath: lib?.rootPath ?? null,
    })
    return
  }

  if (url === '/api/clip' && req.method === 'POST') {
    const lib = libraryGetter()
    if (!lib) {
      json(res, 503, { error: '书房未打开' })
      return
    }
    try {
      const body = JSON.parse(await readBody(req))
      const result = await saveClip(lib, body)
      json(res, 200, { status: 'ok', ...result })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  json(res, 404, { error: 'Not found' })
}

export function startApiServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res).catch(() => {
        json(res, 500, { error: 'Internal error' })
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start API server'))
        return
      }
      const port = addr.port

      const banjuanDir = join(homedir(), '.banjuan')
      mkdirSync(banjuanDir, { recursive: true })
      portFilePath = join(banjuanDir, 'api-port')
      writeFileSync(portFilePath, String(port), 'utf-8')

      console.log(`API server listening on http://127.0.0.1:${port}`)
      resolve(port)
    })

    server.on('error', reject)
  })
}

export function stopApiServer(): void {
  if (server) {
    server.close()
    server = null
  }
  if (portFilePath && existsSync(portFilePath)) {
    unlinkSync(portFilePath)
  }
}
