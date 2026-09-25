import { describe, expect, it } from 'vitest'
import { detectMessenger, parseUsername } from './messenger'

describe('detectMessenger', () => {
  it('определяет тип инстанса по typeInstance', () => {
    expect(detectMessenger('v3')).toBe('max')
    expect(detectMessenger('telegram')).toBe('telegram')
    expect(detectMessenger('whatsapp')).toBeNull()
  })
})

describe('parseUsername', () => {
  it.each([
    ['@durov', '@durov'],
    ['durov_bot', '@durov_bot'],
  ])('%s → %s', (input, expected) => {
    expect(parseUsername(input)).toBe(expected)
  })

  it.each(['+79991234567', '@abc', '@1user', ''])('отклоняет "%s"', (input) => {
    expect(parseUsername(input)).toBeNull()
  })
})
