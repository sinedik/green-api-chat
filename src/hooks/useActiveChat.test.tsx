// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GreenApiClient } from '../api/client'
import type { ContactInfo, HistoryMessage } from '../api/types'
import { createChatReader } from '../lib/readChat'
import { initialChatState, type Chat, type ChatState } from '../store/chatReducer'
import { useActiveChat } from './useActiveChat'

afterEach(cleanup)

const chat = (patch: Partial<Chat> = {}): Chat => ({
  id: '100',
  messages: [{ id: 'a', chatId: '100', text: 'hi', direction: 'in', timestamp: 1000 }],
  unread: 0,
  updatedAt: 1000,
  type: 'user',
  ...patch,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(history: HistoryMessage[] = []) {
  const contact = deferred<ContactInfo>()
  const client = {
    getChatHistory: vi.fn(async () => history),
    getContactInfo: vi.fn(() => contact.promise),
    getAvatar: vi.fn(async () => ({ urlAvatar: 'x' })),
    readChat: vi.fn(async (_chatId: string) => {}),
  }
  const state: ChatState = { ...initialChatState, chats: { '100': chat() }, activeChatId: '100' }
  const stateRef = { current: state }
  const readChat = createChatReader((chatId) => client.readChat(chatId))
  const hook = renderHook(() =>
    useActiveChat({
      client: client as unknown as GreenApiClient,
      dispatch: () => {},
      stateRef,
      activeChatId: '100',
      readChat,
    }),
  )
  return { client, contact, hook }
}

describe('useActiveChat', () => {
  it('пока getContactInfo в пути, getAvatar не запрашивается', async () => {
    const { client, hook } = setup()
    await act(async () => hook.result.current.ensureAvatar('100'))
    expect(client.getContactInfo).toHaveBeenCalledTimes(1)
    expect(client.getAvatar).not.toHaveBeenCalled()
  })

  it('getContactInfo упал — аватар запрашивается отдельно', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, contact } = setup()
    await act(async () => contact.reject(new Error('400')))
    expect(client.getAvatar).toHaveBeenCalledTimes(1)
  })

  it('readChat один раз, если история не принесла новых входящих', async () => {
    const history = [
      { type: 'incoming', idMessage: 'a', timestamp: 1, chatId: '100', typeMessage: 'textMessage', textMessage: 'hi' },
    ] as HistoryMessage[]
    const { client } = setup(history)
    await act(async () => {})
    expect(client.getChatHistory).toHaveBeenCalledTimes(1)
    expect(client.readChat).toHaveBeenCalledTimes(1)
  })

  it('история с более свежим входящим — ещё один readChat', async () => {
    const history = [
      { type: 'incoming', idMessage: 'b', timestamp: 5, chatId: '100', typeMessage: 'textMessage', textMessage: 'new' },
    ] as HistoryMessage[]
    const { client } = setup(history)
    await act(async () => {})
    expect(client.readChat).toHaveBeenCalledTimes(2)
  })
})
