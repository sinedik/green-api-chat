export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface Message {
  /** idMessage из GREEN-API, либо временный id `local-…` до ответа sendMessage */
  id: string
  /** Исходный временный id — стабильный React key, чтобы пузырь не перемонтировался после отправки */
  localId?: string
  chatId: string
  text: string
  direction: 'in' | 'out'
  timestamp: number
  status?: MessageStatus
  error?: string
  edited?: boolean
  /** Для не текстовых сообщений — подпись типа («Фото», «Стикер»), text тогда — подпись к медиа */
  media?: string
  /** Имя автора входящего сообщения в группе */
  author?: string
}

export type ChatType = 'user' | 'group'

export interface ChatMeta {
  id: string
  title?: string
  phone?: string
  /** Telegram @username */
  username?: string
  avatar?: string
  type?: ChatType
}

export interface Chat extends ChatMeta {
  messages: Message[]
  unread: number
  updatedAt: number
  /** unix-время (мс) последнего визита собеседника, если он его не скрывает */
  lastSeen?: number
  /** Позиция в списке getChats — сортировка чатов без сообщений */
  rank?: number
  /** Когда проверяли аватар через getAvatar (мс) — чтобы не запрашивать повторно */
  avatarCheckedAt?: number
  /** Чат есть в списке getChats мессенджера: если он оттуда пропадёт — значит, удалён в мессенджере */
  synced?: boolean
}

export interface ChatState {
  chats: Record<string, Chat>
  activeChatId: string | null
  /** Статусы, пришедшие раньше ответа sendMessage (сообщение ещё с временным id) */
  orphanStatuses: Record<string, MessageStatus>
}

type ChatPatch = Partial<Pick<Chat, 'title' | 'phone' | 'username' | 'avatar' | 'lastSeen' | 'type' | 'avatarCheckedAt'>>

export type ChatAction =
  /** select: false — только создать чат (действие пришло из другой вкладки) */
  | { type: 'chatOpened'; chat: ChatMeta; select?: boolean }
  | { type: 'chatSelected'; chatId: string | null }
  | { type: 'chatDeleted'; chatId: string }
  | { type: 'chatRead'; chatId: string }
  | { type: 'chatUpdated'; chatId: string; patch: ChatPatch }
  | { type: 'chatsSynced'; chats: ChatMeta[] }
  | { type: 'historyLoaded'; chatId: string; messages: Message[] }
  /** Последние сообщения по нескольким чатам — для превью в списке; неизвестные чаты игнорируются */
  | { type: 'previewsLoaded'; messages: Message[] }
  | { type: 'messageQueued'; message: Message }
  | { type: 'messageSent'; chatId: string; localId: string; id: string }
  | { type: 'messageFailed'; chatId: string; localId: string; error: string }
  | { type: 'messageRetried'; chatId: string; localId: string }
  | { type: 'messageReceived'; message: Message; chat: ChatMeta; hidden?: boolean }
  /** edited: false — откат оптимистичной правки */
  | { type: 'messageEdited'; chatId?: string; messageId: string; text: string; edited?: boolean }
  | { type: 'messageDeleted'; chatId?: string; messageId: string }
  | { type: 'statusUpdated'; chatId: string; messageId: string; status: MessageStatus }

export const initialChatState: ChatState = { chats: {}, activeChatId: null, orphanStatuses: {} }

/** Сколько сообщений храним на чат — localStorage не бесконечен */
export const MAX_MESSAGES_PER_CHAT = 500
const MAX_ORPHAN_STATUSES = 100

const STATUS_RANK: Record<MessageStatus, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 }

/** Статусы приходят не по порядку: не даём "delivered" перезаписать "read" (кроме failed) */
function mergeStatus(current: MessageStatus | undefined, next: MessageStatus): MessageStatus {
  if (!current || next === 'failed') return next
  if (current === 'failed') return next === 'pending' ? current : next
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current
}

function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>
}

function ensureChat(state: ChatState, meta: ChatMeta, now: number): Chat {
  const existing = state.chats[meta.id]
  if (!existing) return { ...definedOnly(meta), id: meta.id, messages: [], unread: 0, updatedAt: now }
  // Уже известные данные не затираем: из уведомлений они менее точные, чем из getContactInfo/getChats
  return { ...definedOnly(meta), ...definedOnly(existing), messages: existing.messages } as Chat
}

function withChat(state: ChatState, chat: Chat): ChatState {
  return { ...state, chats: { ...state.chats, [chat.id]: chat } }
}

function trim(messages: Message[]): Message[] {
  return messages.length > MAX_MESSAGES_PER_CHAT ? messages.slice(-MAX_MESSAGES_PER_CHAT) : messages
}

function insertSorted(messages: Message[], message: Message): Message[] {
  const result = messages.slice()
  let i = result.length
  while (i > 0 && result[i - 1].timestamp > message.timestamp) i--
  result.splice(i, 0, message)
  return trim(result)
}

function updateMessage(state: ChatState, chatId: string, id: string, patch: (m: Message) => Message): ChatState {
  const chat = state.chats[chatId]
  if (!chat) return state
  const index = chat.messages.findIndex((m) => m.id === id)
  if (index === -1) return state
  const messages = chat.messages.slice()
  messages[index] = patch(messages[index])
  return withChat(state, { ...chat, messages })
}

/** Уведомления об удалении своих сообщений приходят без chatId — ищем сообщение по всем чатам */
function findChatOf(state: ChatState, messageId: string, chatId?: string): string | undefined {
  if (chatId && state.chats[chatId]?.messages.some((m) => m.id === messageId)) return chatId
  return Object.values(state.chats).find((chat) => chat.messages.some((m) => m.id === messageId))?.id
}

function takeOrphan(state: ChatState, id: string): [MessageStatus | undefined, ChatState['orphanStatuses']] {
  const status = state.orphanStatuses[id]
  if (!status) return [undefined, state.orphanStatuses]
  const rest = { ...state.orphanStatuses }
  delete rest[id]
  return [status, rest]
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chatOpened': {
      const chat = ensureChat(state, action.chat, Date.now())
      if (action.select === false) return withChat(state, chat)
      return { ...withChat(state, { ...chat, unread: 0 }), activeChatId: chat.id }
    }

    case 'chatSelected': {
      if (action.chatId === null) return { ...state, activeChatId: null }
      const chat = state.chats[action.chatId]
      if (!chat) return state
      return { ...withChat(state, { ...chat, unread: 0 }), activeChatId: chat.id }
    }

    case 'chatRead': {
      const chat = state.chats[action.chatId]
      return chat?.unread ? withChat(state, { ...chat, unread: 0 }) : state
    }

    case 'chatDeleted': {
      const chats = { ...state.chats }
      delete chats[action.chatId]
      return { ...state, chats, activeChatId: state.activeChatId === action.chatId ? null : state.activeChatId }
    }

    case 'chatUpdated': {
      const chat = state.chats[action.chatId]
      if (!chat) return state
      return withChat(state, { ...chat, ...definedOnly(action.patch) })
    }

    case 'chatsSynced': {
      const remoteIds = new Set(action.chats.map((c) => c.id))
      const chats: Record<string, Chat> = {}

      for (const chat of Object.values(state.chats)) {
        // Был в списке мессенджера, а теперь нет — чат удалён в самом мессенджере
        if (chat.synced && !remoteIds.has(chat.id)) continue
        chats[chat.id] = chat
      }
      action.chats.forEach((meta, rank) => {
        const existing = chats[meta.id]
        chats[meta.id] = existing
          ? { ...existing, ...definedOnly(meta), rank, synced: true }
          : { ...definedOnly(meta), id: meta.id, messages: [], unread: 0, updatedAt: 0, rank, synced: true }
      })

      const activeChatId = state.activeChatId && chats[state.activeChatId] ? state.activeChatId : null
      return { ...state, chats, activeChatId }
    }

    case 'historyLoaded': {
      const chat = state.chats[action.chatId]
      if (!chat) return state
      const byId = new Map(chat.messages.map((m) => [m.id, m]))
      for (const message of action.messages) {
        const local = byId.get(message.id)
        byId.set(
          message.id,
          local
            ? { ...local, text: message.text, edited: message.edited ?? local.edited, status: local.status && message.status ? mergeStatus(local.status, message.status) : local.status }
            : message,
        )
      }
      const messages = trim([...byId.values()].sort((a, b) => a.timestamp - b.timestamp))
      const last = messages.at(-1)
      return withChat(state, { ...chat, messages, updatedAt: Math.max(chat.updatedAt, last?.timestamp ?? 0) })
    }

    case 'previewsLoaded': {
      const chats = { ...state.chats }
      for (const message of action.messages) {
        const chat = chats[message.chatId]
        if (!chat || chat.messages.some((m) => m.id === message.id)) continue
        chats[chat.id] = {
          ...chat,
          messages: insertSorted(chat.messages, message),
          updatedAt: Math.max(chat.updatedAt, message.timestamp),
        }
      }
      return { ...state, chats }
    }

    case 'messageQueued': {
      const chat = state.chats[action.message.chatId]
      if (!chat) return state
      return withChat(state, {
        ...chat,
        messages: trim([...chat.messages, action.message]),
        updatedAt: action.message.timestamp,
      })
    }

    case 'messageSent': {
      const chat = state.chats[action.chatId]
      if (!chat) return state
      const [orphan, orphanStatuses] = takeOrphan(state, action.id)
      const next = { ...state, orphanStatuses }

      // Эхо outgoingAPIMessageReceived могло прийти раньше ответа sendMessage — тогда убираем локальный дубль,
      // но сохраняем localId, чтобы пузырь не перемонтировался
      const echo = chat.messages.find((m) => m.id === action.id)
      if (echo) {
        return withChat(next, {
          ...chat,
          messages: chat.messages
            .filter((m) => m.id !== action.localId)
            .map((m) => (m === echo ? { ...m, localId: action.localId, status: mergeStatus(m.status, orphan ?? 'sent') } : m)),
        })
      }
      return updateMessage(next, action.chatId, action.localId, (m) => ({
        ...m,
        id: action.id,
        localId: m.localId ?? action.localId,
        status: mergeStatus('sent', orphan ?? 'sent'),
        error: undefined,
      }))
    }

    case 'messageFailed':
      return updateMessage(state, action.chatId, action.localId, (m) => ({ ...m, status: 'failed', error: action.error }))

    case 'messageRetried':
      return updateMessage(state, action.chatId, action.localId, (m) =>
        m.status === 'failed' ? { ...m, status: 'pending', error: undefined } : m,
      )

    case 'messageReceived': {
      const { message } = action
      const current = state.chats[message.chatId]
      if (current?.messages.some((m) => m.id === message.id)) return state

      const [orphan, orphanStatuses] = takeOrphan(state, message.id)
      const chat = ensureChat(state, action.chat, message.timestamp)
      const seen = state.activeChatId === chat.id && !action.hidden
      return withChat(
        { ...state, orphanStatuses },
        {
          ...chat,
          messages: insertSorted(chat.messages, orphan ? { ...message, status: mergeStatus(message.status, orphan) } : message),
          unread: message.direction === 'in' && !seen ? chat.unread + 1 : chat.unread,
          updatedAt: Math.max(chat.updatedAt, message.timestamp),
        },
      )
    }

    case 'messageEdited': {
      const chatId = findChatOf(state, action.messageId, action.chatId)
      if (!chatId) return state
      return updateMessage(state, chatId, action.messageId, (m) => ({ ...m, text: action.text, edited: action.edited ?? true }))
    }

    case 'messageDeleted': {
      const chatId = findChatOf(state, action.messageId, action.chatId)
      if (!chatId) return state
      const chat = state.chats[chatId]
      return withChat(state, { ...chat, messages: chat.messages.filter((m) => m.id !== action.messageId) })
    }

    case 'statusUpdated': {
      const chat = state.chats[action.chatId]
      if (!chat?.messages.some((m) => m.id === action.messageId)) {
        // Сообщение ещё не получило настоящий id — придержим статус до messageSent.
        // Статусы сообщений из неизвестных чатов тоже попадут сюда, поэтому держим только последние
        const prev = state.orphanStatuses[action.messageId]
        const status = prev ? mergeStatus(prev, action.status) : action.status
        const entries = Object.entries(state.orphanStatuses)
          .filter(([id]) => id !== action.messageId)
          .slice(-(MAX_ORPHAN_STATUSES - 1))
        return { ...state, orphanStatuses: Object.fromEntries([...entries, [action.messageId, status]]) }
      }
      return updateMessage(state, action.chatId, action.messageId, (m) => ({ ...m, status: mergeStatus(m.status, action.status) }))
    }
  }
}

export function sortedChats(state: ChatState): Chat[] {
  return Object.values(state.chats).sort(
    (a, b) => b.updatedAt - a.updatedAt || (a.rank ?? Infinity) - (b.rank ?? Infinity),
  )
}

export function totalUnread(state: ChatState): number {
  return Object.values(state.chats).reduce((sum, chat) => sum + chat.unread, 0)
}
