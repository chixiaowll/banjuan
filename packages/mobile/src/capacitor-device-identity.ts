import { Preferences } from '@capacitor/preferences'
import { Device } from '@capacitor/device'

export interface DeviceIdentity {
  deviceId: string
  deviceName: string
}

const KEY = 'banjuan.device'

/** Stable per-install identity, persisted via Capacitor Preferences. */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const { value } = await Preferences.get({ key: KEY })
  if (value) {
    try {
      const d = JSON.parse(value)
      if (d && typeof d.deviceId === 'string' && d.deviceId) return d
    } catch { /* corrupt — recreate */ }
  }
  let deviceName = 'iPad'
  try {
    const info = await Device.getInfo()
    deviceName = info.name || info.model || 'iPad'
  } catch { /* default */ }
  const identity: DeviceIdentity = {
    deviceId: crypto.randomUUID().replace(/-/g, ''),
    deviceName,
  }
  await Preferences.set({ key: KEY, value: JSON.stringify(identity) })
  return identity
}
