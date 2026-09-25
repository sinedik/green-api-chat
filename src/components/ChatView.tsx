import { useCallback, useState } from 'react'
import { chatSubtitle, chatTitle, isSavedMessages } from '../lib/chat'
import { cn } from '../lib/cn'
import { MESSENGERS } from '../lib/messenger'
import type { Chat, Message } from '../store/chatReducer'
import { useChatActions, useChatState } from '../store/chatContext'
import { ChatAvatar } from './Avatar'
import { Composer } from './Composer'
import { BackIcon, InfoIcon, TrashIcon } from './icons'
import { MessageList } from './MessageList'
import { MessageMenu } from './MessageMenu'
import { ConfirmDialog, IconButton } from './ui'

interface Props {
  chat: Chat
  onOpenInfo: () => void
}

export function ChatView({ chat, onOpenInfo }: Props) {
  const { messenger, account } = useChatState()
  const { sendMessage, retryMessage, editMessage, deleteMessage, deleteChat, selectChat, notifyTyping, toast } =
    useChatActions()
  const { name, maxLength } = MESSENGERS[messenger]
  const selfId = account?.chatId
  const title = chatTitle(chat, selfId)
  const subtitle = chatSubtitle(chat, name, selfId)
  const online = subtitle === 'в сети'

  const [menu, setMenu] = useState<{ message: Message; x: number; y: number } | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null)
  const [deletingChat, setDeletingChat] = useState(false)
  const [busy, setBusy] = useState(false)

  const chatId = chat.id
  const handleSend = useCallback((text: string) => sendMessage(chatId, text), [sendMessage, chatId])
  const handleTyping = useCallback(() => notifyTyping(chatId), [notifyTyping, chatId])
  const handleRetry = useCallback((id: string) => retryMessage(chatId, id), [retryMessage, chatId])
  const handleMenu = useCallback((message: Message, x: number, y: number) => setMenu({ message, x, y }), [])
  const closeMenu = useCallback(() => setMenu(null), [])

  /** Назад к списку — и фокус на строку этого чата, чтобы клавиатурная навигация не терялась */
  const goBack = useCallback(() => {
    selectChat(null)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(chatId)}"]`)?.focus())
  }, [selectChat, chatId])

  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(message.text)
      toast('Текст скопирован', 'success')
    } catch {
      toast('Не удалось скопировать', 'error')
    }
  }

  async function confirmDeleteMessage() {
    if (!deletingMessage) return
    setBusy(true)
    await deleteMessage(chatId, deletingMessage.id)
    setBusy(false)
    setDeletingMessage(null)
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col max-md:animate-[slide-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]"
      aria-label={`Чат: ${title}`}
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 md:px-4">
        <IconButton onClick={goBack} aria-label="Закрыть чат" title="Закрыть чат">
          <BackIcon />
        </IconButton>
        <button
          onClick={onOpenInfo}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-surface focus-visible:-outline-offset-2"
          aria-label={`Информация о чате ${title}`}
        >
          <ChatAvatar chat={chat} selfId={selfId} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[17px] leading-6 font-semibold">{title}</span>
            <span className={cn('block truncate text-[13px]', online ? 'text-accent' : 'text-muted')}>{subtitle}</span>
          </span>
        </button>
        <IconButton onClick={onOpenInfo} aria-label="Информация" title="Информация" className="max-md:hidden">
          <InfoIcon />
        </IconButton>
        <IconButton
          onClick={() => setDeletingChat(true)}
          aria-label="Удалить чат из списка"
          title="Удалить чат из списка"
          className="hover:text-danger"
        >
          <TrashIcon width={18} height={18} />
        </IconButton>
      </header>

      <MessageList
        chat={chat}
        messengerName={name}
        saved={isSavedMessages(chat, selfId)}
        onRetry={handleRetry}
        onMenu={handleMenu}
      />

      <Composer
        chatId={chatId}
        maxLength={maxLength}
        onSend={handleSend}
        onTyping={handleTyping}
        editing={editing}
        onEditSubmit={(text) => {
          if (editing) void editMessage(chatId, editing.id, text)
          setEditing(null)
        }}
        onEditCancel={() => setEditing(null)}
        onEscape={goBack}
      />

      {menu && (
        <MessageMenu
          message={menu.message}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onCopy={() => copy(menu.message)}
          onEdit={() => setEditing(menu.message)}
          onDelete={() => setDeletingMessage(menu.message)}
        />
      )}

      <ConfirmDialog
        open={!!deletingMessage}
        title="Удалить сообщение?"
        description={`Сообщение удалится у вас и у собеседника в ${name}.`}
        confirmLabel="Удалить"
        danger
        loading={busy}
        onConfirm={confirmDeleteMessage}
        onClose={() => setDeletingMessage(null)}
      />

      <ConfirmDialog
        open={deletingChat}
        title="Удалить чат из списка?"
        description={`Чат «${title}» пропадёт из списка. Переписка в ${name} сохранится.`}
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          setDeletingChat(false)
          deleteChat(chatId)
        }}
        onClose={() => setDeletingChat(false)}
      />
    </section>
  )
}
