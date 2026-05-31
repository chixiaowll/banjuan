import { describe, it, expect } from 'vitest'
import { parseDiscoveredService } from './discovery.js'

describe('parseDiscoveredService', () => {
  it('maps a service (lowercase txt + IPv4) to a NearbyShare', () => {
    expect(parseDiscoveredService({
      port: 51234,
      addresses: ['fe80::1', '192.168.1.20'],
      txt: { deviceid: 'DEV1', devicename: 'Mac', libraryid: 'LIB1', libraryname: 'My Room' },
    })).toEqual({
      deviceId: 'DEV1', deviceName: 'Mac', libraryName: 'My Room', libraryId: 'LIB1',
      url: 'http://192.168.1.20:51234',
    })
  })
  it('returns null without a deviceId', () => {
    expect(parseDiscoveredService({ port: 1, addresses: ['192.168.1.5'], txt: {} })).toBeNull()
  })
  it('returns null without an IPv4 address', () => {
    expect(parseDiscoveredService({ port: 1, addresses: ['fe80::1'], txt: { deviceid: 'X' } })).toBeNull()
  })
})
