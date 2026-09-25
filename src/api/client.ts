import { sleep } from '../lib/retry'
import type {
  AccountSettings,
  CheckAccountQuery,
  CheckAccountResponse,
  ContactInfo,
  Credentials,
  DeleteNotificationResponse,
  HistoryMessage,
  InstanceSettings,
  Notification,
  RemoteChat,
  SendMessageResponse,
  StateInstanceResponse,
} from './types'

export class GreenApiError extends Error {
  readonly status: number
  /** Исходный текст ошибки от сервера — для отладки, пользователю показываем message */
  readonly details?: string

  constructor(status: number, message: string, details?: string) {
    super(message)
    this.name = 'GreenApiError'
    this.status = status
    this.details = details
  }
}

export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/** Хост API по умолчанию: первые 4 цифры idInstance — номер кластера (4100… → 4100.api.green-api.com). */
export function defaultApiUrl(idInstance: string): string {
  const cluster = idInstance.trim().slice(0, 4)
  return `https://${cluster}.api.green-api.com`
}

const QUOTA_MESSAGE =
  'Закончился месячный лимит бесплатного тарифа GREEN-API. На тарифе Developer можно переписываться не больше чем с тремя собеседниками'

/** Что случилось и что делать — по коду ответа */
function describeStatus(status: number): string {
  switch (status) {
    case 0:
      return 'Не удалось связаться с GREEN-API. Проверьте подключение к интернету'
    case 400:
      return 'GREEN-API не смог выполнить запрос'
    case 401:
      return 'Неверный apiTokenInstance. Скопируйте его заново в личном кабинете GREEN-API'
    case 403:
      return 'Инстанс не найден. Проверьте idInstance'
    case 408:
      return 'GREEN-API не ответил вовремя. Попробуйте ещё раз'
    case 429:
      return 'Слишком много запросов подряд. Подождите несколько секунд'
    case 466:
      return QUOTA_MESSAGE
    default:
      return status >= 500 ? 'Сервер GREEN-API временно недоступен. Попробуйте позже' : `GREEN-API вернул ошибку ${status}`
  }
}

/** Известные ответы сервера (они на английском) → понятный текст. Порядок важен: частные случаи раньше общих */
const KNOWN_REASONS: Array<[RegExp, string]> = [
  [/editing time expired/i, 'Сообщение уже нельзя изменить: прошло больше 48 часов'],
  [/cannot be edited/i, 'Такое сообщение нельзя изменить'],
  [/deleting this message type/i, 'Такое сообщение нельзя удалить'],
  [/message (by id )?not found/i, 'Сообщение не найдено. Возможно, его уже удалили'],
  [/chatId not found/i, 'Чат не найден'],
  [/starting/i, 'Инстанс запускается. Попробуйте через минуту'],
  [/not authorized/i, 'Инстанс не подключён к мессенджеру. Отсканируйте QR-код в личном кабинете GREEN-API'],
  [/account is expired/i, 'Срок действия инстанса истёк. Продлите его в личном кабинете GREEN-API'],
  [/instance is deleted/i, 'Инстанс удалён. Создайте новый в личном кабинете GREEN-API'],
]

/** Разбирает тело ошибки: форматы у методов разные ({message}, {reason}, {invokeStatus} или просто строка) */
function describeBody(status: number, text: string): { message: string; details?: string } {
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // тело — просто строка ("bad request data")
  }
  const body = (data && typeof data === 'object' ? data : {}) as {
    message?: unknown
    reason?: unknown
    invokeStatus?: { used?: number; total?: number }
  }

  if (status === 466) {
    const invoke = body.invokeStatus
    return {
      message: invoke?.total
        ? `Закончился месячный лимит бесплатного тарифа GREEN-API: использовано ${invoke.used} из ${invoke.total}`
        : QUOTA_MESSAGE,
    }
  }

  const reason =
    typeof data === 'string' ? data : typeof body.message === 'string' ? body.message : typeof body.reason === 'string' ? body.reason : ''
  const known = reason && KNOWN_REASONS.find(([pattern]) => pattern.test(reason))
  return { message: known ? known[1] : describeStatus(status), details: reason || undefined }
}

/**
 * Минимальный интервал между вызовами метода (мс). GREEN-API ограничивает частоту
 * на каждый метод отдельно и отвечает 429 при превышении, поэтому выравниваем вызовы заранее.
 */
const MIN_INTERVAL: Record<string, number> = {
  getStateInstance: 1000,
  getSettings: 1000,
  setSettings: 1000,
  getAccountSettings: 1000,
  getChats: 1000,
  getChatHistory: 1000,
  lastIncomingMessages: 1000,
  lastOutgoingMessages: 1000,
  deleteMessage: 1000,
  reboot: 1000,
  logout: 1000,
  getMessagesCount: 1000,
  getWebhooksCount: 1000,
  clearMessagesQueue: 1000,
  readChat: 1000, // в MAX — 1/с, в Telegram — 10/с; берём строгий вариант
  sendTyping: 1000,
  setProfilePicture: 10_000,
  getContactInfo: 100,
  getAvatar: 100,
  checkAccount: 100,
  sendMessage: 20,
  editMessage: 20,
}

const DEFAULT_TIMEOUT_MS = 15_000
/**
 * Браузер держит не больше 6 соединений с одним хостом. Если их займут фоновые запросы
 * (аватары, журналы, история), long polling встанет в очередь и отвалится по таймауту.
 * Поэтому обычным запросам отдаём не больше 4 соединений, а очередь уведомлений идёт в обход.
 */
const MAX_PARALLEL_REQUESTS = 4
const QUEUE_METHODS = new Set(['receiveNotification', 'deleteNotification'])
const MAX_429_RETRIES = 3

/**
 * Сколько переиспользуем ответ getSettings. Экран входа создаёт свой клиент и уже спрашивает getSettings
 * (typeInstance), а сразу после входа useInstanceInfo спросил бы то же самое (лимит — 1 запрос/с).
 * Поэтому свежий ответ хранится на уровне модуля по инстансу+токену и доступен любому клиенту.
 * После setSettings/reboot/logout запись сбрасывается.
 */
const SETTINGS_REUSE_MS = 15_000
const recentSettings = new Map<string, { settings: InstanceSettings; at: number }>()

export interface GreenApiClient {
  getStateInstance(signal?: AbortSignal): Promise<StateInstanceResponse>
  getAccountSettings(signal?: AbortSignal): Promise<AccountSettings>
  getSettings(signal?: AbortSignal): Promise<InstanceSettings>
  setSettings(settings: InstanceSettings): Promise<{ saveSettings: boolean }>
  checkAccount(query: CheckAccountQuery): Promise<CheckAccountResponse>
  sendMessage(chatId: string, message: string): Promise<SendMessageResponse>
  editMessage(chatId: string, idMessage: string, message: string): Promise<{ idMessage: string }>
  deleteMessage(chatId: string, idMessage: string): Promise<void>
  sendTyping(chatId: string, typingTime: number): Promise<void>
  readChat(chatId: string): Promise<void>
  getChats(signal?: AbortSignal): Promise<RemoteChat[]>
  getChatHistory(chatId: string, count: number, signal?: AbortSignal): Promise<HistoryMessage[]>
  /** Последние сообщения по всем чатам за `minutes` минут */
  lastIncomingMessages(minutes: number, signal?: AbortSignal): Promise<HistoryMessage[]>
  lastOutgoingMessages(minutes: number, signal?: AbortSignal): Promise<HistoryMessage[]>
  getContactInfo(chatId: string, signal?: AbortSignal): Promise<ContactInfo>
  getAvatar(chatId: string, signal?: AbortSignal): Promise<{ urlAvatar: string }>
  setProfilePicture(file: Blob): Promise<{ urlAvatar: string; setProfilePicture: boolean }>
  getMessagesCount(signal?: AbortSignal): Promise<{ count: number }>
  clearMessagesQueue(): Promise<void>
  reboot(): Promise<void>
  logout(): Promise<{ isLogout: boolean }>
  receiveNotification(receiveTimeout: number, signal?: AbortSignal): Promise<Notification | null>
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<DeleteNotificationResponse>
}

interface RequestOptions {
  body?: unknown
  query?: Record<string, string>
  signal?: AbortSignal
  timeout?: number
}

export function createGreenApiClient({ idInstance, apiTokenInstance, apiUrl }: Credentials): GreenApiClient {
  const base = `${apiUrl.replace(/\/+$/, '')}/waInstance${idInstance}`
  const settingsKey = `${base}/${apiTokenInstance}`
  const nextSlot = new Map<string, number>()
  let active = 0
  const waiting: Array<() => void> = []

  /** Занимает одно из MAX_PARALLEL_REQUESTS соединений; возвращает функцию, освобождающую его */
  async function acquire(signal?: AbortSignal): Promise<() => void> {
    if (active >= MAX_PARALLEL_REQUESTS) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          waiting.splice(waiting.indexOf(start), 1)
          reject(signal?.reason)
        }
        const start = () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }
        waiting.push(start)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
    active++
    return () => {
      active--
      waiting.shift()?.()
    }
  }

  /** Резервирует ближайшее свободное "окно" для метода и ждёт его */
  async function throttle(action: string, signal?: AbortSignal) {
    const interval = MIN_INTERVAL[action]
    if (!interval) return
    const now = Date.now()
    const slot = Math.max(now, nextSlot.get(action) ?? 0)
    nextSlot.set(action, slot + interval)
    if (slot > now) await sleep(slot - now, signal)
    // Запрос отменили, пока он ждал своей очереди, — освобождаем окно, если за ним никто не встал
    if (signal?.aborted && nextSlot.get(action) === slot + interval) nextSlot.set(action, slot)
  }

  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    { body, query, signal, timeout = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
    attempt = 0,
  ): Promise<T> {
    const [action, ...rest] = path.split('/')
    let url = `${base}/${action}/${apiTokenInstance}${rest.length ? `/${rest.join('/')}` : ''}`
    if (query) url += `?${new URLSearchParams(query)}`

    await throttle(action, signal)
    signal?.throwIfAborted()
    const release = QUEUE_METHODS.has(action) ? () => {} : await acquire(signal)

    const isForm = body instanceof FormData
    // Таймаут считаем с момента, когда запрос реально ушёл, а не с постановки в очередь
    const timeoutSignal = AbortSignal.timeout(timeout)
    let response: Response
    let text: string
    try {
      response = await fetch(url, {
        method,
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
        headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      })
      text = await response.text()
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      if (timeoutSignal.aborted) throw new GreenApiError(408, describeStatus(408))
      throw new GreenApiError(0, describeStatus(0))
    } finally {
      release()
    }

    // На long polling GREEN-API отвечает 408, если уведомлений не было (например, очередь читает другой клиент).
    // Это не ошибка связи, а пустой ответ
    if (response.status === 408 && action === 'receiveNotification') return null as T

    if (response.status === 429 && attempt < MAX_429_RETRIES) {
      await sleep(1000 * 2 ** attempt, signal)
      return request(method, path, { body, query, signal, timeout }, attempt + 1)
    }
    if (!response.ok) {
      const { message, details } = describeBody(response.status, text)
      throw new GreenApiError(response.status, message, details)
    }

    // receiveNotification при пустой очереди отдаёт пустое тело или "null"; archive/delete — пустое тело
    if (!text) return null as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new GreenApiError(response.status, 'GREEN-API прислал ответ, который не удалось прочитать. Попробуйте ещё раз')
    }
  }

  return {
    getStateInstance: (signal) => request('GET', 'getStateInstance', { signal }),
    getAccountSettings: (signal) => request('GET', 'getAccountSettings', { signal }),
    getSettings: async (signal) => {
      const recent = recentSettings.get(settingsKey)
      if (recent && Date.now() - recent.at < SETTINGS_REUSE_MS) {
        signal?.throwIfAborted()
        return recent.settings
      }
      const settings = await request<InstanceSettings>('GET', 'getSettings', { signal })
      recentSettings.set(settingsKey, { settings, at: Date.now() })
      return settings
    },
    setSettings: (settings) => {
      recentSettings.delete(settingsKey)
      return request('POST', 'setSettings', { body: settings })
    },
    checkAccount: (query) => request('POST', 'checkAccount', { body: query }),
    sendMessage: (chatId, message) => request('POST', 'sendMessage', { body: { chatId, message } }),
    editMessage: (chatId, idMessage, message) =>
      request('POST', 'editMessage', { body: { chatId, idMessage, message } }),
    deleteMessage: (chatId, idMessage) =>
      request('POST', 'deleteMessage', { body: { chatId, idMessage, onlySenderDelete: false } }),
    sendTyping: (chatId, typingTime) => request('POST', 'sendTyping', { body: { chatId, typingTime } }),
    readChat: (chatId) => request('POST', 'readChat', { body: { chatId } }),
    getChats: async (signal) => (await request<RemoteChat[] | null>('GET', 'getChats', { signal, timeout: 30_000 })) ?? [],
    getChatHistory: async (chatId, count, signal) =>
      (await request<HistoryMessage[] | null>('POST', 'getChatHistory', { body: { chatId, count }, signal })) ?? [],
    lastIncomingMessages: async (minutes, signal) =>
      (await request<HistoryMessage[] | null>('GET', 'lastIncomingMessages', {
        query: { minutes: String(minutes) },
        signal,
        timeout: 30_000,
      })) ?? [],
    lastOutgoingMessages: async (minutes, signal) =>
      (await request<HistoryMessage[] | null>('GET', 'lastOutgoingMessages', {
        query: { minutes: String(minutes) },
        signal,
        timeout: 30_000,
      })) ?? [],
    getContactInfo: (chatId, signal) => request('POST', 'getContactInfo', { body: { chatId }, signal }),
    getAvatar: (chatId, signal) => request('POST', 'getAvatar', { body: { chatId }, signal }),
    setProfilePicture: (file) => {
      const form = new FormData()
      form.append('file', file, 'avatar.jpg')
      return request('POST', 'setProfilePicture', { body: form, timeout: 60_000 })
    },
    getMessagesCount: (signal) => request('GET', 'getMessagesCount', { signal }),
    clearMessagesQueue: () => request('GET', 'clearMessagesQueue'),
    reboot: () => {
      recentSettings.delete(settingsKey)
      return request('GET', 'reboot')
    },
    logout: () => {
      recentSettings.delete(settingsKey)
      return request('GET', 'logout')
    },
    receiveNotification: (receiveTimeout, signal) =>
      request('GET', 'receiveNotification', {
        query: { receiveTimeout: String(receiveTimeout) },
        signal,
        // Сервер держит соединение receiveTimeout секунд — даём запас на сеть
        timeout: (receiveTimeout + 15) * 1000,
      }),
    deleteNotification: (receiptId, signal) => request('DELETE', `deleteNotification/${receiptId}`, { signal }),
  }
}
