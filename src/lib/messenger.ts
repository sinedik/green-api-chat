export type Messenger = 'max' | 'telegram'

interface MessengerConfig {
  name: string
  /** Лимит длины текстового сообщения в GREEN-API */
  maxLength: number
  /** checkAccount умеет искать по @username (только Telegram) */
  usernames: boolean
}

export const MESSENGERS: Record<Messenger, MessengerConfig> = {
  max: { name: 'MAX', maxLength: 4000, usernames: false },
  telegram: { name: 'Telegram', maxLength: 4096, usernames: true },
}

/** typeInstance из getSettings: "v3" — MAX, "telegram" — Telegram. Остальное (WhatsApp) не поддерживаем. */
export function detectMessenger(typeInstance: string | undefined): Messenger | null {
  if (typeInstance === 'telegram') return 'telegram'
  if (typeInstance === 'v3' || typeInstance === undefined) return 'max'
  return null
}

const USERNAME_RE = /^@?([a-zA-Z][a-zA-Z0-9_]{4,31})$/

/** "@durov" / "durov" → "@durov", иначе null */
export function parseUsername(input: string): string | null {
  const match = input.trim().match(USERNAME_RE)
  return match ? `@${match[1]}` : null
}
