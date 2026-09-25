import { useLayoutEffect, useRef } from 'react'

/**
 * Ref с актуальным значением — для стабильных колбэков, которым нужно свежее состояние.
 * Обновляется в layout-эффекте, то есть раньше любых обычных эффектов, включая эффекты потомков.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}
