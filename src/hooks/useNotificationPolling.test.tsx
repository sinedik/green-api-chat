// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenApiError, type GreenApiClient } from '../api/client'
import type { Notification, Webhook } from '../api/types'
import { useNotificationPolling } from './useNotificationPolling'

type Item = Notification | null | Error

/** Отдаёт заранее заданные ответы, затем «висит» как long polling до abort */
function fakeClient(items: Item[]) {
  const queue = [...items]
  const signals: AbortSignal[] = []
  const receiveNotification = vi.fn(async (_timeout: number, signal?: AbortSignal) => {
    if (signal) signals.push(signal)
    signal?.throwIfAborted()
    if (queue.length) {
      const item = queue.shift()
      if (item instanceof Error) throw item
      return item ?? null
    }
    return new Promise<Notification | null>((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    })
  })
  const deleteNotification = vi.fn(async (_receiptId: number, _signal?: AbortSignal) => ({ result: true }))
  const client = { receiveNotification, deleteNotification } as unknown as GreenApiClient
  return { client, receiveNotification, deleteNotification, signals }
}

const incoming = (receiptId: number, idMessage = `m${receiptId}`): Notification => ({
  receiptId,
  body: {
    typeWebhook: 'incomingMessageReceived',
    timestamp: 1,
    idMessage,
    senderData: { chatId: '100', senderName: 'Иван' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'привет' } },
  } as Webhook,
})

const flush = () => act(async () => {})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useNotificationPolling', () => {
  it('без Web Locks опрашивает очередь напрямую, отдаёт событие и удаляет уведомление', async () => {
    expect('locks' in navigator).toBe(false)
    const { client, deleteNotification } = fakeClient([incoming(1)])
    const onEvent = vi.fn()
    const { result } = renderHook(() => useNotificationPolling(client, 'lock', onEvent))
    await flush()
    expect(result.current).toBe('online')
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'message' }))
    expect(deleteNotification).toHaveBeenCalledWith(1, expect.any(AbortSignal))
  })

  it('удаляет уведомление, даже если обработчик упал', async () => {
    const { client, deleteNotification } = fakeClient([incoming(1), incoming(2)])
    const onEvent = vi.fn(() => {
      throw new Error('boom')
    })
    renderHook(() => useNotificationPolling(client, 'lock', onEvent))
    await flush()
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(deleteNotification.mock.calls.map((c) => c[0])).toEqual([1, 2])
  })

  it('удаляет уведомление, даже если его разбор бросил исключение', async () => {
    const broken = { receiptId: 7, body: { typeWebhook: 'incomingMessageReceived' } as Webhook }
    const { client, deleteNotification } = fakeClient([broken])
    const onEvent = vi.fn()
    renderHook(() => useNotificationPolling(client, 'lock', onEvent))
    await flush()
    expect(onEvent).not.toHaveBeenCalled()
    expect(deleteNotification).toHaveBeenCalledWith(7, expect.any(AbortSignal))
  })

  it('при 401 останавливается со статусом unauthorized', async () => {
    const { client, receiveNotification } = fakeClient([new GreenApiError(401, 'нет доступа')])
    const { result } = renderHook(() => useNotificationPolling(client, 'lock', vi.fn()))
    await flush()
    expect(result.current).toBe('unauthorized')
    expect(receiveNotification).toHaveBeenCalledTimes(1)
  })

  it('единичный сбой не меняет статус, повтор через 1 с', async () => {
    vi.useFakeTimers()
    const { client, receiveNotification } = fakeClient([new GreenApiError(500, 'down'), null])
    const { result } = renderHook(() => useNotificationPolling(client, 'lock', vi.fn()))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current).toBe('connecting')
    expect(receiveNotification).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    // повтор после 1 с получает пустой ответ, следующий запрос висит как long polling
    expect(receiveNotification).toHaveBeenCalledTimes(3)
    expect(result.current).toBe('online')
  })

  it('сбои подряд — reconnecting, затем восстановление', async () => {
    vi.useFakeTimers()
    const down = new GreenApiError(500, 'down')
    const { client, receiveNotification } = fakeClient([down, down, null])
    const { result } = renderHook(() => useNotificationPolling(client, 'lock', vi.fn()))
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(receiveNotification).toHaveBeenCalledTimes(2)
    expect(result.current).toBe('reconnecting')
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(result.current).toBe('online')
  })

  it('первый запрос — короткий таймаут, следующие — длинный', async () => {
    const { client, receiveNotification } = fakeClient([null])
    renderHook(() => useNotificationPolling(client, 'lock', vi.fn()))
    await flush()
    expect(receiveNotification.mock.calls.map((c) => c[0])).toEqual([5, 20])
  })

  it('в StrictMode (двойной маунт) активен только один цикл опроса', async () => {
    const { client, signals } = fakeClient([])
    renderHook(() => useNotificationPolling(client, 'lock', vi.fn()), { wrapper: StrictMode })
    await flush()
    expect(signals.length).toBeGreaterThanOrEqual(2)
    expect(signals.filter((s) => !s.aborted)).toHaveLength(1)
  })

  it('размонтирование прерывает опрос', async () => {
    const { client, signals } = fakeClient([])
    const { unmount } = renderHook(() => useNotificationPolling(client, 'lock', vi.fn()))
    await flush()
    unmount()
    expect(signals.every((s) => s.aborted)).toBe(true)
  })
})
