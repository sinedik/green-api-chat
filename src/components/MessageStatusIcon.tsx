import { useState } from 'react'
import { cn } from '../lib/cn'
import type { MessageStatus } from '../store/chatReducer'
import { AlertIcon, CheckIcon, ClockIcon, DoubleCheckIcon } from './icons'

const STATUS_LABEL: Record<MessageStatus, string> = {
  pending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
}

interface Props {
  status?: MessageStatus
  /** bubble — внутри исходящего пузыря, list — в превью списка чатов */
  variant?: 'bubble' | 'list'
  className?: string
}

/** Часы → ✓ → ✓✓ → ✓✓ (цветные) → ошибка */
export function MessageStatusIcon({ status = 'sent', variant = 'bubble', className }: Props) {
  const label = STATUS_LABEL[status]
  // Смену статуса после монтирования подсвечиваем «пружинкой»; начальный статус не анимируем
  const [initial] = useState(status)
  const changed = status !== initial

  let icon
  switch (status) {
    case 'pending':
      icon = <ClockIcon />
      break
    case 'sent':
      icon = <CheckIcon />
      break
    case 'delivered':
      icon = <DoubleCheckIcon />
      break
    case 'read':
      icon = <DoubleCheckIcon strokeWidth={2.4} />
      break
    case 'failed':
      icon = <AlertIcon width={14} height={14} />
      break
  }

  const tone =
    status === 'failed'
      ? variant === 'bubble'
        ? 'text-bubble-out-danger'
        : 'text-danger'
      : status === 'read'
        ? variant === 'bubble'
          ? 'text-read'
          : 'text-accent'
        : variant === 'bubble'
          ? 'text-status'
          : undefined

  return (
    <span
      key={status}
      role="img"
      aria-label={label}
      title={label}
      className={cn('inline-flex', tone, changed && 'animate-[status-pop_260ms_ease-out]', className)}
    >
      {icon}
    </span>
  )
}
