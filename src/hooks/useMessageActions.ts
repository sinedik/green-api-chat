import { useCallback, useMemo, useRef, type RefObject } from 'react'
import type { GreenApiClient } from '../api/client'
import { errorMessage } from '../lib/errors'
import type { Toast } from '../store/chatContext'
import type { ChatAction, ChatState } from '../store/chatReducer'

const TYPING_THROTTLE_MS = 4_000
const TYPING_TIME_MS = 5_000

interface Options {
  client: GreenApiClient
  dispatch: (action: ChatAction) => void
  stateRef: RefObject<ChatState>
  toast: (text: string, tone?: Toast['tone']) => void
}

/** Отправка, повтор, правка и удаление сообщений, «печатает…» */
export function useMessageActions({ client, dispatch, stateRef, toast }: Options) {
  /** Очередь отправки на каждый чат: быстрые сообщения уходят строго по порядку */
  const sendQueues = useRef(new Map<string, Promise<void>>())
  const retrying = useRef(new Set<string>())
  const lastTyping = useRef(new Map<string, number>())

  const findMessage = useCallback(
    (chatId: string, messageId: string) => stateRef.current.chats[chatId]?.messages.find((m) => m.id === messageId),
    [stateRef],
  )

  const deliver = useCallback(
    (chatId: string, messageId: string, text: string) => {
      const task = async () => {
        try {
          const { idMessage } = await client.sendMessage(chatId, text)
          dispatch({ type: 'messageSent', chatId, localId: messageId, id: idMessage })
        } catch (error) {
          dispatch({ type: 'messageFailed', chatId, localId: messageId, error: errorMessage(error) })
        }
      }
      const queues = sendQueues.current
      const next = (queues.get(chatId) ?? Promise.resolve()).then(task)
      queues.set(chatId, next)
      void next.finally(() => queues.get(chatId) === next && queues.delete(chatId))
      return next
    },
    [client, dispatch],
  )

  const sendMessage = useCallback(
    (chatId: string, text: string) => {
      const localId = `local-${crypto.randomUUID()}`
      dispatch({
        type: 'messageQueued',
        message: { id: localId, localId, chatId, text, direction: 'out', timestamp: Date.now(), status: 'pending' },
      })
      void deliver(chatId, localId, text)
    },
    [deliver, dispatch],
  )

  const retryMessage = useCallback(
    (chatId: string, messageId: string) => {
      const message = findMessage(chatId, messageId)
      // Защита от двойного клика: повторяем только проваленное и ещё не повторяемое сообщение
      if (!message || message.status !== 'failed' || retrying.current.has(messageId)) return
      retrying.current.add(messageId)
      dispatch({ type: 'messageRetried', chatId, localId: messageId })
      void deliver(chatId, messageId, message.text).finally(() => retrying.current.delete(messageId))
    },
    [deliver, dispatch, findMessage],
  )

  const editMessage = useCallback(
    async (chatId: string, messageId: string, text: string) => {
      const message = findMessage(chatId, messageId)
      if (!message || message.text === text) return
      dispatch({ type: 'messageEdited', chatId, messageId, text })
      try {
        await client.editMessage(chatId, messageId, text)
      } catch (error) {
        // Откат оптимистичной правки
        dispatch({ type: 'messageEdited', chatId, messageId, text: message.text, edited: message.edited ?? false })
        toast(`Не удалось изменить сообщение: ${errorMessage(error)}`, 'error')
      }
    },
    [client, dispatch, findMessage, toast],
  )

  const deleteMessage = useCallback(
    async (chatId: string, messageId: string) => {
      try {
        await client.deleteMessage(chatId, messageId)
        dispatch({ type: 'messageDeleted', chatId, messageId })
      } catch (error) {
        toast(`Не удалось удалить сообщение: ${errorMessage(error)}`, 'error')
      }
    },
    [client, dispatch, toast],
  )

  const notifyTyping = useCallback(
    (chatId: string) => {
      const now = Date.now()
      if (now - (lastTyping.current.get(chatId) ?? 0) < TYPING_THROTTLE_MS) return
      lastTyping.current.set(chatId, now)
      client.sendTyping(chatId, TYPING_TIME_MS).catch(() => {})
    },
    [client],
  )

  // Один объект на весь жизненный цикл — действия в контексте остаются стабильными
  return useMemo(
    () => ({ sendMessage, retryMessage, editMessage, deleteMessage, notifyTyping }),
    [sendMessage, retryMessage, editMessage, deleteMessage, notifyTyping],
  )
}
