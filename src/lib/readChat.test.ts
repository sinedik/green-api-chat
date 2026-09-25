import { describe, expect, it, vi } from 'vitest'
import type { Message } from '../store/chatReducer'
import { createChatReader, lastIncomingAt } from './readChat'

const msg = (timestamp: number, direction: Message['direction']): Message => ({
  id: `m${timestamp}`,
  chatId: '1',
  text: '',
  direction,
  timestamp,
})

describe('lastIncomingAt', () => {
  it('самое свежее входящее, исходящие не считаются', () => {
    expect(lastIncomingAt([msg(1, 'in'), msg(5, 'out'), msg(3, 'in')])).toBe(3)
  })

  it('без входящих — null', () => {
    expect(lastIncomingAt([msg(1, 'out')])).toBeNull()
    expect(lastIncomingAt([])).toBeNull()
  })
})

describe('createChatReader', () => {
  it('повторная отметка того же входящего не шлёт запрос', () => {
    const read = vi.fn(async () => {})
    const markRead = createChatReader(read)
    markRead('1', 100)
    markRead('1', 100)
    markRead('1', 50)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('новое входящее — новый запрос; чаты независимы', () => {
    const read = vi.fn(async () => {})
    const markRead = createChatReader(read)
    markRead('1', 100)
    markRead('1', 200)
    markRead('2', 100)
    expect(read.mock.calls).toEqual([['1'], ['1'], ['2']])
  })

  it('после ошибки отметка откатывается и запрос можно повторить', async () => {
    const read = vi.fn<(chatId: string) => Promise<void>>().mockRejectedValueOnce(new Error('429'))
    read.mockResolvedValue(undefined)
    const markRead = createChatReader(read)
    markRead('1', 100)
    await Promise.resolve()
    await Promise.resolve()
    markRead('1', 100)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('ошибка старого запроса не откатывает более свежую отметку', async () => {
    let fail: (e: Error) => void = () => {}
    const read = vi
      .fn<(chatId: string) => Promise<void>>()
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockResolvedValue(undefined)
    const markRead = createChatReader(read)
    markRead('1', 100)
    markRead('1', 200)
    fail(new Error('network'))
    await Promise.resolve()
    await Promise.resolve()
    markRead('1', 200)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
