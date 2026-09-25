import { useCallback, useEffect, useRef, useState } from 'react'
import type { Toast } from '../store/chatContext'

const TOAST_TTL_MS = 5_000
const MAX_TOASTS = 3

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      const id = ++lastId.current
      setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, text, tone }])
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        dismissToast(id)
      }, TOAST_TTL_MS)
      timers.current.add(timer)
    },
    [dismissToast],
  )

  return { toasts, toast, dismissToast }
}
