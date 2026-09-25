import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { createGreenApiClient } from '../api/client'
import { createDemoClient } from '../api/demoClient'
import type { Credentials } from '../api/types'
import { useActiveChat } from '../hooks/useActiveChat'
import { useChatPersistence } from '../hooks/useChatPersistence'
import { useChatSync } from '../hooks/useChatSync'
import { useInstanceInfo } from '../hooks/useInstanceInfo'
import { useLatest } from '../hooks/useLatest'
import { useMessageActions } from '../hooks/useMessageActions'
import { useNotificationPolling, type ConnectionStatus } from '../hooks/useNotificationPolling'
import { useTabSync } from '../hooks/useTabSync'
import { useToasts } from '../hooks/useToasts'
import { errorMessage } from '../lib/errors'
import { MESSENGERS } from '../lib/messenger'
import type { ChatEvent } from '../lib/notifications'
import { createChatReader } from '../lib/readChat'
import { parseRecipient, toCheckAccountQuery } from '../lib/recipient'
import { loadChats } from '../lib/storage'
import { ChatActionsContext, ChatStateContext, type ChatActions, type ChatStateValue } from './chatContext'
import { chatReducer, type ChatAction } from './chatReducer'

interface Props {
  credentials: Credentials
  onLogout: () => void
  children: ReactNode
}

/**
 * Связывает клиент GREEN-API, reducer и фоновые процессы (опрос очереди, синхронизация чатов и вкладок)
 * и отдаёт компонентам два контекста: изменяемое состояние и стабильные действия.
 */
export function ChatProvider({ credentials, onLogout, children }: Props) {
  const { idInstance } = credentials
  const messenger = credentials.messenger ?? 'max'
  const client = useMemo(() => (credentials.demo ? createDemoClient() : createGreenApiClient(credentials)), [credentials])
  // Один на все места, где отмечается прочтение, — чтобы не слать readChat повторно по тем же сообщениям
  const readChat = useMemo(() => createChatReader((chatId) => client.readChat(chatId)), [client])

  const [state, localDispatch] = useReducer(chatReducer, idInstance, loadChats)
  const stateRef = useLatest(state)
  const { toasts, toast, dismissToast } = useToasts()
  // Чат открыт и виден в этой вкладке, а сообщение получила ведущая вкладка — прочтение отмечаем отсюда
  const onRemoteAction = useCallback(
    (action: ChatAction) => {
      if (action.type !== 'messageReceived' || action.message.direction !== 'in' || action.hidden) return
      if (stateRef.current.activeChatId === action.message.chatId) readChat(action.message.chatId, action.message.timestamp)
    },
    [readChat, stateRef],
  )
  const { dispatch, shareStatus, leaderStatus } = useTabSync(idInstance, localDispatch, onRemoteAction)
  const instance = useInstanceInfo(client, toast)
  const { setInstanceState } = instance

  const onQuotaExceeded = useCallback(
    () => toast('Не хватает места в браузере: история переписки не сохраняется между сессиями', 'error'),
    [toast],
  )
  const clearHistory = useChatPersistence(idInstance, state, onQuotaExceeded)

  // --- Уведомления из очереди ---

  const handleEvent = useCallback(
    (event: ChatEvent) => {
      switch (event.type) {
        case 'message': {
          const hidden = document.hidden
          dispatch({ type: 'messageReceived', message: event.message, chat: event.chat, hidden })
          const { chatId, direction } = event.message
          if (direction === 'in' && !hidden && stateRef.current.activeChatId === chatId) {
            readChat(chatId, event.message.timestamp)
          }
          break
        }
        case 'edited':
          dispatch({ type: 'messageEdited', chatId: event.chatId, messageId: event.messageId, text: event.text })
          break
        case 'deleted':
          dispatch({ type: 'messageDeleted', chatId: event.chatId, messageId: event.messageId })
          break
        case 'status':
          dispatch({ type: 'statusUpdated', chatId: event.chatId, messageId: event.messageId, status: event.status })
          break
        case 'state':
          setInstanceState(event.state)
          break
        case 'quota':
          toast(event.description, 'error')
          break
      }
    },
    [dispatch, readChat, setInstanceState, stateRef, toast],
  )

  const pollStatus = useNotificationPolling(client, `green-chat:poll:${idInstance}`, handleEvent)
  // Пока Web Lock не решён, вкладка ни ведущая, ни ведомая: ничего не публикуем и не синхронизируем
  const isLeader = pollStatus !== 'standby' && pollStatus !== 'pending'
  const baseConnection: ConnectionStatus =
    pollStatus === 'pending' ? 'connecting' : isLeader ? pollStatus : (leaderStatus ?? 'online')
  const connection: ConnectionStatus =
    baseConnection === 'reconnecting' && instance.restarting ? 'restarting' : baseConnection

  useEffect(() => {
    shareStatus(isLeader ? pollStatus : null)
  }, [isLeader, pollStatus, shareStatus])

  // --- Фоновые процессы и действия ---

  const { syncing, syncChats } = useChatSync({
    client,
    idInstance,
    dispatch,
    stateRef,
    enabled: isLeader && instance.instanceState === 'authorized',
  })
  const { ensureAvatar } = useActiveChat({
    client,
    dispatch,
    stateRef,
    activeChatId: state.activeChatId,
    readChat,
  })
  const messageActions = useMessageActions({ client, dispatch, stateRef, toast })

  const selectChat = useCallback((chatId: string | null) => dispatch({ type: 'chatSelected', chatId }), [dispatch])
  const deleteChat = useCallback((chatId: string) => dispatch({ type: 'chatDeleted', chatId }), [dispatch])

  /**
   * Номер телефона (или @username в Telegram) → chatId через checkAccount.
   * Входящие приходят с внутренним id пользователя, а не с номером, поэтому без этого шага ответы попали бы в другой чат.
   */
  const openChat = useCallback(
    async (input: string) => {
      const recipient = parseRecipient(input, messenger)
      const existing = Object.values(stateRef.current.chats).find((chat) =>
        recipient.kind === 'phone'
          ? chat.phone === recipient.phone
          : chat.username?.toLowerCase() === recipient.username.toLowerCase(),
      )
      if (existing) {
        dispatch({ type: 'chatSelected', chatId: existing.id })
        return
      }

      const result = await client.checkAccount(toCheckAccountQuery(recipient))
      const { name } = MESSENGERS[messenger]
      if (!result.exist || !result.chatId) {
        throw new Error(recipient.kind === 'phone' ? `Этот номер не зарегистрирован в ${name}` : `Пользователь не найден в ${name}`)
      }

      dispatch({
        type: 'chatOpened',
        chat: {
          id: result.chatId,
          phone: recipient.kind === 'phone' ? recipient.phone : result.phoneNumber ? String(result.phoneNumber) : undefined,
          username: recipient.kind === 'username' ? recipient.username : result.username,
          type: 'user',
        },
      })
    },
    [client, dispatch, messenger, stateRef],
  )

  const logout = useCallback(
    (options: { clearHistory?: boolean } = {}) => {
      if (options.clearHistory) clearHistory()
      onLogout()
    },
    [clearHistory, onLogout],
  )

  const unlinkAccount = useCallback(async () => {
    try {
      await client.logout()
      logout({ clearHistory: true })
    } catch (error) {
      toast(`Не удалось отвязать аккаунт: ${errorMessage(error)}`, 'error')
    }
  }, [client, logout, toast])

  // --- Контексты ---

  const { saveSettings, reloadSettings, uploadAvatar, rebootInstance } = instance
  const actions = useMemo<ChatActions>(
    () => ({
      ...messageActions,
      selectChat,
      openChat,
      deleteChat,
      ensureAvatar,
      syncChats,
      saveSettings,
      reloadSettings,
      uploadAvatar,
      rebootInstance,
      logout,
      unlinkAccount,
      toast,
      dismissToast,
    }),
    [
      messageActions,
      selectChat,
      openChat,
      deleteChat,
      ensureAvatar,
      syncChats,
      saveSettings,
      reloadSettings,
      uploadAvatar,
      rebootInstance,
      logout,
      unlinkAccount,
      toast,
      dismissToast,
    ],
  )

  const { account, instanceState, settings, settingsError } = instance
  const value = useMemo<ChatStateValue>(
    () => ({ state, credentials, messenger, account, instanceState, settings, settingsError, connection, syncing, toasts }),
    [state, credentials, messenger, account, instanceState, settings, settingsError, connection, syncing, toasts],
  )

  return (
    <ChatActionsContext.Provider value={actions}>
      <ChatStateContext.Provider value={value}>{children}</ChatStateContext.Provider>
    </ChatActionsContext.Provider>
  )
}
