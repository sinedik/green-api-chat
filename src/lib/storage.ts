import type { Credentials } from '../api/types'
import { initialChatState, type Chat, type ChatState } from '../store/chatReducer'

export const CREDENTIALS_KEY = 'green-chat:credentials'
const chatsKey = (idInstance: string) => `green-chat:chats:${idInstance}`
const previewsKey = (idInstance: string) => `green-chat:previews:${idInstance}`

// Хранилище может быть недоступно (приватный режим, запрет cookies) — приложение должно работать и без него
function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.warn('[storage] не удалось сохранить', key, error)
    return false
  }
}

function remove(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function loadCredentials(): Credentials | null {
  return read<Credentials>(localStorage, CREDENTIALS_KEY) ?? read<Credentials>(sessionStorage, CREDENTIALS_KEY)
}

export function saveCredentials(credentials: Credentials, remember: boolean) {
  write(remember ? localStorage : sessionStorage, CREDENTIALS_KEY, credentials)
}

export function clearCredentials() {
  remove(localStorage, CREDENTIALS_KEY)
  remove(sessionStorage, CREDENTIALS_KEY)
}

/** Приводит сохранённый чат к текущей схеме */
function migrateChat(chat: Chat): Chat {
  return {
    ...chat,
    // Ранние версии хранили @username в title
    ...(chat.title?.startsWith('@') && !chat.username ? { title: undefined, username: chat.title } : {}),
    // Сообщения, не успевшие отправиться до перезагрузки, помечаем ошибкой — их можно переотправить
    messages: (chat.messages ?? []).map((m) =>
      m.status === 'pending' ? { ...m, status: 'failed' as const, error: 'Отправка прервана' } : m,
    ),
  }
}

export function loadChats(idInstance: string): ChatState {
  const saved = read<Pick<ChatState, 'chats'>>(localStorage, chatsKey(idInstance))
  if (!saved?.chats || typeof saved.chats !== 'object') return initialChatState
  const chats = Object.fromEntries(Object.entries(saved.chats).map(([id, chat]) => [id, migrateChat(chat)]))
  return { ...initialChatState, chats }
}

/** false — историю сохранить не удалось даже в урезанном виде */
export function saveChats(idInstance: string, state: ChatState): boolean {
  if (write(localStorage, chatsKey(idInstance), { chats: state.chats })) return true
  // Не влезли в квоту — сохраняем только последние сообщения каждой переписки
  const trimmed = Object.fromEntries(
    Object.entries(state.chats).map(([id, chat]) => [id, { ...chat, messages: chat.messages.slice(-50) }]),
  )
  return write(localStorage, chatsKey(idInstance), { chats: trimmed })
}

export function clearChats(idInstance: string) {
  remove(localStorage, chatsKey(idInstance))
  remove(localStorage, previewsKey(idInstance))
}

/**
 * Когда (мс) последний раз подтягивали превью через lastIncoming/lastOutgoingMessages.
 * Всё, что пришло позже, уже в сохранённой истории (через очередь уведомлений), поэтому при следующем
 * запуске достаточно запросить журналы только с этого момента, а не за всю неделю.
 */
export function loadPreviewsAt(idInstance: string): number | null {
  const value = read<unknown>(localStorage, previewsKey(idInstance))
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function savePreviewsAt(idInstance: string, at: number) {
  write(localStorage, previewsKey(idInstance), at)
}
