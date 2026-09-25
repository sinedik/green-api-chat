import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionStatus } from '../hooks/useNotificationPolling'
import { accountName, chatTitle } from '../lib/chat'
import { cn } from '../lib/cn'
import { formatChatTime } from '../lib/format'
import { formatPhone } from '../lib/phone'
import { sortedChats, type Chat } from '../store/chatReducer'
import { useChatActions, useChatState } from '../store/chatContext'
import { Avatar, ChatAvatar } from './Avatar'
import { ChatBubbleIcon, CloseIcon, PlusIcon, SearchIcon, SettingsIcon } from './icons'
import { MessageStatusIcon } from './MessageStatusIcon'
import { NewChatForm } from './NewChatForm'
import { Button, IconButton, Spinner } from './ui'

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  pending: 'Подключение…',
  connecting: 'Подключение…',
  online: 'В сети',
  standby: 'В сети',
  reconnecting: 'Переподключение…',
  restarting: 'Инстанс перезапускается…',
  offline: 'Нет подключения к интернету',
  unauthorized: 'Ошибка авторизации',
}

export function Sidebar({ className, onOpenProfile }: { className?: string; onOpenProfile: () => void }) {
  const { state, account, credentials, connection, syncing } = useChatState()
  const { selectChat } = useChatActions()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  /** Форма остаётся в DOM, пока доигрывает анимация сворачивания */
  const [formMounted, setFormMounted] = useState(false)
  /** Новый key при каждом открытии — форма всегда стартует пустой, даже если не успела размонтироваться */
  const [formKey, setFormKey] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const newChatButtonRef = useRef<HTMLButtonElement>(null)
  const selfId = account?.chatId

  const chats = useMemo(() => {
    const all = sortedChats(state)
    const q = query.trim().toLowerCase()
    if (!q) return all
    const digits = q.replace(/\D/g, '')
    return all.filter(
      (chat) =>
        chatTitle(chat, selfId).toLowerCase().includes(q) ||
        chat.username?.toLowerCase().includes(q) ||
        (digits.length >= 3 && chat.phone?.includes(digits)),
    )
  }, [state, query, selfId])

  // Ctrl/Cmd+K — к поиску
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const displayName = accountName(account, credentials.idInstance)
  const statusLabel = connection === 'online' && syncing ? 'Синхронизация чатов…' : CONNECTION_LABEL[connection]

  function openNewChat() {
    setFormMounted(true)
    setFormKey((k) => k + 1)
    setCreating(true)
  }

  function closeNewChat() {
    setCreating(false)
    newChatButtonRef.current?.focus()
  }

  return (
    <aside className={cn('flex min-h-0 flex-col border-r border-line bg-panel', className)}>
      <header className="flex h-16 shrink-0 items-center gap-3 px-3">
        <button
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-surface focus-visible:-outline-offset-2"
          aria-label="Профиль и настройки"
        >
          <Avatar
            seed={credentials.idInstance}
            name={displayName}
            src={account?.avatar}
            size="sm"
            icon={!account?.username}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-5 font-semibold">{displayName}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  (connection === 'online' || connection === 'standby') && 'bg-success',
                  connection === 'connecting' && 'animate-pulse bg-warning',
                  (connection === 'reconnecting' || connection === 'offline') && 'animate-pulse bg-danger',
                  connection === 'unauthorized' && 'bg-danger',
                )}
              />
              <span className="truncate">{statusLabel}</span>
            </span>
          </span>
        </button>
        <IconButton onClick={onOpenProfile} aria-label="Настройки" title="Настройки">
          <SettingsIcon />
        </IconButton>
      </header>

      <div className="flex items-center gap-2 px-3 pb-3">
        <label className="relative flex-1">
          <span className="sr-only">Поиск по чатам</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" width={18} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            className="h-10 w-full rounded-xl bg-surface pr-9 pl-10 text-[15px] transition-shadow outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/60 max-md:h-11 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              aria-label="Очистить поиск"
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-fg"
            >
              <CloseIcon width={16} height={16} />
            </button>
          )}
        </label>
        <IconButton
          ref={newChatButtonRef}
          onClick={() => (creating ? closeNewChat() : openNewChat())}
          aria-label={creating ? 'Закрыть форму нового чата' : 'Новый чат'}
          title="Новый чат"
          aria-expanded={creating}
          aria-controls="new-chat-form"
          className={cn(
            'bg-accent-strong text-white hover:bg-accent-strong-hover hover:text-white focus-visible:outline-offset-2 [&>svg]:transition-transform [&>svg]:duration-200',
            creating && '[&>svg]:rotate-45',
          )}
        >
          <PlusIcon />
        </IconButton>
      </div>

      {/* Плавное раскрытие формы: grid-rows 0fr → 1fr */}
      <div
        id="new-chat-form"
        inert={!creating}
        onTransitionEnd={(e) => e.target === e.currentTarget && !creating && setFormMounted(false)}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          creating ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">{formMounted && <NewChatForm key={formKey} onClose={closeNewChat} />}</div>
      </div>

      <nav aria-label="Чаты" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {chats.length === 0 ? (
          syncing && !query ? (
            <div className="flex justify-center py-10 text-muted">
              <Spinner className="size-5" />
            </div>
          ) : (
            <EmptyList searching={!!query.trim()} onCreate={openNewChat} />
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => (
              <li key={chat.id}>
                <ChatItem chat={chat} active={chat.id === state.activeChatId} selfId={selfId} onSelect={selectChat} />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  )
}

const ChatItem = memo(function ChatItem({
  chat,
  active,
  selfId,
  onSelect,
}: {
  chat: Chat
  active: boolean
  selfId?: string
  onSelect: (chatId: string) => void
}) {
  const title = chatTitle(chat, selfId)
  const last = chat.messages.at(-1)
  const unread = chat.unread > 0

  return (
    <button
      onClick={() => onSelect(chat.id)}
      data-chat-id={chat.id}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        active ? 'bg-accent/15 hover:bg-accent/20' : 'hover:bg-surface active:bg-surface-hover',
      )}
    >
      <ChatAvatar chat={chat} selfId={selfId} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[15px] leading-5', unread ? 'font-semibold' : 'font-medium')}>{title}</span>
          {last && (
            <time className={cn('shrink-0 text-xs tabular-nums', unread ? 'font-medium text-accent' : 'text-muted')}>
              {formatChatTime(last.timestamp)}
            </time>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={cn(
              'flex min-w-0 items-center gap-1 text-sm leading-5',
              last?.status === 'failed' ? 'text-danger' : unread ? 'text-fg/80' : 'text-muted',
            )}
          >
            {last?.direction === 'out' && <MessageStatusIcon status={last.status} variant="list" className="shrink-0" />}
            <span className="truncate" dir="auto">
              {last ? (
                <>
                  {last.author && <span className="text-fg/80">{last.author}: </span>}
                  {last.media && <span className="text-accent">{last.media}</span>}
                  {last.media && last.text ? ', ' : ''}
                  {last.text}
                </>
              ) : (
                chat.username || (chat.phone ? formatPhone(chat.phone) : '')
              )}
            </span>
          </span>
          {unread && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-strong px-1.5 text-xs font-semibold text-white tabular-nums">
              <span className="sr-only">Непрочитанных: </span>
              {chat.unread > 99 ? '99+' : chat.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
})

function EmptyList({ searching, onCreate }: { searching: boolean; onCreate: () => void }) {
  if (searching) return <p className="px-4 py-10 text-center text-sm text-muted">Ничего не найдено</p>
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-surface text-muted">
        <ChatBubbleIcon width={26} height={26} />
      </div>
      <p className="text-[15px] font-medium">Чатов пока нет</p>
      <p className="mt-1 text-sm text-muted">Начните переписку по номеру телефона</p>
      <Button onClick={onCreate} className="mt-5 h-10 px-4 text-sm">
        <PlusIcon width={18} height={18} />
        Новый чат
      </Button>
    </div>
  )
}
