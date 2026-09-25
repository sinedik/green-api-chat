import { useState, type ReactNode } from 'react'
import { STATE_DESCRIPTIONS } from '../lib/chat'
import { cn } from '../lib/cn'
import { findSettingsProblems, REQUIRED_SETTINGS } from '../lib/settings'
import { useChatActions, useChatState } from '../store/chatContext'
import { AlertIcon, CloseIcon } from './icons'
import { Button, IconButton } from './ui'

/** Проблемы, из-за которых чат не работает: отозванный токен, неавторизованный инстанс, выключенные уведомления */
export function InstanceBanner() {
  const { instanceState, connection, settings, credentials } = useChatState()
  const { logout, saveSettings } = useChatActions()
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (credentials.demo) {
    if (dismissed) return null
    return (
      <Banner
        tone="info"
        onClose={() => setDismissed(true)}
        action={<BannerButton onClick={() => logout({ clearHistory: true })}>Войти со своим инстансом</BannerButton>}
      >
        <span className="font-medium">Демо-режим.</span> Чаты ненастоящие, Анна ответит на ваше сообщение.
      </Banner>
    )
  }

  if (connection === 'unauthorized') {
    return (
      <Banner tone="danger" action={<BannerButton onClick={() => logout()}>Войти заново</BannerButton>}>
        Токен больше не действует: его сменили в личном кабинете или инстанс удалён. Войдите заново.
      </Banner>
    )
  }

  if (instanceState && instanceState !== 'authorized') {
    return <Banner tone={instanceState === 'starting' ? 'warning' : 'danger'}>{STATE_DESCRIPTIONS[instanceState]}</Banner>
  }

  if (dismissed || !settings) return null

  if (saved) {
    return (
      <Banner tone="success" onClose={() => setDismissed(true)}>
        Настройки сохранены и заработают через пару минут.
      </Banner>
    )
  }

  const problems = findSettingsProblems(settings)
  if (problems.length === 0) return null
  const critical = problems.some((p) => p.critical)

  async function fix() {
    setSaving(true)
    const ok = await saveSettings(REQUIRED_SETTINGS)
    setSaving(false)
    if (ok) setSaved(true)
  }

  return (
    <Banner
      tone={critical ? 'warning' : 'info'}
      onClose={() => setDismissed(true)}
      action={
        <BannerButton onClick={fix} loading={saving}>
          Настроить
        </BannerButton>
      }
    >
      <span className="font-medium">{critical ? 'Сообщения не будут приходить: ' : 'Не всё настроено: '}</span>
      {problems.map((p) => p.text).join('; ')}.
    </Banner>
  )
}

const TONES = {
  danger: 'bg-danger/12 [&_.banner-icon]:text-danger',
  warning: 'bg-warning/12 [&_.banner-icon]:text-warning',
  info: 'bg-accent/10 [&_.banner-icon]:text-accent',
  success: 'bg-success/12 [&_.banner-icon]:text-success',
}

function Banner({
  tone,
  action,
  onClose,
  children,
}: {
  tone: keyof typeof TONES
  action?: ReactNode
  onClose?: () => void
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex shrink-0 animate-[toast-in_200ms_ease-out] items-center gap-3 border-b border-line px-4 py-2 text-[13px] leading-[18px] max-md:px-3',
        TONES[tone],
      )}
    >
      <AlertIcon className="banner-icon shrink-0" width={18} height={18} />
      <p className="line-clamp-2 min-w-0 flex-1">{children}</p>
      {action}
      {onClose && (
        <IconButton onClick={onClose} aria-label="Скрыть" className="-mr-2 size-8 max-md:size-10">
          <CloseIcon width={16} height={16} />
        </IconButton>
      )}
    </div>
  )
}

function BannerButton({ onClick, loading, children }: { onClick: () => void; loading?: boolean; children: ReactNode }) {
  return (
    <Button onClick={onClick} loading={loading} className="h-8 shrink-0 rounded-lg px-3 text-[13px]">
      {children}
    </Button>
  )
}
