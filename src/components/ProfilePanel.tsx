import { useRef, useState, type ReactNode } from 'react'
import type { InstanceSettings } from '../api/types'
import { accountName, STATE_LABELS } from '../lib/chat'
import { cn } from '../lib/cn'
import { MESSENGERS } from '../lib/messenger'
import { formatPhone } from '../lib/phone'
import { findSettingsProblems, REQUIRED_SETTINGS, SETTINGS_TOGGLES } from '../lib/settings'
import { useChatActions, useChatState } from '../store/chatContext'
import { Avatar } from './Avatar'
import { MessengerIcon } from './MessengerIcon'
import { BackIcon, CameraIcon, LogoutIcon, PowerIcon, RefreshIcon } from './icons'
import { PoweredBy } from './PoweredBy'
import { Button, ConfirmDialog, IconButton, Spinner, Switch } from './ui'

type Dialog = 'logout' | 'unlink' | 'reboot' | null

/** Профиль аккаунта и управление инстансом GREEN-API (открывается вместо списка чатов) */
export function ProfilePanel({ onClose, className }: { onClose: () => void; className?: string }) {
  const { account, credentials, messenger, instanceState, settings, settingsError, syncing } = useChatState()
  const { uploadAvatar, saveSettings, reloadSettings, rebootInstance, syncChats, logout, unlinkAccount } = useChatActions()
  const { name } = MESSENGERS[messenger]

  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [clearHistory, setClearHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  const displayName = accountName(account, credentials.idInstance)
  const problems = settings ? findSettingsProblems(settings) : []

  async function onFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    await uploadAvatar(file)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function toggle(key: keyof InstanceSettings, value: boolean) {
    setSavingKey(key)
    await saveSettings({ [key]: value ? 'yes' : 'no' })
    setSavingKey(null)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    await action()
    setBusy(false)
    setDialog(null)
  }

  return (
    <aside aria-label="Профиль" className={cn('flex min-h-0 flex-col bg-panel', className)}>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3">
        <IconButton onClick={onClose} aria-label="Назад к чатам" autoFocus>
          <BackIcon />
        </IconButton>
        <h2 className="text-[17px] font-semibold">Профиль</h2>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-6">
        {/* Аватар и имя */}
        <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
          <div className="relative">
            <Avatar
              seed={credentials.idInstance}
              name={displayName}
              src={account?.avatar}
              size="xl"
              icon={!account?.username}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Изменить фото профиля"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
            >
              {uploading ? <Spinner className="size-6" /> : <CameraIcon width={28} height={28} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <p className="mt-4 max-w-full truncate text-xl font-semibold">{displayName}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-surface py-1 pr-2.5 pl-1.5 text-xs font-medium text-fg">
              <MessengerIcon messenger={messenger} />
              {name}
            </span>
            {instanceState && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  instanceState === 'authorized' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
                )}
              >
                {STATE_LABELS[instanceState]}
              </span>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-3 rounded-lg px-2 py-1 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
          >
            Изменить фото
          </button>
        </div>

        <Section title="Аккаунт">
          <Row label="Телефон" value={account?.phone ? formatPhone(account.phone) : '—'} />
          {account?.username && <Row label="Имя пользователя" value={account.username} />}
          <Row label={`${name} ID`} value={account?.chatId || '—'} />
          <Row label="idInstance" value={credentials.idInstance} />
          <Row label="apiUrl" value={credentials.apiUrl.replace(/^https?:\/\//, '')} />
        </Section>

        <Section
          title="Уведомления инстанса"
          action={
            problems.length > 0 && (
              <button
                onClick={() => saveSettings(REQUIRED_SETTINGS)}
                className="-my-1 rounded-lg px-2 py-1 text-[13px] font-medium text-accent transition-colors hover:bg-accent/10"
              >
                Включить всё нужное
              </button>
            )
          }
        >
          {settings ? (
            SETTINGS_TOGGLES.map(({ key, label, hint }) => (
              <Switch
                key={key}
                label={label}
                hint={hint}
                checked={settings[key] === 'yes'}
                disabled={savingKey !== null}
                onChange={(value) => toggle(key, value)}
              />
            ))
          ) : settingsError ? (
            <div className="flex flex-col items-center gap-2 px-4 py-5 text-center text-[14px] text-muted">
              Не удалось загрузить настройки инстанса
              <button onClick={reloadSettings} className="font-medium text-accent hover:underline">
                Повторить
              </button>
            </div>
          ) : (
            <div className="flex justify-center py-6 text-muted">
              <Spinner />
            </div>
          )}
        </Section>

        <Section title="Инстанс">
          <ActionRow icon={<RefreshIcon />} label="Синхронизировать чаты" onClick={syncChats} loading={syncing} />
          <ActionRow icon={<PowerIcon />} label="Перезапустить инстанс" onClick={() => setDialog('reboot')} />
        </Section>

        <Section title="Выход">
          <ActionRow icon={<LogoutIcon />} label="Выйти из приложения" onClick={() => setDialog('logout')} />
          <ActionRow icon={<PowerIcon />} label={`Отвязать аккаунт ${name}`} onClick={() => setDialog('unlink')} danger />
        </Section>

        <div className="mt-8 flex justify-center">
          <PoweredBy />
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'logout'}
        title="Выйти из приложения?"
        description="Инстанс останется подключён, войти снова можно в любой момент."
        confirmLabel="Выйти"
        onConfirm={() => logout({ clearHistory })}
        onClose={() => setDialog(null)}
      >
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 select-none">
          <input
            type="checkbox"
            checked={clearHistory}
            onChange={(e) => setClearHistory(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-accent"
          />
          <span>
            <span className="block text-[15px]">Забыть чаты на этом устройстве</span>
            <span className="block text-[13px] text-muted">Переписка в {name} не удалится</span>
          </span>
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'reboot'}
        title="Перезапустить инстанс?"
        description="Около минуты сообщения не будут отправляться и приходить."
        confirmLabel="Перезапустить"
        loading={busy}
        onConfirm={() => run(rebootInstance)}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'unlink'}
        title={`Отвязать аккаунт ${name}?`}
        description={`Сеанс ${name} на инстансе завершится. Чтобы вернуться, инстанс нужно заново авторизовать по QR-коду.`}
        confirmLabel="Отвязать"
        danger
        loading={busy}
        onConfirm={() => run(unlinkAccount)}
        onClose={() => setDialog(null)}
      />
    </aside>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5 px-3">
      <div className="mb-2 flex min-h-6 items-center justify-between px-4">
        <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl bg-surface/60 [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-line">
        {children}
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-[15px] text-muted">{label}</span>
      <span className="min-w-0 truncate text-[15px] select-all" title={value}>
        {value}
      </span>
    </div>
  )
}

function ActionRow({
  icon,
  label,
  onClick,
  loading,
  danger,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  loading?: boolean
  danger?: boolean
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'h-12 w-full justify-start gap-4 rounded-none px-4 text-left text-[15px] font-normal text-fg hover:bg-surface-hover focus-visible:-outline-offset-2 disabled:opacity-100',
        danger && 'text-danger',
      )}
    >
      <span className={cn('flex size-5 items-center justify-center text-muted', danger && 'text-danger')}>
        {loading ? <Spinner /> : icon}
      </span>
      <span className="truncate">{label}</span>
    </Button>
  )
}
