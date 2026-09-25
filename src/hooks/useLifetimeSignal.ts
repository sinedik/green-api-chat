import { useCallback, useEffect, useRef } from 'react'

/**
 * Сигнал, который отменяется при смене `owner` (например, клиента API) и при размонтировании.
 * Возвращает геттер: запросы, запущенные из колбэков, берут актуальный сигнал в момент вызова.
 */
export function useLifetimeSignal(owner: unknown): () => AbortSignal {
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    const current = new AbortController()
    controller.current = current
    return () => current.abort()
  }, [owner])

  return useCallback(() => {
    controller.current ??= new AbortController()
    return controller.current.signal
  }, [])
}
