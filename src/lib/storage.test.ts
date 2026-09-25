import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Credentials } from '../api/types'
import { initialChatState, type Chat, type ChatState, type Message } from '../store/chatReducer'
import { MemoryStorage } from '../test/memoryStorage'
import {
  clearChats,
  clearCredentials,
  CREDENTIALS_KEY,
  loadChats,
  loadCredentials,
  loadPreviewsAt,
  saveChats,
  saveCredentials,
  savePreviewsAt,
} from './storage'

const KEY = 'green-chat:chats:123'

let local: MemoryStorage
let session: MemoryStorage

beforeEach(() => {
  local = new MemoryStorage()
  session = new MemoryStorage()
  vi.stubGlobal('localStorage', local)
  vi.stubGlobal('sessionStorage', session)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const message = (i: number, overrides: Partial<Message> = {}): Message => ({
  id: `m${i}`,
  chatId: '100',
  text: `текст ${i}`,
  direction: 'out',
  timestamp: i,
  status: 'sent',
  ...overrides,
})

const chat = (overrides: Partial<Chat> = {}): Chat => ({ id: '100', messages: [], unread: 0, updatedAt: 0, ...overrides })

describe('loadChats', () => {
  it('без сохранённых данных возвращает начальное состояние', () => {
    expect(loadChats('123')).toBe(initialChatState)
  })

  it('битый JSON → начальное состояние', () => {
    local.setItem(KEY, '{not json')
    expect(loadChats('123')).toBe(initialChatState)
  })

  it('данные без chats → начальное состояние', () => {
    local.setItem(KEY, JSON.stringify({ chats: 'строка' }))
    expect(loadChats('123')).toBe(initialChatState)
  })

  it('мигрирует @username из title и прерванные отправки в failed', () => {
    local.setItem(
      KEY,
      JSON.stringify({
        chats: {
          '100': chat({ title: '@ivan', messages: [message(1, { status: 'pending' }), message(2)] }),
          '200': chat({ id: '200', title: '@old', username: 'new' }),
        },
      }),
    )
    const state = loadChats('123')
    expect(state.activeChatId).toBeNull()
    expect(state.orphanStatuses).toEqual({})
    expect(state.chats['100']).toMatchObject({ title: undefined, username: '@ivan' })
    expect(state.chats['100'].messages[0]).toMatchObject({ status: 'failed', error: 'Отправка прервана' })
    expect(state.chats['100'].messages[1]).toMatchObject({ status: 'sent' })
    expect(state.chats['200']).toMatchObject({ title: '@old', username: 'new' })
  })

  it('чат без messages получает пустой массив', () => {
    local.setItem(KEY, JSON.stringify({ chats: { '100': { id: '100', unread: 0, updatedAt: 0 } } }))
    expect(loadChats('123').chats['100'].messages).toEqual([])
  })
})

describe('saveChats', () => {
  it('сохраняет чаты без activeChatId и orphanStatuses', () => {
    const state: ChatState = { chats: { '100': chat() }, activeChatId: '100', orphanStatuses: { x: 'read' } }
    saveChats('123', state)
    expect(JSON.parse(local.getItem(KEY) ?? '')).toEqual({ chats: { '100': chat() } })
    clearChats('123')
    expect(local.getItem(KEY)).toBeNull()
  })

  it('при QuotaExceededError сохраняет по 50 последних сообщений на чат', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const original = local.setItem.bind(local)
    const setItem = vi
      .spyOn(local, 'setItem')
      .mockImplementationOnce(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })
      .mockImplementation(original)

    const messages = Array.from({ length: 120 }, (_, i) => message(i))
    saveChats('123', { ...initialChatState, chats: { '100': chat({ messages }), '200': chat({ id: '200' }) } })

    expect(setItem).toHaveBeenCalledTimes(2)
    const saved = JSON.parse(local.getItem(KEY) ?? '') as { chats: Record<string, Chat> }
    expect(saved.chats['100'].messages).toHaveLength(50)
    expect(saved.chats['100'].messages[0].id).toBe('m70')
    expect(saved.chats['200'].messages).toEqual([])
  })

  it('если не влезло и урезанное — не падает', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(local, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => saveChats('123', { ...initialChatState, chats: { '100': chat() } })).not.toThrow()
  })
})

describe('credentials', () => {
  const credentials: Credentials = { idInstance: '1101', apiTokenInstance: 'token', apiUrl: 'https://api' }

  it('remember: true — в localStorage', () => {
    saveCredentials(credentials, true)
    expect(local.getItem(CREDENTIALS_KEY)).not.toBeNull()
    expect(session.getItem(CREDENTIALS_KEY)).toBeNull()
    expect(loadCredentials()).toEqual(credentials)
  })

  it('remember: false — в sessionStorage', () => {
    saveCredentials(credentials, false)
    expect(local.getItem(CREDENTIALS_KEY)).toBeNull()
    expect(loadCredentials()).toEqual(credentials)
  })

  it('clearCredentials чистит оба хранилища', () => {
    saveCredentials(credentials, true)
    saveCredentials({ ...credentials, idInstance: '2' }, false)
    clearCredentials()
    expect(loadCredentials()).toBeNull()
  })

  it('недоступное хранилище не роняет приложение', () => {
    vi.spyOn(local, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(local, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadCredentials()).toBeNull()
    expect(() => clearCredentials()).not.toThrow()
  })
})

describe('previewsAt', () => {
  it('сохраняется по инстансу и удаляется вместе с историей', () => {
    expect(loadPreviewsAt('123')).toBeNull()
    savePreviewsAt('123', 1000)
    expect(loadPreviewsAt('123')).toBe(1000)
    expect(loadPreviewsAt('456')).toBeNull()
    clearChats('123')
    expect(loadPreviewsAt('123')).toBeNull()
  })

  it('мусор в хранилище — null', () => {
    local.setItem('green-chat:previews:123', '"abc"')
    expect(loadPreviewsAt('123')).toBeNull()
  })
})
