import type { CheckAccountQuery } from '../api/types'
import { MESSENGERS, parseUsername, type Messenger } from './messenger'
import { normalizePhone } from './phone'

export type Recipient = { kind: 'phone'; phone: string } | { kind: 'username'; username: string }

/** Разбирает ввод в форме «Новый чат»: номер телефона или (для Telegram) @username */
export function parseRecipient(input: string, messenger: Messenger): Recipient {
  const { usernames } = MESSENGERS[messenger]
  const username = usernames ? parseUsername(input) : null
  if (username) return { kind: 'username', username }
  const phone = normalizePhone(input)
  if (phone) return { kind: 'phone', phone }
  throw new Error(
    usernames
      ? 'Введите номер в международном формате (+7 999 123-45-67) или @username'
      : 'Введите номер в международном формате, например +7 999 123-45-67',
  )
}

export function toCheckAccountQuery(recipient: Recipient): CheckAccountQuery {
  return recipient.kind === 'phone' ? { phoneNumber: Number(recipient.phone) } : { username: recipient.username }
}
