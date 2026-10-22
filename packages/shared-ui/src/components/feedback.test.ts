import { describe, it, expect } from 'vitest'
import { errorMessage } from './feedback.js'

describe('errorMessage', () => {
  it('strips the Electron IPC wrapper and the fs syscall/path tail', () => {
    const e = new Error("Error invoking remote method 'notes:update': Error: EACCES: permission denied, open '/lib/.banjuan/notes/.a.json.1-x.banjuan-tmp'")
    expect(errorMessage(e)).toBe('EACCES: permission denied')
  })
  it('keeps ordinary messages as they are', () => {
    expect(errorMessage(new Error('Invalid PDF structure.'))).toBe('Invalid PDF structure.')
    expect(errorMessage('DUPLICATE_TITLE')).toBe('DUPLICATE_TITLE')
  })
})
