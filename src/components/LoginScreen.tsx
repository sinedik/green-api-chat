import { useRef, useState, type FormEvent } from 'react'
import { createGreenApiClient, defaultApiUrl, GreenApiError } from '../api/client'
import { DEMO_CREDENTIALS } from '../api/demoClient'
import type { Credentials } from '../api/types'
import { APP_NAME } from '../lib/brand'
import { STATE_DESCRIPTIONS } from '../lib/chat'
import { detectMessenger, type Messenger } from '../lib/messenger'
import { EyeIcon, EyeOffIcon } from './icons'
import { Logo } from './Logo'
import { MessengerIcon } from './MessengerIcon'
import { PoweredBy } from './PoweredBy'
import { Button, Field, HelpTip } from './ui'

const CONSOLE_URL = 'https://console.green-api.com/'
const DOCS_URL = 'https://green-api.com/docs/before-start/'

interface Props {
  onLogin: (credentials: Credentials, remember: boolean) => void
}

export function LoginScreen({ onLogin }: Props) {
  const [idInstance, setIdInstance] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [remember, setRemember] = useState(true)
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ id?: string; token?: string; form?: string }>({})
  const idRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<HTMLInputElement>(null)

  const id = idInstance.trim()
  const token = apiToken.trim()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    if (!/^\d{6,}$/.test(id)) nextErrors.id = 'idInstance состоит только из цифр, например 4100123456'
    if (token.length < 10) nextErrors.token = 'Укажите apiTokenInstance из личного кабинета'
    setErrors(nextErrors)
    // Фокус — на первое поле с ошибкой
    if (nextErrors.id) idRef.current?.focus()
    else if (nextErrors.token) tokenRef.current?.focus()
    if (nextErrors.id || nextErrors.token) return

    const credentials: Credentials = {
      idInstance: id,
      apiTokenInstance: token,
      apiUrl: defaultApiUrl(id),
    }

    setLoading(true)
    try {
      const client = createGreenApiClient(credentials)
      const { stateInstance } = await client.getStateInstance()
      if (stateInstance !== 'authorized') {
        setErrors({ form: STATE_DESCRIPTIONS[stateInstance] ?? `Состояние инстанса: ${stateInstance}` })
        return
      }

      const { typeInstance } = await client.getSettings()
      const messenger = detectMessenger(typeInstance)
      if (!messenger) {
        setErrors({ form: `Инстанс «${typeInstance}» не поддерживается. Нужен MAX или Telegram` })
        return
      }
      onLogin({ ...credentials, messenger }, remember)
    } catch (error) {
      // 401 — неверный токен: подсвечиваем именно это поле
      if (error instanceof GreenApiError && error.status === 401) {
        setErrors({ token: error.message })
        requestAnimationFrame(() => tokenRef.current?.select())
        return
      }
      // Адрес сервера вычисляется из idInstance: при неверном номере сервера просто нет,
      // и запрос падает как сетевой. Если интернет есть — дело в номере
      const unknownInstance =
        error instanceof GreenApiError && (error.status === 403 || (error.status === 0 && navigator.onLine))
      if (unknownInstance) {
        setErrors({ id: 'Инстанс с таким idInstance не найден. Проверьте номер в личном кабинете GREEN-API' })
        requestAnimationFrame(() => idRef.current?.select())
        return
      }
      setErrors({ form: error instanceof Error ? error.message : 'Не удалось подключиться к GREEN-API' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="chat-pattern flex min-h-full items-center justify-center px-4 py-10 max-sm:items-start max-sm:py-6">
      <div className="w-full max-w-[420px] animate-[dialog-in_240ms_ease-out] rounded-3xl border border-line bg-panel p-8 shadow-2xl shadow-black/20 max-sm:p-6">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-4">
            {/* Мягкое зелёное свечение под знаком */}
            <span aria-hidden="true" className="absolute inset-1 rounded-2xl bg-brand/40 blur-xl" />
            <Logo className="relative size-16" />
          </div>
          <h1 className="text-2xl leading-8 font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-[15px] leading-5 text-muted">Веб-клиент MAX и Telegram на GREEN-API</p>
          <ul className="mt-4 flex gap-2" aria-label="Поддерживаемые мессенджеры">
            <MessengerChip messenger="max" name="MAX" />
            <MessengerChip messenger="telegram" name="Telegram" />
          </ul>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field
            ref={idRef}
            id="idInstance"
            label="idInstance"
            labelExtra={
              <HelpTip label="Что такое idInstance">
                Номер инстанса из{' '}
                <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  личного кабинета GREEN-API
                </a>
                , указан на странице инстанса.{' '}
                <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Как создать инстанс
                </a>
              </HelpTip>
            }
            inputMode="numeric"
            autoComplete="username"
            placeholder="3100123456"
            value={idInstance}
            // Номер часто копируют с пробелами из кабинета — пробелы выбрасываем сразу
            onChange={(e) => setIdInstance(e.target.value.replace(/\s+/g, ''))}
            error={errors.id}
            autoFocus
          />

          <Field
            ref={tokenRef}
            id="apiTokenInstance"
            label="apiTokenInstance"
            labelExtra={
              <HelpTip label="Что такое apiTokenInstance">
                Ключ доступа к инстансу. Лежит там же, рядом с idInstance.{' '}
                <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Документация
                </a>
              </HelpTip>
            }
            type={showToken ? 'text' : 'password'}
            autoComplete="current-password"
            spellCheck={false}
            placeholder="•••••••••••••••••••••"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            error={errors.token}
            className="pr-12"
          >
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
              aria-pressed={showToken}
              className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              {showToken ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </Field>

          <label className="flex cursor-pointer items-center gap-2.5 text-[15px] select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-accent-strong"
            />
            Запомнить на этом устройстве
          </label>

          {errors.form && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm leading-5 text-danger">
              {errors.form}
            </p>
          )}

          <Button type="submit" loading={loading} className="mt-1">
            {loading ? 'Проверяем…' : 'Войти'}
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            или
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button type="button" variant="secondary" onClick={() => onLogin(DEMO_CREDENTIALS, false)}>
            Попробовать без аккаунта
          </Button>

        </form>

        <footer className="mt-6 flex flex-col items-center gap-1.5 border-t border-line pt-5">
          <PoweredBy />
        </footer>
      </div>
    </main>
  )
}

function MessengerChip({ messenger, name }: { messenger: Messenger; name: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1.5 text-xs font-medium">
      <MessengerIcon messenger={messenger} />
      {name}
    </li>
  )
}
