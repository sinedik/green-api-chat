import { describe, expect, it } from 'vitest'
import type { Message } from '../store/chatReducer'
import { canDelete, canEdit } from './messages'

const HOUR = 3_600_000
const NOW = 1_000 * HOUR

const msg = (overrides: Partial<Message> = {}): Message => ({
  id: 'real-1',
  chatId: '100',
  text: 'hi',
  direction: 'out',
  timestamp: NOW - HOUR,
  status: 'sent',
  ...overrides,
})

describe('canEdit', () => {
  it('своё отправленное текстовое сообщение — можно', () => {
    expect(canEdit(msg(), NOW)).toBe(true)
  })

  it('окно 48 часов', () => {
    expect(canEdit(msg({ timestamp: NOW - 48 * HOUR + 1 }), NOW)).toBe(true)
    expect(canEdit(msg({ timestamp: NOW - 48 * HOUR }), NOW)).toBe(false)
  })

  it('нельзя: входящее, медиа, ещё не отправленное, проваленное', () => {
    expect(canEdit(msg({ direction: 'in', status: undefined }), NOW)).toBe(false)
    expect(canEdit(msg({ media: 'Фото' }), NOW)).toBe(false)
    expect(canEdit(msg({ id: 'local-abc', status: 'pending' }), NOW)).toBe(false)
    expect(canEdit(msg({ status: 'failed' }), NOW)).toBe(false)
  })
})

describe('canDelete', () => {
  it('своё отправленное — можно, в том числе медиа и старое', () => {
    expect(canDelete(msg())).toBe(true)
    expect(canDelete(msg({ media: 'Фото', timestamp: 0 }))).toBe(true)
  })

  it('входящее и локальное — нельзя', () => {
    expect(canDelete(msg({ direction: 'in' }))).toBe(false)
    expect(canDelete(msg({ id: 'local-abc' }))).toBe(false)
  })
})
