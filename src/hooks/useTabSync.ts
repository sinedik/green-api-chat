import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import type { ChatAction } from '../store/chatReducer'
import { useLatest } from './useLatest'
import type { ConnectionStatus } from './useNotificationPolling'

/** Сообщения между вкладками одного инстанса */
type ChannelMessage =
  | { kind: 'action'; action: ChatAction }
  | { kind: 'connection'; status: ConnectionStatus }
  | { kind: 'hello' }

/** Какие действия пересылать другим вкладкам: выбор чата у каждой вкладки свой, но прочтение — общее */
function toRemote(action: ChatAction): ChatAction | null {
  if (action.type === 'chatSelected') return action.chatId ? { type: 'chatRead', chatId: action.chatId } : null
  if (action.type === 'chatOpened') return { ...action, select: false }
  return action
}

/**
 * Синхронизация вкладок через BroadcastChannel. Очередь уведомлений опрашивает одна вкладка
 * (см. useNotificationPolling), поэтому изменения состояния рассылаются остальным вкладкам,
 * а ведущая вкладка сообщает им статус соединения.
 *
 * - `dispatch` применяет действие локально и рассылает его другим вкладкам;
 * - `shareStatus` — ведущая вкладка публикует свой статус соединения;
 * - `leaderStatus` — статус, полученный от ведущей вкладки (для вкладок в standby);
 * - `onRemoteAction` вызывается для каждого действия из другой вкладки (например, чтобы отметить прочтение).
 */
export function useTabSync(
  idInstance: string,
  localDispatch: Dispatch<ChatAction>,
  onRemoteAction?: (action: ChatAction) => void,
) {
  const channelRef = useRef<BroadcastChannel | null>(null)
  const onRemoteActionRef = useLatest(onRemoteAction)
  const ownStatus = useRef<ConnectionStatus | null>(null)
  const [leaderStatus, setLeaderStatus] = useState<ConnectionStatus | null>(null)

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const channel = new BroadcastChannel(`green-chat:${idInstance}`)
    channelRef.current = channel
    channel.onmessage = ({ data }: MessageEvent<ChannelMessage>) => {
      if (data.kind === 'action') {
        // Прочитано ли сообщение — решает вкладка-получатель по своему активному чату
        const action = data.action.type === 'messageReceived' ? { ...data.action, hidden: document.hidden } : data.action
        localDispatch(action)
        onRemoteActionRef.current?.(action)
      } else if (data.kind === 'connection') {
        setLeaderStatus(data.status)
      } else if (data.kind === 'hello' && ownStatus.current) {
        channel.postMessage({ kind: 'connection', status: ownStatus.current } satisfies ChannelMessage)
      }
    }
    channel.postMessage({ kind: 'hello' } satisfies ChannelMessage)
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [idInstance, localDispatch, onRemoteActionRef])

  const dispatch = useCallback(
    (action: ChatAction) => {
      localDispatch(action)
      const remote = toRemote(action)
      if (remote) channelRef.current?.postMessage({ kind: 'action', action: remote } satisfies ChannelMessage)
    },
    [localDispatch],
  )

  const shareStatus = useCallback((status: ConnectionStatus | null) => {
    ownStatus.current = status
    if (status) channelRef.current?.postMessage({ kind: 'connection', status } satisfies ChannelMessage)
  }, [])

  return { dispatch, shareStatus, leaderStatus }
}
