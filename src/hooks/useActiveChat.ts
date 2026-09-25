import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { GreenApiClient } from '../api/client'
import { historyToMessage } from '../lib/notifications'
import { lastIncomingAt, type ChatReader } from '../lib/readChat'
import type { ChatAction, ChatState, Message } from '../store/chatReducer'

const HISTORY_COUNT = 50
const AVATAR_RECHECK_MS = 24 * 60 * 60_000
const CONTACT_RETRY_MS = 5 * 60_000

interface Options {
  client: GreenApiClient
  dispatch: (action: ChatAction) => void
  stateRef: RefObject<ChatState>
  activeChatId: string | null
  /** Общий на провайдер readChat с дедупликацией (lib/readChat) */
  readChat: ChatReader
}

/**
 * Всё, что догружается о чатах по мере надобности:
 * - при открытии чата — история (getChatHistory, раз за сессию), данные собеседника (getContactInfo, вместе с аватаром)
 *   и отметка о прочтении;
 * - аватары в списке — лениво, когда строка чата видна на экране (getAvatar).
 */
export function useActiveChat({ client, dispatch, stateRef, activeChatId, readChat }: Options) {
  const historyLoaded = useRef(new Set<string>())
  const contactLoaded = useRef(new Set<string>())
  /** Когда getContactInfo последний раз упал — чтобы не повторять его на каждом открытии чата */
  const contactFailedAt = useRef(new Map<string, number>())
  const avatarRequested = useRef(new Set<string>())

  const markRead = useCallback(
    (chatId: string) => {
      const chat = stateRef.current.chats[chatId]
      if (!chat) return
      if (chat.unread) dispatch({ type: 'chatRead', chatId })
      const incomingAt = lastIncomingAt(chat.messages)
      if (incomingAt !== null) readChat(chatId, incomingAt)
    },
    [dispatch, readChat, stateRef],
  )

  const ensureAvatar = useCallback(
    (chatId: string) => {
      const chat = stateRef.current.chats[chatId]
      if (!chat || chat.avatar || avatarRequested.current.has(chatId)) return
      if (chat.avatarCheckedAt && Date.now() - chat.avatarCheckedAt < AVATAR_RECHECK_MS) return
      avatarRequested.current.add(chatId)
      const checked = { avatarCheckedAt: Date.now() }
      client
        .getAvatar(chatId)
        .then(({ urlAvatar }) =>
          dispatch({ type: 'chatUpdated', chatId, patch: { ...checked, avatar: urlAvatar || undefined } }),
        )
        .catch(() => dispatch({ type: 'chatUpdated', chatId, patch: checked }))
    },
    [client, dispatch, stateRef],
  )

  useEffect(() => {
    if (!activeChatId) return
    const controller = new AbortController()
    const { signal } = controller
    const chatId = activeChatId

    if (!historyLoaded.current.has(chatId)) {
      historyLoaded.current.add(chatId)
      client
        .getChatHistory(chatId, HISTORY_COUNT, signal)
        .then((items) => {
          const messages = items.map(historyToMessage).filter((m): m is Message => m !== null)
          dispatch({ type: 'historyLoaded', chatId, messages })
          // stateRef обновится только после рендера, поэтому решаем по пришедшей истории
          const incomingAt = lastIncomingAt(messages)
          if (incomingAt !== null) readChat(chatId, incomingAt)
        })
        .catch((error) => {
          historyLoaded.current.delete(chatId)
          if (!signal.aborted) console.warn('[history]', error)
        })
    }

    // getContactInfo не работает для групп
    const failedAt = contactFailedAt.current.get(chatId)
    const canRequestContact = failedAt === undefined || Date.now() - failedAt > CONTACT_RETRY_MS
    if (stateRef.current.chats[chatId]?.type !== 'group' && !contactLoaded.current.has(chatId) && canRequestContact) {
      contactLoaded.current.add(chatId)
      // getContactInfo сам вернёт аватар: пока он в пути, getAvatar из шапки чата не нужен
      const avatarPending = !avatarRequested.current.has(chatId)
      if (avatarPending) avatarRequested.current.add(chatId)
      client
        .getContactInfo(chatId, signal)
        .then((info) => {
          contactFailedAt.current.delete(chatId)
          dispatch({
            type: 'chatUpdated',
            chatId,
            patch: {
              title: info.contactName || info.name,
              avatar: info.avatar,
              username: info.username,
              phone: info.phoneNumber ? String(info.phoneNumber) : undefined,
              lastSeen: info.lastSeen ? info.lastSeen * 1000 : undefined,
              avatarCheckedAt: Date.now(),
            },
          })
        })
        .catch((error) => {
          contactLoaded.current.delete(chatId)
          if (avatarPending) avatarRequested.current.delete(chatId)
          if (signal.aborted) return
          console.warn('[contact]', error)
          contactFailedAt.current.set(chatId, Date.now())
          // Аватар из шапки мог быть пропущен, пока ждали getContactInfo
          ensureAvatar(chatId)
        })
    }

    markRead(chatId)
    return () => controller.abort()
  }, [activeChatId, client, dispatch, ensureAvatar, markRead, readChat, stateRef])

  // Вернулись на вкладку — открытый чат считается прочитанным
  useEffect(() => {
    const onVisible = () => {
      const chatId = stateRef.current.activeChatId
      if (!document.hidden && chatId && stateRef.current.chats[chatId]?.unread) markRead(chatId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [markRead, stateRef])

  return { ensureAvatar }
}
