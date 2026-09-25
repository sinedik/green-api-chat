import { describe, expect, it } from 'vitest'
import { parseRecipient, toCheckAccountQuery } from './recipient'

describe('parseRecipient', () => {
  it('номер телефона нормализуется', () => {
    expect(parseRecipient('8 (999) 123-45-67', 'max')).toEqual({ kind: 'phone', phone: '79991234567' })
  })

  it('в Telegram принимает @username', () => {
    expect(parseRecipient('@durov', 'telegram')).toEqual({ kind: 'username', username: '@durov' })
  })

  it('в MAX @username не поддерживается', () => {
    expect(() => parseRecipient('@durov', 'max')).toThrow(/международном формате/)
  })

  it('мусор — понятная ошибка с подсказкой про @username для Telegram', () => {
    expect(() => parseRecipient('abc', 'telegram')).toThrow(/@username/)
  })
})

describe('toCheckAccountQuery', () => {
  it('телефон → phoneNumber числом, username — как есть', () => {
    expect(toCheckAccountQuery({ kind: 'phone', phone: '79991234567' })).toEqual({ phoneNumber: 79991234567 })
    expect(toCheckAccountQuery({ kind: 'username', username: '@durov' })).toEqual({ username: '@durov' })
  })
})
