import type {
  HistoryMessage,
  MessageData,
  MessageWebhook,
  QuotaWebhook,
  SenderData,
  StateInstance,
  StateWebhook,
  StatusWebhook,
  Webhook,
} from '../api/types'
import type { ChatMeta, Message, MessageStatus } from '../store/chatReducer'

export type ChatEvent =
  | { type: 'message'; message: Message; chat: ChatMeta }
  | { type: 'edited'; chatId?: string; messageId: string; text: string }
  | { type: 'deleted'; chatId?: string; messageId: string }
  | { type: 'status'; chatId: string; messageId: string; status: MessageStatus }
  | { type: 'state'; state: StateInstance }
  | { type: 'quota'; description: string }

const MESSAGE_WEBHOOKS = new Set(['incomingMessageReceived', 'outgoingMessageReceived', 'outgoingAPIMessageReceived'])

const TEXT_TYPES = new Set(['textMessage', 'extendedTextMessage', 'quotedMessage'])

/** Служебные типы, которые не отображаются в ленте */
const IGNORED_TYPES = new Set(['reactionMessage', 'editedMessage', 'deletedMessage'])

/** Задание — только текст, но медиа не прячем: показываем подпись вида «Фото», как в превью мессенджеров */
const MEDIA_LABELS: Record<string, string> = {
  imageMessage: 'Фото',
  videoMessage: 'Видео',
  videoNoteMessage: 'Видеосообщение',
  audioMessage: 'Аудио',
  voiceMessage: 'Голосовое сообщение',
  documentMessage: 'Документ',
  stickerMessage: 'Стикер',
  locationMessage: 'Геопозиция',
  contactMessage: 'Контакт',
  contactsArrayMessage: 'Контакты',
  pollMessage: 'Опрос',
  gifMessage: 'GIF',
}

export function extractText(data: MessageData | undefined): string | null {
  if (!data) return null
  switch (data.typeMessage) {
    case 'textMessage':
      return data.textMessageData?.textMessage ?? null
    case 'extendedTextMessage':
    case 'quotedMessage':
      return data.extendedTextMessageData?.text ?? data.textMessageData?.textMessage ?? null
    default:
      return null
  }
}

/** Текст + метка медиа для любого типа сообщения; null — сообщение не отображается */
function toContent(typeMessage: string, text: string | null | undefined, caption?: string) {
  if (IGNORED_TYPES.has(typeMessage)) return null
  if (TEXT_TYPES.has(typeMessage)) return text ? { text } : null
  return { text: caption ?? '', media: MEDIA_LABELS[typeMessage] ?? 'Неподдерживаемое сообщение' }
}

function mapStatus(status: string | undefined): MessageStatus {
  switch (status) {
    case 'pending':
    case 'sent':
    case 'delivered':
    case 'read':
      return status
    default:
      return 'failed'
  }
}

const isGroup = (sender: SenderData) =>
  sender.chatType === 'group' || sender.chatType === 'supergroup' || sender.chatId.startsWith('-')

function chatMeta(sender: SenderData, incoming: boolean): ChatMeta {
  const group = isGroup(sender)
  return {
    id: sender.chatId,
    // В группе название — chatName; в личке у входящих лучше имя из контактов, у исходящих senderName — это мы сами
    title: (group || !incoming ? sender.chatName : sender.senderContactName || sender.senderName || sender.chatName) || undefined,
    phone: incoming && !group && sender.senderPhoneNumber ? String(sender.senderPhoneNumber) : undefined,
    type: group ? 'group' : 'user',
  }
}

function parseMessageWebhook(webhook: MessageWebhook): ChatEvent | null {
  const { messageData, senderData } = webhook
  const chatId = senderData?.chatId

  if (messageData.typeMessage === 'deletedMessage' && messageData.deletedMessageData) {
    return { type: 'deleted', chatId, messageId: messageData.deletedMessageData.stanzaId }
  }
  if (messageData.typeMessage === 'editedMessage' && messageData.editedMessageData) {
    const { stanzaId, textMessage } = messageData.editedMessageData
    return { type: 'edited', chatId, messageId: stanzaId, text: textMessage }
  }

  if (!senderData || !chatId || !webhook.idMessage) return null
  const content = toContent(messageData.typeMessage, extractText(messageData), messageData.fileMessageData?.caption)
  if (!content) return null

  const incoming = webhook.typeWebhook === 'incomingMessageReceived'
  return {
    type: 'message',
    message: {
      id: webhook.idMessage,
      chatId,
      ...content,
      direction: incoming ? 'in' : 'out',
      timestamp: webhook.timestamp * 1000,
      status: incoming ? undefined : 'sent',
      author: incoming && isGroup(senderData) ? senderData.senderName || undefined : undefined,
    },
    chat: chatMeta(senderData, incoming),
  }
}

/** Превращает сырое уведомление GREEN-API в событие чата. Всё, что не относится к чатам, → null. */
export function parseNotification(body: Webhook): ChatEvent | null {
  if (MESSAGE_WEBHOOKS.has(body.typeWebhook)) return parseMessageWebhook(body as MessageWebhook)

  switch (body.typeWebhook) {
    case 'outgoingMessageStatus': {
      const webhook = body as StatusWebhook
      return { type: 'status', chatId: webhook.chatId, messageId: webhook.idMessage, status: mapStatus(webhook.status) }
    }
    case 'stateInstanceChanged':
      return { type: 'state', state: (body as StateWebhook).stateInstance }
    case 'quotaExceeded': {
      const quota = (body as QuotaWebhook).quotaData
      return {
        type: 'quota',
        description:
          quota?.total !== undefined
            ? `Закончился месячный лимит бесплатного тарифа GREEN-API: использовано ${quota.used} из ${quota.total}`
            : 'Закончился месячный лимит бесплатного тарифа GREEN-API',
      }
    }
    default:
      return null
  }
}

/** Элемент getChatHistory → сообщение ленты (null — не показываем) */
export function historyToMessage(item: HistoryMessage): Message | null {
  if (item.isDeleted) return null
  const content = toContent(item.typeMessage, item.textMessage, item.caption)
  if (!content) return null
  const incoming = item.type === 'incoming'
  return {
    id: item.idMessage,
    chatId: item.chatId,
    ...content,
    direction: incoming ? 'in' : 'out',
    timestamp: item.timestamp * 1000,
    status: incoming ? undefined : mapStatus(item.statusMessage ?? 'sent'),
    edited: item.isEdited || undefined,
    author: incoming && item.chatId.startsWith('-') ? item.senderName : undefined,
  }
}
