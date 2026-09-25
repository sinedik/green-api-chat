import { useEffect, useRef, useState } from 'react'
import { GreenApiError, type GreenApiClient } from '../api/client'
import { parseNotification, type ChatEvent } from '../lib/notifications'
import { sleep } from '../lib/retry'

/**
 * pending — ещё не ясно, какая вкладка будет опрашивать очередь (ждём Web Lock);
 * restarting — связи нет, потому что инстанс перезапускается после смены настроек (выставляет провайдер);
 * standby — очередь опрашивает другая вкладка этого же инстанса, события приходят через BroadcastChannel.
 */
export type ConnectionStatus =
  | 'pending'
  | 'restarting'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline'
  | 'unauthorized'
  | 'standby'

const RECEIVE_TIMEOUT_SEC = 20
/** Первый запрос и запросы после ошибки короткие, чтобы быстро показать актуальный статус */
const SHORT_RECEIVE_TIMEOUT_SEC = 5
const MAX_BACKOFF_MS = 30_000
/** Сколько сбоев подряд терпим молча: единичная ошибка — ещё не обрыв связи */
const SILENT_FAILURES = 1
const TIMEOUT_RETRY_MS = 500

/**
 * Long polling очереди уведомлений: receiveNotification → обработка → deleteNotification.
 *
 * - Уведомление удаляется всегда, даже нерелевантное, иначе очередь "застрянет" на нём.
 * - Очередь у инстанса одна: если открыть приложение в нескольких вкладках, они бы делили уведомления
 *   между собой. Поэтому опрашивает только вкладка, получившая Web Lock; остальные ждут в standby
 *   и подхватывают опрос, если "ведущая" вкладка закроется.
 * - При размонтировании (и двойном маунте в StrictMode) цикл прерывается через AbortController.
 */
export function useNotificationPolling(
  client: GreenApiClient,
  lockName: string,
  onEvent: (event: ChatEvent) => void,
): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('pending')
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    async function loop() {
      let failures = 0
      let first = true
      setStatus('connecting')

      while (!signal.aborted) {
        if (!navigator.onLine) {
          setStatus('offline')
          await sleep(MAX_BACKOFF_MS, signal, { wakeOnOnline: true })
          continue
        }
        try {
          const timeout = first || failures > 0 ? SHORT_RECEIVE_TIMEOUT_SEC : RECEIVE_TIMEOUT_SEC
          const notification = await client.receiveNotification(timeout, signal)
          first = false
          failures = 0
          setStatus('online')
          if (!notification) continue

          try {
            const event = parseNotification(notification.body)
            if (event) onEventRef.current(event)
          } catch (error) {
            console.error('[polling] не удалось обработать уведомление', notification, error)
          } finally {
            await client.deleteNotification(notification.receiptId, signal)
          }
        } catch (error) {
          if (signal.aborted) return
          // Токен отозван или инстанс удалён — повторять бессмысленно
          if (error instanceof GreenApiError && error.status === 401) {
            setStatus('unauthorized')
            return
          }
          // Наш собственный таймаут long polling — не обрыв: просто спрашиваем снова
          if (error instanceof GreenApiError && error.status === 408) {
            await sleep(TIMEOUT_RETRY_MS, signal)
            continue
          }
          console.warn('[polling]', error)
          failures++
          if (!navigator.onLine) setStatus('offline')
          else if (failures > SILENT_FAILURES) setStatus('reconnecting')
          await sleep(Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (failures - 1)), signal, { wakeOnOnline: true })
        }
      }
    }

    if ('locks' in navigator) {
      // Если замок занят другой вкладкой — ждём его освобождения в standby
      navigator.locks
        .request(lockName, { ifAvailable: true }, (lock) => {
          if (lock) return loop()
          setStatus('standby')
          return navigator.locks.request(lockName, { signal }, loop)
        })
        .catch((error) => {
          if (!signal.aborted) console.warn('[polling] lock', error)
        })
    } else {
      void loop()
    }

    return () => controller.abort()
  }, [client, lockName])

  return status
}
