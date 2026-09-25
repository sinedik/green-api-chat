import { useEffect, useRef, useState } from 'react'
import { chatTitle, isSavedMessages } from '../lib/chat'
import { cn } from '../lib/cn'
import type { Chat } from '../store/chatReducer'
import { useChatActions } from '../store/chatContext'
import { BookmarkIcon, UserIcon, UsersIcon } from './icons'

// Градиенты в духе аватаров MAX; цвет стабилен для одного и того же чата
const GRADIENTS = [
  'from-[#08d7f3] to-[#5398ff]',
  'from-[#bf97ff] to-[#526eff]',
  'from-[#ff48b6] to-[#ff8a35]',
  'from-[#14e1d5] to-[#03c722]',
  'from-[#ffc93d] to-[#ff832a]',
  'from-[#5ad1ff] to-[#7a5cff]',
]

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Инициалы только из букв: для номера телефона или "ID 123" вернёт '' и покажем иконку */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.match(/\p{L}/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
const SIZES: Record<AvatarSize, string> = {
  xs: 'size-8 text-xs',
  sm: 'size-10 text-sm',
  md: 'size-12 text-base',
  lg: 'size-20 text-2xl',
  xl: 'size-28 text-4xl',
}
const ICON_SIZES: Record<AvatarSize, number> = { xs: 16, sm: 20, md: 24, lg: 36, xl: 48 }

interface Props {
  seed: string
  name: string
  src?: string
  size?: AvatarSize
  kind?: 'user' | 'group' | 'saved'
  /** Показать иконку вместо инициалов — когда name не настоящее имя (например, «Инстанс 4100…») */
  icon?: boolean
  className?: string
}

export function Avatar({ seed, name, src, size = 'md', kind = 'user', icon, className }: Props) {
  const [broken, setBroken] = useState<string>()
  const classes = cn('shrink-0 rounded-full', SIZES[size], className)

  if (src && broken !== src && kind !== 'saved') {
    return <img src={src} alt="" className={cn(classes, 'bg-surface object-cover')} onError={() => setBroken(src)} />
  }

  const letters = kind === 'user' && !icon ? initials(name) : ''
  const Icon = kind === 'saved' ? BookmarkIcon : kind === 'group' ? UsersIcon : UserIcon
  return (
    <div
      aria-hidden="true"
      className={cn(
        classes,
        'flex items-center justify-center bg-gradient-to-br font-semibold text-white uppercase select-none',
        kind === 'saved' ? 'from-[#5398ff] to-[#2f6fef]' : GRADIENTS[hash(seed) % GRADIENTS.length],
      )}
    >
      {letters || <Icon width={ICON_SIZES[size]} height={ICON_SIZES[size]} />}
    </div>
  )
}

/** Аватар чата: аватар подгружается лениво, только когда строка чата появилась на экране */
export function ChatAvatar({ chat, selfId, size = 'md' }: { chat: Chat; selfId?: string; size?: AvatarSize }) {
  const { ensureAvatar } = useChatActions()
  const ref = useRef<HTMLDivElement>(null)
  const saved = isSavedMessages(chat, selfId)

  useEffect(() => {
    const el = ref.current
    if (!el || saved || chat.avatar) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        ensureAvatar(chat.id)
        observer.disconnect()
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [chat.id, chat.avatar, ensureAvatar, saved])

  return (
    <div ref={ref} className="shrink-0">
      <Avatar
        seed={chat.id}
        name={chatTitle(chat, selfId)}
        src={chat.avatar}
        size={size}
        kind={saved ? 'saved' : chat.type === 'group' ? 'group' : 'user'}
        icon={!chat.title && !chat.username}
      />
    </div>
  )
}
