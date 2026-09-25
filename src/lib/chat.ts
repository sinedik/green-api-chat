import type { AccountSettings, StateInstance } from '../api/types'
import type { Chat } from '../store/chatReducer'
import { formatLastSeen } from './format'
import { formatPhone } from './phone'

type ChatLike = Pick<Chat, 'id' | 'title' | 'phone' | 'username'>

/** Чат с самим собой — «Избранное», как в Telegram */
export function isSavedMessages(chat: Pick<Chat, 'id'>, selfId?: string): boolean {
  return !!selfId && chat.id === selfId
}

export function chatTitle(chat: ChatLike, selfId?: string): string {
  if (isSavedMessages(chat, selfId)) return 'Избранное'
  return chat.title || chat.username || (chat.phone ? formatPhone(chat.phone) : `ID ${chat.id}`)
}

/** Вторая строка в шапке чата: «был(а) в сети…», либо то, что не попало в заголовок (@username, телефон) */
export function chatSubtitle(chat: Chat, messengerName: string, selfId?: string, now = Date.now()): string {
  if (isSavedMessages(chat, selfId)) return 'Сообщения самому себе'
  if (chat.type === 'group') return 'Группа'
  if (chat.lastSeen) return formatLastSeen(chat.lastSeen, now)
  const title = chatTitle(chat, selfId)
  const parts = [chat.username, chat.phone && formatPhone(chat.phone)].filter(
    (part): part is string => !!part && part !== title,
  )
  return parts.length ? parts.join(' · ') : `${messengerName} ID ${chat.id}`
}

/** Имя своего аккаунта: @username, телефон или (пока профиль не загружен) номер инстанса */
export function accountName(account: AccountSettings | null, idInstance: string): string {
  return account?.username || (account?.phone ? formatPhone(account.phone) : `Инстанс ${idInstance}`)
}

export const STATE_DESCRIPTIONS: Record<Exclude<StateInstance, 'authorized'>, string> = {
  notAuthorized: 'Инстанс не подключён к мессенджеру. Отсканируйте QR-код в личном кабинете GREEN-API',
  blocked: 'Аккаунт мессенджера заблокирован. Подробности — в личном кабинете GREEN-API',
  starting: 'Инстанс запускается. Обычно это занимает не больше 5 минут',
  suspended: 'Мессенджер временно ограничил отправку: сообщения доходят только контактам',
  pendingPassword: 'Инстанс ждёт облачный пароль. Введите его в личном кабинете GREEN-API',
}

export const STATE_LABELS: Record<StateInstance, string> = {
  authorized: 'Авторизован',
  notAuthorized: 'Не авторизован',
  blocked: 'Заблокирован',
  starting: 'Запускается',
  suspended: 'Ограничен',
  pendingPassword: 'Ждёт пароль',
}
