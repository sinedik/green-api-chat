import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { isAbortError, type GreenApiClient } from '../api/client'
import type { RemoteChat } from '../api/types'
import { historyToMessage } from '../lib/notifications'
import { withRetry } from '../lib/retry'
import { loadPreviewsAt, savePreviewsAt } from '../lib/storage'
import type { ChatAction, ChatMeta, ChatState, Message } from '../store/chatReducer'
import { useLifetimeSignal } from './useLifetimeSignal'

const SYNC_INTERVAL_MS = 60_000
const SYNC_ON_FOCUS_AFTER_MS = 15_000
/** За сколько минут брать последние сообщения для превью в списке чатов */
export const PREVIEW_WINDOW_MIN = 7 * 24 * 60
/** Запас к окну превью: часы клиента и сервера могут расходиться */
const PREVIEW_OVERLAP_MIN = 10

/**
 * Окно журналов при старте. Если превью уже грузили раньше (и история сохранена), всё более старое
 * уже есть локально — берём только время с прошлой загрузки. Неделя журналов может весить мегабайты.
 */
export function previewWindowMinutes(previewsAt: number | null, now: number): number {
  if (previewsAt === null || previewsAt > now) return PREVIEW_WINDOW_MIN
  return Math.min(PREVIEW_WINDOW_MIN, Math.ceil((now - previewsAt) / 60_000) + PREVIEW_OVERLAP_MIN)
}

/** Из журналов входящих и исходящих оставляем по одному, самому свежему сообщению на чат */
function latestPerChat(items: Message[]): Message[] {
  const latest = new Map<string, Message>()
  for (const message of items) {
    const current = latest.get(message.chatId)
    if (!current || message.timestamp > current.timestamp) latest.set(message.chatId, message)
  }
  return [...latest.values()]
}

function remoteChatToMeta(chat: RemoteChat): ChatMeta {
  return {
    id: chat.chatId,
    title: chat.name || undefined,
    phone: chat.phoneNumber ? String(chat.phoneNumber) : undefined,
    username: chat.username || undefined,
    type: chat.type === 'group' || chat.type === 'supergroup' ? 'group' : 'user',
  }
}

interface Options {
  client: GreenApiClient
  idInstance: string
  dispatch: (action: ChatAction) => void
  stateRef: RefObject<ChatState>
  /** Синхронизирует только ведущая вкладка и только авторизованный инстанс */
  enabled: boolean
}

/**
 * Синхронизация списка чатов с мессенджером через getChats: при старте, раз в минуту и при возврате на вкладку.
 * Отдельного уведомления об удалении чата в API нет — reducer удаляет чаты, пропавшие из списка.
 *
 * После первой синхронизации подтягиваются последние сообщения (lastIncoming/lastOutgoingMessages; неделя
 * или время с прошлой загрузки, см. previewWindowMinutes):
 * два запроса вместо getChatHistory на каждый чат дают превью и правильный порядок списка.
 * Полная история чата грузится при его открытии (useActiveChat).
 */
export function useChatSync({ client, idInstance, dispatch, stateRef, enabled }: Options) {
  const [syncing, setSyncing] = useState(false)
  const inProgress = useRef(false)
  const lastSync = useRef(0)
  const previewsLoaded = useRef(false)
  const getSignal = useLifetimeSignal(client)

  const syncChats = useCallback(async () => {
    if (inProgress.current) return
    inProgress.current = true
    setSyncing(true)
    const signal = getSignal()
    try {
      const remote = await withRetry(() => client.getChats(signal), signal)
      lastSync.current = Date.now()
      // Пустой ответ при непустой истории — скорее сбой, чем удаление всех чатов: список не трогаем
      if (remote.length === 0 && Object.values(stateRef.current.chats).some((c) => c.synced)) return
      dispatch({ type: 'chatsSynced', chats: remote.filter((c) => c.type !== 'channel').map(remoteChatToMeta) })

      if (!previewsLoaded.current) {
        const startedAt = Date.now()
        // Без сохранённой истории отметке о прошлой загрузке не верим — берём всю неделю
        const hasHistory = Object.values(stateRef.current.chats).some((c) => c.messages.length > 0)
        const minutes = previewWindowMinutes(hasHistory ? loadPreviewsAt(idInstance) : null, startedAt)
        const [incoming, outgoing] = await Promise.all([
          client.lastIncomingMessages(minutes, signal),
          client.lastOutgoingMessages(minutes, signal),
        ])
        const messages = [...incoming, ...outgoing].map(historyToMessage).filter((m): m is Message => m !== null)
        dispatch({ type: 'previewsLoaded', messages: latestPerChat(messages) })
        for (const item of incoming) {
          const chat = stateRef.current.chats[item.chatId]
          if (chat && !chat.title && item.senderName && item.chatType === 'user') {
            dispatch({ type: 'chatUpdated', chatId: item.chatId, patch: { title: item.senderName } })
          }
        }
        previewsLoaded.current = true
        savePreviewsAt(idInstance, startedAt)
      }
    } catch (error) {
      if (!isAbortError(error) && !signal.aborted) console.warn('[sync]', error)
    } finally {
      inProgress.current = false
      setSyncing(false)
    }
  }, [client, dispatch, getSignal, idInstance, stateRef])

  useEffect(() => {
    if (!enabled) return
    const sinceSync = () => Date.now() - lastSync.current
    // Повторное включение (смена ведущей вкладки, статус инстанса мигнул) не должно дёргать getChats сразу снова
    if (sinceSync() > SYNC_ON_FOCUS_AFTER_MS) void syncChats()
    // Если только что синхронизировались при возврате на вкладку — тик интервала пропускаем
    const timer = setInterval(
      () => !document.hidden && sinceSync() > SYNC_INTERVAL_MS / 2 && syncChats(),
      SYNC_INTERVAL_MS,
    )
    const onVisible = () => {
      if (!document.hidden && sinceSync() > SYNC_ON_FOCUS_AFTER_MS) void syncChats()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, syncChats])

  return { syncing, syncChats }
}
