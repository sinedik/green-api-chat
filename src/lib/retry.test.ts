import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenApiError } from '../api/client'
import { isTransient, sleep, withRetry } from './retry'

describe('isTransient', () => {
  it.each([0, 408, 500, 502, 503])('статус %i — повторяем', (status) => {
    expect(isTransient(new GreenApiError(status, ''))).toBe(true)
  })

  it.each([400, 401, 403, 429, 466])('статус %i — не повторяем', (status) => {
    expect(isTransient(new GreenApiError(status, ''))).toBe(false)
  })

  it('ошибка без статуса (сеть, TypeError) — повторяем', () => {
    expect(isTransient(new TypeError('fetch failed'))).toBe(true)
    expect(isTransient(undefined)).toBe(true)
  })
})

describe('sleep', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('завершается по таймеру', async () => {
    const done = vi.fn()
    void sleep(1000).then(done)
    await vi.advanceTimersByTimeAsync(999)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalled()
  })

  it('завершается досрочно при abort', async () => {
    const controller = new AbortController()
    const done = vi.fn()
    void sleep(60_000, controller.signal).then(done)
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toHaveBeenCalled()
  })

  it('с wakeOnOnline завершается при событии online', async () => {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const done = vi.fn()
    void sleep(60_000, undefined, { wakeOnOnline: true }).then(done)
    win.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toHaveBeenCalled()
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // sleep с wakeOnOnline подписывается на window
    vi.stubGlobal('window', new EventTarget())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('повторяет временные ошибки с нарастающей паузой и возвращает результат', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new GreenApiError(503, ''))
      .mockRejectedValueOnce(new GreenApiError(0, ''))
      .mockResolvedValue('ok')
    const promise = withRetry(fn, new AbortController().signal)

    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('не повторяет 4xx', async () => {
    const error = new GreenApiError(400, 'bad')
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(error)
    await expect(withRetry(fn, new AbortController().signal)).rejects.toBe(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('после исчерпания попыток пробрасывает последнюю ошибку', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new GreenApiError(500, 'down'))
    const promise = withRetry(fn, new AbortController().signal, 2)
    const assertion = expect(promise).rejects.toMatchObject({ status: 500 })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('не повторяет после abort', async () => {
    const controller = new AbortController()
    const fn = vi.fn<() => Promise<string>>().mockImplementation(async () => {
      controller.abort()
      throw new GreenApiError(500, '')
    })
    await expect(withRetry(fn, controller.signal)).rejects.toMatchObject({ status: 500 })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
