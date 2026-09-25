import type { Message } from '../store/chatReducer'

/** Telegram разрешает редактировать свои сообщения в течение 48 часов */
const EDIT_WINDOW_MS = 48 * 60 * 60_000

export function canEdit(message: Message, now = Date.now()) {
  return (
    message.direction === 'out' &&
    !message.media &&
    !message.id.startsWith('local-') &&
    message.status !== 'failed' &&
    now - message.timestamp < EDIT_WINDOW_MS
  )
}

export function canDelete(message: Message) {
  return message.direction === 'out' && !message.id.startsWith('local-')
}
