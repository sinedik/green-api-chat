import type { Messenger } from '../lib/messenger'
import { cn } from '../lib/cn'

const ICONS: Record<Messenger, string> = {
  max: './brands/max.png',
  telegram: './brands/telegram.svg',
}

/** Официальный знак мессенджера (MAX — иконка приложения с web.max.ru, Telegram — фирменный самолётик) */
export function MessengerIcon({ messenger, className }: { messenger: Messenger; className?: string }) {
  return (
    <img
      src={ICONS[messenger]}
      alt=""
      aria-hidden="true"
      className={cn('size-4 shrink-0', messenger === 'max' ? 'rounded-[4px]' : 'rounded-full', className)}
    />
  )
}
