import type { Message } from '../store/chatReducer'

/** Время самого свежего входящего сообщения (мс) или null, если входящих нет */
export function lastIncomingAt(messages: readonly Message[]): number | null {
  let latest: number | null = null
  for (const m of messages) if (m.direction === 'in' && (latest === null || m.timestamp > latest)) latest = m.timestamp
  return latest
}

/**
 * readChat без повторов. Прочтение отмечается из нескольких мест (открытие чата, приход истории,
 * новое входящее, возврат на вкладку), а лимит в MAX — 1 запрос/с. Поэтому помним, до какого входящего
 * чат уже отмечен, и шлём запрос, только если с тех пор пришло что-то новее. При ошибке отметка откатывается.
 */
export function createChatReader(read: (chatId: string) => Promise<void>) {
  const readUpTo = new Map<string, number>()

  return (chatId: string, incomingAt: number) => {
    const previous = readUpTo.get(chatId)
    if (previous !== undefined && incomingAt <= previous) return
    readUpTo.set(chatId, incomingAt)
    read(chatId).catch(() => {
      // Откатываем, только если за это время не успели отметить более свежее
      if (readUpTo.get(chatId) !== incomingAt) return
      if (previous === undefined) readUpTo.delete(chatId)
      else readUpTo.set(chatId, previous)
    })
  }
}

export type ChatReader = ReturnType<typeof createChatReader>
