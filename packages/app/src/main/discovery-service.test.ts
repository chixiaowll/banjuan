import { describe, it, expect } from 'vitest'
import { parseNearbyService } from './discovery-service.js'

describe('parseNearbyService', () => {
  it('maps a bonjour service (lowercase txt keys + IPv4) to a NearbyShare', () => {
    const n = parseNearbyService({
      port: 51234,
      addresses: ['fe80::1', '192.168.1.20'],
      txt: { deviceid: 'DEV1', devicename: 'Mac', libraryid: 'LIB1', libraryname: 'My Room' },
    })
    expect(n).toEqual({
      deviceId: 'DEV1', deviceName: 'Mac', libraryName: 'My Room', libraryId: 'LIB1',
      url: 'http://192.168.1.20:51234',
    })
  })

  it('returns null when there is no deviceId', () => {
    expect(parseNearbyService({ port: 1, addresses: ['192.168.1.5'], txt: {} })).toBeNull()
  })

  it('returns null when there is no IPv4 address', () => {
    expect(parseNearbyService({ port: 1, addresses: ['fe80::1'], txt: { deviceid: 'X' } })).toBeNull()
  })
})
