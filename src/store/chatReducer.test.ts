import { describe, expect, it } from 'vitest'
import {
  chatReducer,
  initialChatState,
  MAX_MESSAGES_PER_CHAT,
  sortedChats,
  totalUnread,
  type ChatState,
  type Message,
} from './chatReducer'

const CHAT = { id: '100', phone: '79991234567' }

const msg = (overrides: Partial<Message>): Message => ({
  id: 'm1',
  chatId: CHAT.id,
  text: 'hi',
  direction: 'in',
  timestamp: 1000,
  ...overrides,
})

function openChat(): ChatState {
  return chatReducer(initialChatState, { type: 'chatOpened', chat: CHAT })
}

describe('chatReducer', () => {
  it('создаёт чат и делает его активным', () => {
    const state = openChat()
    expect(state.activeChatId).toBe('100')
    expect(state.chats['100']).toMatchObject({ phone: '79991234567', messages: [], unread: 0 })
  })

  it('входящее в неактивный чат создаёт его и увеличивает unread', () => {
    const state = chatReducer(initialChatState, {
      type: 'messageReceived',
      message: msg({ chatId: '200' }),
      chat: { id: '200', title: 'Новый' },
    })
    expect(state.chats['200']).toMatchObject({ title: 'Новый', unread: 1 })
  })

  it('не дублирует повторно доставленное уведомление', () => {
    let state = openChat()
    const action = { type: 'messageReceived' as const, message: msg({}), chat: CHAT }
    state = chatReducer(state, action)
    state = chatReducer(state, action)
    expect(state.chats['100'].messages).toHaveLength(1)
  })

  it('pending → sent после ответа sendMessage', () => {
    let state = openChat()
    state = chatReducer(state, {
      type: 'messageQueued',
      message: msg({ id: 'local-1', direction: 'out', status: 'pending' }),
    })
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'local-1', id: 'real-1' })
    expect(state.chats['100'].messages).toEqual([
      expect.objectContaining({ id: 'real-1', localId: 'local-1', status: 'sent' }),
    ])
  })

  it('эхо outgoingAPIMessageReceived раньше ответа sendMessage не создаёт дубль', () => {
    let state = openChat()
    state = chatReducer(state, {
      type: 'messageQueued',
      message: msg({ id: 'local-1', direction: 'out', status: 'pending' }),
    })
    state = chatReducer(state, {
      type: 'messageReceived',
      message: msg({ id: 'real-1', direction: 'out', status: 'sent' }),
      chat: CHAT,
    })
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'local-1', id: 'real-1' })
    expect(state.chats['100'].messages.map((m) => m.id)).toEqual(['real-1'])
  })

  it('статус не откатывается назад: read не перезаписывается delivered', () => {
    let state = openChat()
    state = chatReducer(state, { type: 'messageReceived', message: msg({ direction: 'out', status: 'sent' }), chat: CHAT })
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'm1', status: 'read' })
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'm1', status: 'delivered' })
    expect(state.chats['100'].messages[0].status).toBe('read')
  })

  it('держит сообщения отсортированными по времени', () => {
    let state = openChat()
    state = chatReducer(state, { type: 'messageReceived', message: msg({ id: 'b', timestamp: 2000 }), chat: CHAT })
    state = chatReducer(state, { type: 'messageReceived', message: msg({ id: 'a', timestamp: 1000 }), chat: CHAT })
    expect(state.chats['100'].messages.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

const queued = (state: ChatState, id = 'local-1', timestamp = 1000) =>
  chatReducer(state, {
    type: 'messageQueued',
    message: msg({ id, localId: id, direction: 'out', status: 'pending', timestamp }),
  })

describe('chatReducer: статусы и отправка', () => {
  it('статус, пришедший раньше messageSent, применяется при messageSent', () => {
    let state = queued(openChat())
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'real-1', status: 'delivered' })
    expect(state.orphanStatuses).toEqual({ 'real-1': 'delivered' })
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'local-1', id: 'real-1' })
    expect(state.chats['100'].messages[0]).toMatchObject({ id: 'real-1', status: 'delivered' })
    expect(state.orphanStatuses).toEqual({})
  })

  it('orphan-статус применяется и к эху outgoingAPIMessageReceived', () => {
    let state = openChat()
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'real-1', status: 'read' })
    state = chatReducer(state, {
      type: 'messageReceived',
      message: msg({ id: 'real-1', direction: 'out', status: 'sent' }),
      chat: CHAT,
    })
    expect(state.chats['100'].messages[0].status).toBe('read')
    expect(state.orphanStatuses).toEqual({})
  })

  it('orphan-статусов хранится не больше 100, старые вытесняются', () => {
    let state = openChat()
    for (let i = 0; i < 150; i++) {
      state = chatReducer(state, { type: 'statusUpdated', chatId: '999', messageId: `x${i}`, status: 'sent' })
    }
    const keys = Object.keys(state.orphanStatuses)
    expect(keys).toHaveLength(100)
    expect(keys[0]).toBe('x50')
    expect(keys.at(-1)).toBe('x149')
  })

  it('orphan-статус не откатывается назад: read не перезаписывается delivered', () => {
    let state = queued(openChat())
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'real-1', status: 'read' })
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'real-1', status: 'delivered' })
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'local-1', id: 'real-1' })
    expect(state.chats['100'].messages[0].status).toBe('read')
  })

  it('эхо до messageSent получает localId, локальный дубль удаляется', () => {
    let state = queued(openChat())
    state = chatReducer(state, {
      type: 'messageReceived',
      message: msg({ id: 'real-1', direction: 'out', status: 'sent', timestamp: 1001 }),
      chat: CHAT,
    })
    expect(state.chats['100'].messages).toHaveLength(2)
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'local-1', id: 'real-1' })
    expect(state.chats['100'].messages).toEqual([
      expect.objectContaining({ id: 'real-1', localId: 'local-1', status: 'sent', timestamp: 1001 }),
    ])
  })

  it('повтор после failed из вебхука сохраняет исходный localId', () => {
    let state = queued(openChat())
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'local-1', id: 'real-1' })
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'real-1', status: 'failed' })
    expect(state.chats['100'].messages[0].status).toBe('failed')

    state = chatReducer(state, { type: 'messageRetried', chatId: '100', localId: 'real-1' })
    expect(state.chats['100'].messages[0].status).toBe('pending')
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'real-1', id: 'real-2' })
    expect(state.chats['100'].messages).toEqual([
      expect.objectContaining({ id: 'real-2', localId: 'local-1', status: 'sent', error: undefined }),
    ])
  })

  it('messageFailed → failed с ошибкой, messageRetried → pending без ошибки', () => {
    let state = queued(openChat())
    state = chatReducer(state, { type: 'messageFailed', chatId: '100', localId: 'local-1', error: 'сеть' })
    expect(state.chats['100'].messages[0]).toMatchObject({ status: 'failed', error: 'сеть' })
    state = chatReducer(state, { type: 'messageRetried', chatId: '100', localId: 'local-1' })
    expect(state.chats['100'].messages[0]).toMatchObject({ status: 'pending', error: undefined })
  })

  it('messageRetried не трогает не проваленные сообщения', () => {
    let state = queued(openChat())
    state = chatReducer(state, { type: 'messageSent', chatId: '100', localId: 'local-1', id: 'real-1' })
    const before = state.chats['100'].messages[0]
    state = chatReducer(state, { type: 'messageRetried', chatId: '100', localId: 'real-1' })
    expect(state.chats['100'].messages[0]).toEqual(before)
  })

  it('failed сменяется delivered из вебхука, но не pending', () => {
    let state = openChat()
    state = chatReducer(state, { type: 'messageReceived', message: msg({ direction: 'out', status: 'failed' }), chat: CHAT })
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'm1', status: 'pending' })
    expect(state.chats['100'].messages[0].status).toBe('failed')
    state = chatReducer(state, { type: 'statusUpdated', chatId: '100', messageId: 'm1', status: 'delivered' })
    expect(state.chats['100'].messages[0].status).toBe('delivered')
  })
})

describe('chatReducer: непрочитанные и чаты', () => {
  it('входящее в активный чат не увеличивает unread, если вкладка видима', () => {
    const state = chatReducer(openChat(), { type: 'messageReceived', message: msg({}), chat: CHAT })
    expect(state.chats['100'].unread).toBe(0)
  })

  it('входящее в активный чат при скрытой вкладке увеличивает unread, chatRead сбрасывает', () => {
    let state = chatReducer(openChat(), { type: 'messageReceived', message: msg({}), chat: CHAT, hidden: true })
    expect(state.chats['100'].unread).toBe(1)
    state = chatReducer(state, { type: 'chatRead', chatId: '100' })
    expect(state.chats['100'].unread).toBe(0)
  })

  it('chatRead без непрочитанных возвращает тот же state', () => {
    const state = openChat()
    expect(chatReducer(state, { type: 'chatRead', chatId: '100' })).toBe(state)
  })

  it('исходящее не увеличивает unread', () => {
    const state = chatReducer(initialChatState, {
      type: 'messageReceived',
      message: msg({ chatId: '200', direction: 'out', status: 'sent' }),
      chat: { id: '200' },
    })
    expect(state.chats['200'].unread).toBe(0)
  })

  it('удалённый чат пересоздаётся новым входящим с unread 1', () => {
    let state = chatReducer(openChat(), { type: 'messageReceived', message: msg({}), chat: CHAT })
    state = chatReducer(state, { type: 'chatDeleted', chatId: '100' })
    expect(state.chats['100']).toBeUndefined()
    expect(state.activeChatId).toBeNull()
    state = chatReducer(state, { type: 'messageReceived', message: msg({ id: 'm2', timestamp: 5000 }), chat: CHAT })
    expect(state.chats['100']).toMatchObject({ unread: 1, updatedAt: 5000 })
    expect(state.chats['100'].messages.map((m) => m.id)).toEqual(['m2'])
  })

  it('chatDeleted неактивного чата не сбрасывает activeChatId', () => {
    let state = chatReducer(openChat(), { type: 'chatOpened', chat: { id: '200' }, select: false })
    state = chatReducer(state, { type: 'chatDeleted', chatId: '200' })
    expect(state.activeChatId).toBe('100')
  })

  it('chatOpened с select:false создаёт чат, но не меняет activeChatId', () => {
    const state = chatReducer(openChat(), { type: 'chatOpened', chat: { id: '200', title: 'Б' }, select: false })
    expect(state.activeChatId).toBe('100')
    expect(state.chats['200']).toMatchObject({ title: 'Б', unread: 0, messages: [] })
  })

  it('chatOpened не затирает известные данные чата менее точными', () => {
    let state = chatReducer(initialChatState, { type: 'chatOpened', chat: { id: '100', title: 'Иван', phone: '7999' } })
    state = chatReducer(state, { type: 'chatOpened', chat: { id: '100', title: 'Другое', username: '@ivan' } })
    expect(state.chats['100']).toMatchObject({ title: 'Иван', phone: '7999', username: '@ivan' })
  })

  it('chatSelected сбрасывает unread, null снимает выбор, неизвестный id игнорируется', () => {
    let state = chatReducer(initialChatState, { type: 'messageReceived', message: msg({}), chat: CHAT })
    state = chatReducer(state, { type: 'chatSelected', chatId: '100' })
    expect(state).toMatchObject({ activeChatId: '100', chats: { '100': { unread: 0 } } })
    expect(chatReducer(state, { type: 'chatSelected', chatId: 'nope' })).toBe(state)
    expect(chatReducer(state, { type: 'chatSelected', chatId: null }).activeChatId).toBeNull()
  })

  it('chatUpdated применяет только заданные поля', () => {
    let state = chatReducer(initialChatState, { type: 'chatOpened', chat: { id: '100', title: 'Иван' } })
    state = chatReducer(state, {
      type: 'chatUpdated',
      chatId: '100',
      patch: { title: '', avatar: 'a.jpg', lastSeen: undefined },
    })
    expect(state.chats['100']).toMatchObject({ title: 'Иван', avatar: 'a.jpg' })
    expect(chatReducer(state, { type: 'chatUpdated', chatId: 'nope', patch: { title: 'x' } })).toBe(state)
  })
})

describe('chatReducer: chatsSynced', () => {
  it('импортирует новые чаты с rank и synced, обновляет мету существующих', () => {
    let state = chatReducer(initialChatState, { type: 'chatOpened', chat: { id: '100', title: 'Старое' } })
    state = chatReducer(state, {
      type: 'chatsSynced',
      chats: [
        { id: '200', title: 'Новый' },
        { id: '100', title: 'Новое', username: '' },
      ],
    })
    expect(state.chats['200']).toMatchObject({
      title: 'Новый',
      rank: 0,
      synced: true,
      unread: 0,
      updatedAt: 0,
      messages: [],
    })
    expect(state.chats['100']).toMatchObject({ title: 'Новое', rank: 1, synced: true })
    expect(state.chats['100'].username).toBeUndefined()
  })

  it('удаляет ранее синхронизированные чаты, пропавшие из списка, и сбрасывает activeChatId', () => {
    let state = chatReducer(initialChatState, { type: 'chatsSynced', chats: [{ id: '100' }, { id: '200' }] })
    state = chatReducer(state, { type: 'chatSelected', chatId: '200' })
    state = chatReducer(state, { type: 'chatOpened', chat: { id: '300' }, select: false })
    state = chatReducer(state, { type: 'chatsSynced', chats: [{ id: '100' }] })
    expect(Object.keys(state.chats).sort()).toEqual(['100', '300'])
    expect(state.activeChatId).toBeNull()
  })

  it('не удаляет локальные чаты, которых никогда не было в списке, и сохраняет activeChatId', () => {
    const state = chatReducer(openChat(), { type: 'chatsSynced', chats: [] })
    expect(state.activeChatId).toBe('100')
    expect(state.chats['100']).toBeDefined()
  })
})

describe('chatReducer: historyLoaded', () => {
  it('сливает по id, сортирует и не понижает локальный статус', () => {
    let state = chatReducer(initialChatState, { type: 'chatsSynced', chats: [CHAT] })
    state = chatReducer(state, {
      type: 'messageReceived',
      message: msg({ id: 'b', direction: 'out', status: 'read', timestamp: 3000 }),
      chat: CHAT,
    })
    state = chatReducer(state, {
      type: 'historyLoaded',
      chatId: '100',
      messages: [
        msg({ id: 'c', timestamp: 4000 }),
        msg({ id: 'b', direction: 'out', status: 'delivered', timestamp: 3000, text: 'новый текст', edited: true }),
        msg({ id: 'a', timestamp: 1000 }),
      ],
    })
    const messages = state.chats['100'].messages
    expect(messages.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(messages[1]).toMatchObject({ status: 'read', text: 'новый текст', edited: true })
    expect(state.chats['100'].updatedAt).toBe(4000)
  })

  it('повышает локальный статус, если в истории он выше', () => {
    let state = openChat()
    state = chatReducer(state, { type: 'messageReceived', message: msg({ direction: 'out', status: 'sent' }), chat: CHAT })
    state = chatReducer(state, {
      type: 'historyLoaded',
      chatId: '100',
      messages: [msg({ direction: 'out', status: 'read' })],
    })
    expect(state.chats['100'].messages[0].status).toBe('read')
  })

  it('ограничивает число сообщений MAX_MESSAGES_PER_CHAT, оставляя свежие', () => {
    const history = Array.from({ length: MAX_MESSAGES_PER_CHAT + 20 }, (_, i) => msg({ id: `h${i}`, timestamp: i }))
    const state = chatReducer(openChat(), { type: 'historyLoaded', chatId: '100', messages: history })
    const messages = state.chats['100'].messages
    expect(messages).toHaveLength(MAX_MESSAGES_PER_CHAT)
    expect(messages[0].id).toBe('h20')
    expect(messages.at(-1)?.id).toBe(`h${MAX_MESSAGES_PER_CHAT + 19}`)
  })

  it('игнорирует историю неизвестного чата', () => {
    expect(chatReducer(initialChatState, { type: 'historyLoaded', chatId: 'x', messages: [msg({})] })).toBe(
      initialChatState,
    )
  })
})

describe('chatReducer: правка и удаление', () => {
  function withMessages(): ChatState {
    let state = openChat()
    state = chatReducer(state, { type: 'chatOpened', chat: { id: '200' }, select: false })
    state = chatReducer(state, {
      type: 'messageReceived',
      message: msg({ id: 'a', direction: 'out', status: 'sent' }),
      chat: CHAT,
    })
    state = chatReducer(state, { type: 'messageReceived', message: msg({ id: 'b', chatId: '200' }), chat: { id: '200' } })
    return state
  }

  it('messageEdited с chatId меняет текст и ставит edited', () => {
    const state = chatReducer(withMessages(), { type: 'messageEdited', chatId: '100', messageId: 'a', text: 'правка' })
    expect(state.chats['100'].messages[0]).toMatchObject({ text: 'правка', edited: true })
  })

  it('messageEdited без chatId находит сообщение в другом чате', () => {
    const state = chatReducer(withMessages(), { type: 'messageEdited', messageId: 'b', text: 'правка' })
    expect(state.chats['200'].messages[0]).toMatchObject({ text: 'правка', edited: true })
  })

  it('messageEdited с неверным chatId ищет по всем чатам', () => {
    const state = chatReducer(withMessages(), { type: 'messageEdited', chatId: '100', messageId: 'b', text: 'правка' })
    expect(state.chats['200'].messages[0].text).toBe('правка')
  })

  it('messageEdited с edited:false откатывает оптимистичную правку', () => {
    let state = chatReducer(withMessages(), { type: 'messageEdited', chatId: '100', messageId: 'a', text: 'правка' })
    state = chatReducer(state, { type: 'messageEdited', chatId: '100', messageId: 'a', text: 'hi', edited: false })
    expect(state.chats['100'].messages[0]).toMatchObject({ text: 'hi', edited: false })
  })

  it('messageEdited неизвестного сообщения возвращает тот же state', () => {
    const state = withMessages()
    expect(chatReducer(state, { type: 'messageEdited', messageId: 'zzz', text: 'x' })).toBe(state)
  })

  it('messageDeleted без chatId ищет сообщение по всем чатам', () => {
    const state = chatReducer(withMessages(), { type: 'messageDeleted', messageId: 'b' })
    expect(state.chats['200'].messages).toEqual([])
    expect(state.chats['100'].messages).toHaveLength(1)
  })
})

describe('sortedChats / totalUnread', () => {
  it('сортирует по updatedAt по убыванию, затем по rank', () => {
    const base = { messages: [], unread: 0 }
    const state: ChatState = {
      ...initialChatState,
      chats: {
        r0: { ...base, id: 'r0', updatedAt: 0, rank: 0 },
        r1: { ...base, id: 'r1', updatedAt: 0, rank: 1 },
        none: { ...base, id: 'none', updatedAt: 0 },
        fresh: { ...base, id: 'fresh', updatedAt: 900, rank: 5 },
        old: { ...base, id: 'old', updatedAt: 500 },
      },
    }
    expect(sortedChats(state).map((c) => c.id)).toEqual(['fresh', 'old', 'r0', 'r1', 'none'])
  })

  it('totalUnread суммирует непрочитанные', () => {
    let state = chatReducer(initialChatState, {
      type: 'messageReceived',
      message: msg({ id: '1', chatId: 'a' }),
      chat: { id: 'a' },
    })
    state = chatReducer(state, {
      type: 'messageReceived',
      message: msg({ id: '2', chatId: 'a', timestamp: 2 }),
      chat: { id: 'a' },
    })
    state = chatReducer(state, { type: 'messageReceived', message: msg({ id: '3', chatId: 'b' }), chat: { id: 'b' } })
    expect(totalUnread(state)).toBe(3)
    expect(totalUnread(initialChatState)).toBe(0)
  })
})

describe('chatReducer: превью последних сообщений', () => {
  it('previewsLoaded добавляет сообщение в известные чаты, поднимает их в списке и не трогает unread', () => {
    let state = chatReducer(initialChatState, {
      type: 'chatsSynced',
      chats: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
    })
    state = chatReducer(state, {
      type: 'previewsLoaded',
      messages: [
        msg({ id: 'p1', chatId: 'b', timestamp: 5000 }),
        msg({ id: 'p2', chatId: 'unknown', timestamp: 6000 }),
      ],
    })
    expect(state.chats.b.messages.map((m) => m.id)).toEqual(['p1'])
    expect(state.chats.b.unread).toBe(0)
    expect(state.chats.unknown).toBeUndefined()
    expect(sortedChats(state).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('повторное превью того же сообщения не дублирует его', () => {
    let state = chatReducer(initialChatState, { type: 'chatsSynced', chats: [{ id: 'a' }] })
    const action = { type: 'previewsLoaded' as const, messages: [msg({ id: 'p1', chatId: 'a' })] }
    state = chatReducer(chatReducer(state, action), action)
    expect(state.chats.a.messages).toHaveLength(1)
  })
})
