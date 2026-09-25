import { useCallback, useEffect, useRef } from 'react'
import { clearChats, saveChats } from '../lib/storage'
import type { ChatState } from '../store/chatReducer'
import { useLatest } from './useLatest'

const SAVE_DEBOUNCE_MS = 400

/**
 * Сохраняет историю в localStorage с задержкой (чтобы не сериализовать всё на каждый статус)
 * и досохраняет при закрытии страницы. Возвращает функцию, которая удаляет историю и отключает сохранение.
 */
export function useChatPersistence(idInstance: string, state: ChatState, onQuotaExceeded: () => void) {
  const stateRef = useLatest(state)
  const disabled = useRef(false)
  const warned = useRef(false)

  useEffect(() => {
    if (disabled.current) return
    const timer = setTimeout(() => {
      if (disabled.current || saveChats(idInstance, state) || warned.current) return
      warned.current = true
      onQuotaExceeded()
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [idInstance, state, onQuotaExceeded])

  useEffect(() => {
    const flush = () => !disabled.current && saveChats(idInstance, stateRef.current)
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [idInstance, stateRef])

  return useCallback(() => {
    disabled.current = true
    clearChats(idInstance)
  }, [idInstance])
}
