/**
 * Пауза, которая завершается досрочно при abort.
 * С `wakeOnOnline` — ещё и при восстановлении сети, чтобы не ждать полный backoff.
 */
export function sleep(ms: number, signal?: AbortSignal, { wakeOnOnline = false } = {}) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      if (wakeOnOnline) window.removeEventListener('online', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
    if (wakeOnOnline) window.addEventListener('online', done, { once: true })
  })
}

/** Ошибки, которые имеет смысл повторить: сеть, таймаут, 5xx. 4xx — нет (429 повторяет сам клиент). */
export function isTransient(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  return status === undefined || status === 0 || status === 408 || status >= 500
}

/** Повтор временно неудачного запроса с нарастающей паузой */
export async function withRetry<T>(fn: () => Promise<T>, signal: AbortSignal, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (error) {
      if (signal.aborted || i >= attempts - 1 || !isTransient(error)) throw error
      await sleep(1000 * 2 ** i, signal, { wakeOnOnline: true })
    }
  }
}
