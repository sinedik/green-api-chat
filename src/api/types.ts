import type { Messenger } from '../lib/messenger'

export interface Credentials {
  idInstance: string
  apiTokenInstance: string
  apiUrl: string
  /** Определяется при входе по typeInstance; в старых сохранённых данных может отсутствовать */
  messenger?: Messenger
  /** Демо-режим: фиктивный клиент без сети (см. api/demoClient.ts) */
  demo?: boolean
}

export type StateInstance =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'starting'
  | 'suspended'
  | 'pendingPassword'

export interface StateInstanceResponse {
  stateInstance: StateInstance
}

export interface AccountSettings {
  avatar: string
  phone: string
  stateInstance: StateInstance
  chatId: string
  /** Только Telegram */
  username?: string
}

export type YesNo = 'yes' | 'no'

export interface InstanceSettings {
  wid?: string
  typeInstance?: string
  webhookUrl?: string
  incomingWebhook?: YesNo
  outgoingWebhook?: YesNo
  outgoingMessageWebhook?: YesNo
  outgoingAPIMessageWebhook?: YesNo
  stateWebhook?: YesNo
  editedMessageWebhook?: YesNo
  deletedMessageWebhook?: YesNo
  markIncomingMessagesReaded?: YesNo
}

export type CheckAccountQuery = { phoneNumber: number } | { username: string }

export interface CheckAccountResponse {
  exist: boolean
  chatId: string
  /** Только Telegram */
  username?: string
  phoneNumber?: number
}

export interface SendMessageResponse {
  idMessage: string
}

export interface DeleteNotificationResponse {
  result: boolean
  reason?: string
}

export type RemoteChatType = 'user' | 'group' | 'supergroup' | 'channel' | 'bot'

/** Элемент ответа getChats */
export interface RemoteChat {
  chatId: string
  name?: string
  type?: RemoteChatType
  phoneNumber?: number
  username?: string
}

export interface ContactInfo {
  avatar?: string
  name?: string
  contactName?: string
  chatId: string
  chatType?: RemoteChatType
  /** unix-время, 0 — скрыто настройками приватности */
  lastSeen?: number
  phoneNumber?: number
  username?: string
  description?: string
}

/** Элемент ответа getChatHistory */
export interface HistoryMessage {
  type: 'incoming' | 'outgoing'
  idMessage: string
  timestamp: number
  typeMessage: string
  chatId: string
  textMessage?: string
  caption?: string
  statusMessage?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  chatType?: RemoteChatType
  senderName?: string
  isEdited?: boolean
  isDeleted?: boolean
}

// --- Уведомления (HTTP API) ---

export interface SenderData {
  chatId: string
  chatName?: string
  chatType?: RemoteChatType
  sender?: string
  senderName?: string
  senderContactName?: string
  senderPhoneNumber?: number
}

export interface MessageData {
  typeMessage: string
  textMessageData?: { textMessage: string }
  extendedTextMessageData?: { text: string; stanzaId?: string }
  editedMessageData?: { textMessage: string; stanzaId: string }
  deletedMessageData?: { stanzaId: string }
  fileMessageData?: { caption?: string }
}

export interface MessageWebhook {
  typeWebhook: 'incomingMessageReceived' | 'outgoingMessageReceived' | 'outgoingAPIMessageReceived'
  timestamp: number
  idMessage?: string
  /** В уведомлении об удалении своего сообщения senderData может отсутствовать */
  senderData?: SenderData
  messageData: MessageData
}

export type OutgoingStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'noAccount' | 'notInGroup'

export interface StatusWebhook {
  typeWebhook: 'outgoingMessageStatus'
  timestamp: number
  chatId: string
  idMessage: string
  status: OutgoingStatus
}

export interface StateWebhook {
  typeWebhook: 'stateInstanceChanged'
  timestamp: number
  stateInstance: StateInstance
}

export interface QuotaWebhook {
  typeWebhook: 'quotaExceeded'
  timestamp: number
  quotaData?: { method?: string; used?: number; total?: number; status?: string; description?: string }
}

export interface UnknownWebhook {
  typeWebhook: string
  timestamp?: number
}

export type Webhook = MessageWebhook | StatusWebhook | StateWebhook | QuotaWebhook | UnknownWebhook

export interface Notification {
  receiptId: number
  body: Webhook
}
