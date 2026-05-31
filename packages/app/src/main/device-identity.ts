import { join } from 'node:path'
import { homedir, hostname } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export interface DeviceIdentity {
  deviceId: string
  deviceName: string
}

// Stable per-install identity, stored device-global at ~/.banjuan/device.json.
export function getDeviceIdentity(): DeviceIdentity {
  const dir = join(homedir(), '.banjuan')
  const path = join(dir, 'device.json')
  try {
    const d = JSON.parse(readFileSync(path, 'utf-8'))
    if (d && typeof d.deviceId === 'string' && d.deviceId) return d
  } catch { /* missing/corrupt — recreate below */ }
  const identity: DeviceIdentity = { deviceId: randomUUID().replace(/-/g, ''), deviceName: hostname() }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(identity, null, 2))
  return identity
}
