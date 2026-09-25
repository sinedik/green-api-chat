import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLatest } from '../hooks/useLatest'
import { formatDayDivider, isSameDay } from '../lib/format'
import type { Chat, Message } from '../store/chatReducer'
import { ArrowDownIcon, ChatBubbleIcon } from './icons'
import { MessageBubble, type BubblePosition } from './MessageBubble'

/** Сообщения одного автора с паузой меньше этого объединяются в серию */
const GROUP_WINDOW_MS = 5 * 60_000
/** Насколько можно отлистать от низа, чтобы новые сообщения всё ещё прокручивались автоматически */
const STICK_THRESHOLD_PX = 120
/** Анимируем только сообщения, появившиеся после открытия чата (с небольшим запасом на задержку сети) */
const ANIMATE_GRACE_MS = 2_000

function bubblePosition(messages: Message[], i: number): BubblePosition {
  const message = messages[i]
  const joins = (a?: Message, b?: Message) =>
    !!a &&
    !!b &&
    a.direction === b.direction &&
    a.author === b.author &&
    Math.abs(b.timestamp - a.timestamp) <= GROUP_WINDOW_MS &&
    isSameDay(a.timestamp, b.timestamp)
  const withPrev = joins(messages[i - 1], message)
  const withNext = joins(message, messages[i + 1])
  if (withPrev && withNext) return 'middle'
  if (withPrev) return 'last'
  if (withNext) return 'first'
  return 'single'
}

/** Сообщения, разбитые по дням; start — индекс первого сообщения дня в общем массиве */
function groupByDay(messages: Message[]) {
  const days: Array<{ day: number; start: number; items: Message[] }> = []
  messages.forEach((message, i) => {
    const current = days.at(-1)
    if (current && isSameDay(current.items[0].timestamp, message.timestamp)) current.items.push(message)
    else days.push({ day: new Date(message.timestamp).setHours(0, 0, 0, 0), start: i, items: [message] })
  })
  return days
}

interface Props {
  chat: Chat
  messengerName: string
  saved: boolean
  onRetry: (id: string) => void
  onMenu: (message: Message, x: number, y: number) => void
}

/** Лента сообщений: разделители дней, серии пузырей, автопрокрутка и кнопка «вниз» со счётчиком новых */
export function MessageList({ chat, messengerName, saved, onRetry, onMenu }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [mountedAt] = useState(() => Date.now())
  const [unseen, setUnseen] = useState(0)
  const [showJump, setShowJump] = useState(false)

  const last = chat.messages.at(-1)
  const lastRef = useLatest(last)
  // Ключ меняется только при появлении нового сообщения, а не при смене статуса последнего
  const lastKey = last ? (last.localId ?? last.id) : undefined
  const lastIncoming = chat.messages.findLast((m) => m.direction === 'in')

  // При открытии чата — сразу вниз (компонент пересоздаётся на каждый чат через key)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // Догрузилась история (сообщения добавились выше) — остаёмся у последнего сообщения без анимации
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [chat.messages.length])

  // Новое сообщение: прокручиваем, если пользователь внизу или это его сообщение, иначе копим счётчик
  useEffect(() => {
    const el = scrollRef.current
    const message = lastRef.current
    if (!el || !message || !lastKey) return
    if (stickToBottom.current || message.direction === 'out') {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    } else if (message.direction === 'in') {
      setUnseen((n) => n + 1)
    }
  }, [lastKey, lastRef])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottom.current = distance < STICK_THRESHOLD_PX
    setShowJump(distance > STICK_THRESHOLD_PX * 2)
    if (stickToBottom.current) setUnseen(0)
  }

  function jumpToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    setUnseen(0)
  }

  if (chat.messages.length === 0) {
    return (
      <div className="chat-pattern flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-panel text-muted shadow-sm">
          <ChatBubbleIcon width={28} height={28} />
        </div>
        <p className="text-[15px] font-medium">Здесь пока пусто</p>
        <p className="max-w-xs text-sm text-muted">
          {saved ? 'Здесь можно хранить заметки' : `Напишите первое сообщение в ${messengerName}`}
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-pattern scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3 md:px-6"
        role="log"
        aria-label="Сообщения"
      >
        <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end">
          {/* Каждый день — своя секция: липкая плашка даты не наезжает на плашки других дней */}
          {groupByDay(chat.messages).map(({ day, start, items }) => (
            <section key={day} aria-label={formatDayDivider(items[0].timestamp)}>
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-full bg-panel/85 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur-md">
                  {formatDayDivider(items[0].timestamp)}
                </span>
              </div>
              {items.map((message, j) => (
                <MessageBubble
                  key={message.localId ?? message.id}
                  message={message}
                  position={bubblePosition(chat.messages, start + j)}
                  animate={message.timestamp > mountedAt - ANIMATE_GRACE_MS}
                  onRetry={onRetry}
                  onMenu={onMenu}
                />
              ))}
            </section>
          ))}
        </div>
      </div>

      {showJump && (
        <button
          onClick={jumpToBottom}
          aria-label={unseen ? `Вниз, новых сообщений: ${unseen}` : 'Вниз'}
          className="absolute right-4 bottom-4 flex size-11 animate-[menu-in_150ms_ease-out] items-center justify-center rounded-full border border-line bg-panel text-muted shadow-lg shadow-black/20 transition-colors hover:bg-surface hover:text-fg"
        >
          <ArrowDownIcon />
          {unseen > 0 && (
            <span className="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-strong px-1.5 text-xs font-semibold text-white">
              {unseen > 99 ? '99+' : unseen}
            </span>
          )}
        </button>
      )}

      {/* Скринридеру объявляем только новые входящие, а не всю историю */}
      <p className="sr-only" aria-live="polite">
        {lastIncoming && lastIncoming.timestamp > mountedAt ? `Новое сообщение: ${lastIncoming.text || lastIncoming.media}` : ''}
      </p>
    </div>
  )
}
