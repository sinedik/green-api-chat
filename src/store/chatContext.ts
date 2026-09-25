import { createContext, useContext } from 'react'
import type { AccountSettings, Credentials, InstanceSettings, StateInstance } from '../api/types'
import type { ConnectionStatus } from '../hooks/useNotificationPolling'
import type { Messenger } from '../lib/messenger'
import type { ChatState } from './chatReducer'

export interface Toast {
  id: number
  tone: 'error' | 'success' | 'info'
  text: string
}

/** Данные, которые меняются: подписчики перерисовываются на каждое событие */
export interface ChatStateValue {
  state: ChatState
  credentials: Credentials
  messenger: Messenger
  account: AccountSettings | null
  instanceState: StateInstance | null
  /** null — ещё не загружены (или загрузка не удалась — см. settingsError) */
  settings: InstanceSettings | null
  settingsError: boolean
  connection: ConnectionStatus
  /** Идёт синхронизация списка чатов с мессенджером */
  syncing: boolean
  toasts: Toast[]
}

/** Стабильные действия: ссылки не меняются, поэтому memo-компоненты не перерисовываются зря */
export interface ChatActions {
  selectChat: (chatId: string | null) => void
  /** Номер телефона или (для Telegram) @username → открыть/создать чат */
  openChat: (query: string) => Promise<void>
  deleteChat: (chatId: string) => void
  sendMessage: (chatId: string, text: string) => void
  retryMessage: (chatId: string, messageId: string) => void
  editMessage: (chatId: string, messageId: string, text: string) => Promise<void>
  deleteMessage: (chatId: string, messageId: string) => Promise<void>
  notifyTyping: (chatId: string) => void
  /** Лениво подгрузить аватар чата (вызывается, когда строка чата видна на экране) */
  ensureAvatar: (chatId: string) => void
  syncChats: () => Promise<void>
  saveSettings: (patch: InstanceSettings) => Promise<boolean>
  reloadSettings: () => void
  uploadAvatar: (file: File) => Promise<boolean>
  rebootInstance: () => Promise<void>
  /** Выйти из приложения; clearHistory — удалить локальную историю с устройства */
  logout: (options?: { clearHistory?: boolean }) => void
  /** Отвязать аккаунт мессенджера от инстанса GREEN-API (метод logout) */
  unlinkAccount: () => Promise<void>
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

export const ChatStateContext = createContext<ChatStateValue | null>(null)
export const ChatActionsContext = createContext<ChatActions | null>(null)

export function useChatState(): ChatStateValue {
  const value = useContext(ChatStateContext)
  if (!value) throw new Error('useChatState must be used inside <ChatProvider>')
  return value
}

export function useChatActions(): ChatActions {
  const value = useContext(ChatActionsContext)
  if (!value) throw new Error('useChatActions must be used inside <ChatProvider>')
  return value
}
