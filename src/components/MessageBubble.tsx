import { memo, useRef, type MouseEvent, type PointerEvent } from 'react'
import { cn } from '../lib/cn'
import { formatTime } from '../lib/format'
import type { Message } from '../store/chatReducer'
import { MoreIcon, RetryIcon } from './icons'
import { MessageStatusIcon } from './MessageStatusIcon'

/** Положение в серии подряд идущих сообщений одного автора — от него зависят скругления и отступы */
export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

interface Props {
  message: Message
  position: BubblePosition
  /** Анимировать появление — только для сообщений, пришедших после открытия чата */
  animate: boolean
  onRetry: (id: string) => void
  onMenu: (message: Message, x: number, y: number) => void
}

const LONG_PRESS_MS = 450

export const MessageBubble = memo(function MessageBubble({ message, position, animate, onRetry, onMenu }: Props) {
  const out = message.direction === 'out'
  const failed = message.status === 'failed'
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const tail = position === 'single' || position === 'last'
  const head = position === 'single' || position === 'first'

  function openMenu(event: MouseEvent) {
    event.preventDefault()
    onMenu(message, event.clientX, event.clientY)
  }

  // Долгое нажатие на тач-экранах открывает то же меню, что и правый клик
  function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch') return
    const { clientX, clientY } = event
    pressTimer.current = setTimeout(() => onMenu(message, clientX, clientY), LONG_PRESS_MS)
  }
  const cancelPress = () => clearTimeout(pressTimer.current)

  return (
    <div
      className={cn(
        'group/msg flex flex-col',
        out ? 'items-end' : 'items-start',
        tail ? 'mb-2' : 'mb-0.5',
        animate && 'animate-bubble',
      )}
    >
      <div className={cn('flex max-w-[min(78%,560px)] items-center gap-1 max-sm:max-w-[88%]', out && 'flex-row-reverse')}>
        <div
          onContextMenu={openMenu}
          onPointerDown={onPointerDown}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerMove={cancelPress}
          className={cn(
            'relative min-w-0 rounded-[18px] px-3 py-1.5 text-[15px] leading-5 shadow-bubble select-text',
            out ? 'bg-bubble-out text-bubble-out-fg' : 'bg-bubble-in text-fg',
            // Угол со стороны автора "сжимается" у всех, кроме верхнего края первого сообщения серии
            out ? cn('rounded-br-md', !head && 'rounded-tr-md') : cn('rounded-bl-md', !head && 'rounded-tl-md'),
            failed && 'ring-1 ring-danger/50',
          )}
        >
          {message.author && head && (
            <p className="mb-0.5 truncate text-[13px] font-semibold text-accent">{message.author}</p>
          )}
          {message.media && (
            <p className={cn('text-[14px] italic', out ? 'text-bubble-out-muted' : 'text-muted')}>{message.media}</p>
          )}
          {message.text && (
            <span className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]" dir="auto">
              {message.text}
            </span>
          )}
          {/* Невидимый спейсер резервирует место под время, чтобы оно не наезжало на текст */}
          <span
            className={cn(
              'invisible inline-block h-3',
              out ? 'w-[4.5rem]' : 'w-12',
              message.edited && (out ? 'w-[8rem]' : 'w-[6.75rem]'),
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              'absolute right-2.5 bottom-1.5 flex items-center gap-1 text-xs leading-none tabular-nums',
              out ? 'text-bubble-out-muted' : 'text-muted',
            )}
          >
            {message.edited && <span>изменено</span>}
            <time dateTime={new Date(message.timestamp).toISOString()}>{formatTime(message.timestamp)}</time>
            {out && <MessageStatusIcon status={message.status} variant="bubble" />}
          </span>
        </div>

        <button
          onClick={(e) => onMenu(message, e.clientX, e.clientY)}
          aria-label="Действия с сообщением"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity group-hover/msg:opacity-100 hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 max-md:hidden"
        >
          <MoreIcon width={16} height={16} />
        </button>
      </div>

      {failed && (
        <button
          onClick={() => onRetry(message.id)}
          title={message.error}
          className="mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <RetryIcon width={13} height={13} />
          Не отправлено · Повторить
        </button>
      )}
    </div>
  )
})
