import type { ReactNode } from 'react'
import { chatSubtitle, chatTitle, isSavedMessages } from '../lib/chat'
import { cn } from '../lib/cn'
import { MESSENGERS } from '../lib/messenger'
import { formatPhone } from '../lib/phone'
import type { Chat } from '../store/chatReducer'
import { useChatActions, useChatState } from '../store/chatContext'
import { ChatAvatar } from './Avatar'
import { AtIcon, CloseIcon, CopyIcon, HashIcon, PhoneIcon } from './icons'
import { IconButton } from './ui'

/** Панель «О собеседнике»: справа на десктопе, поверх чата на мобильных */
export function ContactPanel({ chat, onClose, className }: { chat: Chat; onClose: () => void; className?: string }) {
  const { messenger, account } = useChatState()
  const selfId = account?.chatId
  const { name } = MESSENGERS[messenger]
  const title = chatTitle(chat, selfId)
  const subtitle = chatSubtitle(chat, name, selfId)

  return (
    <aside
      aria-label="Информация о чате"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className={cn('flex min-h-0 flex-col border-l border-line bg-panel', className)}
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3">
        <IconButton onClick={onClose} aria-label="Закрыть информацию" autoFocus>
          <CloseIcon />
        </IconButton>
        <h2 className="text-[17px] font-semibold">{chat.type === 'group' ? 'О группе' : 'О контакте'}</h2>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
          <ChatAvatar chat={chat} selfId={selfId} size="xl" />
          <p className="mt-4 max-w-full text-xl font-semibold break-words [overflow-wrap:anywhere]">{title}</p>
          <p className={cn('mt-1 text-sm', subtitle === 'в сети' ? 'text-accent' : 'text-muted')}>{subtitle}</p>
        </div>

        {!isSavedMessages(chat, selfId) && (
          <dl className="mx-3 overflow-hidden rounded-2xl bg-surface/60">
            {chat.phone && (
              <InfoRow icon={<PhoneIcon width={20} height={20} />} label="Телефон" value={formatPhone(chat.phone)} copy={`+${chat.phone}`} />
            )}
            {chat.username && (
              <InfoRow icon={<AtIcon width={20} height={20} />} label="Имя пользователя" value={chat.username} copy={chat.username} />
            )}
            <InfoRow icon={<HashIcon width={20} height={20} />} label={`${name} ID`} value={chat.id} copy={chat.id} />
          </dl>
        )}

      </div>
    </aside>
  )
}

function InfoRow({ icon, label, value, copy }: { icon: ReactNode; label: string; value: string; copy: string }) {
  const { toast } = useChatActions()

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copy)
      toast(`${label}: скопировано`, 'success')
    } catch {
      toast('Не удалось скопировать', 'error')
    }
  }

  return (
    <div className="group/row flex items-center gap-4 px-4 py-3 not-last:border-b not-last:border-line">
      <span className="shrink-0 text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <dd className="truncate text-[15px] leading-5" title={value}>
          {value}
        </dd>
        <dt className="text-[13px] text-muted">{label}</dt>
      </div>
      <button
        onClick={handleCopy}
        aria-label={`Скопировать: ${label}`}
        title="Скопировать"
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-[opacity,background-color] group-hover/row:opacity-100 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 max-md:size-11 max-md:opacity-100"
      >
        <CopyIcon width={16} height={16} />
      </button>
    </div>
  )
}
