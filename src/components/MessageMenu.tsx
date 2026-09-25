import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { canDelete, canEdit } from '../lib/messages'
import type { Message } from '../store/chatReducer'
import { CopyIcon, PencilIcon, TrashIcon } from './icons'

interface Props {
  message: Message
  x: number
  y: number
  onClose: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
}

export function MessageMenu({ message, x, y, onClose, onCopy, onEdit, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // Не даём меню вылезти за край экрана
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    })
    el.querySelector<HTMLButtonElement>('button')?.focus()
  }, [x, y])

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  const items = [
    message.text && { label: 'Копировать', icon: CopyIcon, action: onCopy },
    canEdit(message) && { label: 'Изменить', icon: PencilIcon, action: onEdit },
    canDelete(message) && { label: 'Удалить у всех', icon: TrashIcon, action: onDelete, danger: true },
  ].filter(Boolean) as Array<{ label: string; icon: typeof CopyIcon; action: () => void; danger?: boolean }>

  if (items.length === 0) return null

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Действия с сообщением"
      style={position}
      onKeyDown={(e) => {
        // Стрелки двигают фокус по пунктам меню
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const buttons = [...(ref.current?.querySelectorAll('button') ?? [])]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }}
      className="fixed z-40 min-w-52 origin-top-left animate-[menu-in_120ms_ease-out] rounded-2xl border border-line bg-panel p-1.5 shadow-xl shadow-black/25"
    >
      {items.map(({ label, icon: Icon, action, danger }) => (
        <button
          key={label}
          role="menuitem"
          onClick={() => {
            action()
            onClose()
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] outline-none transition-colors hover:bg-surface focus-visible:bg-surface max-md:min-h-11',
            danger && 'text-danger hover:bg-danger/10 focus-visible:bg-danger/10',
          )}
        >
          <Icon width={18} height={18} className={danger ? undefined : 'text-muted'} />
          {label}
        </button>
      ))}
    </div>
  )
}
