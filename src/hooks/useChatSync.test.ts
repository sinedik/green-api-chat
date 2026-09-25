import { describe, expect, it } from 'vitest'
import { PREVIEW_WINDOW_MIN, previewWindowMinutes } from './useChatSync'

const NOW = 1_700_000_000_000

describe('previewWindowMinutes', () => {
  it('первый запуск — неделя', () => {
    expect(previewWindowMinutes(null, NOW)).toBe(PREVIEW_WINDOW_MIN)
  })

  it('превью уже грузили — только время с прошлой загрузки плюс запас', () => {
    expect(previewWindowMinutes(NOW - 30 * 60_000, NOW)).toBe(40)
    expect(previewWindowMinutes(NOW - 90_500, NOW)).toBe(12)
  })

  it('не больше недели и не доверяет отметке из будущего', () => {
    expect(previewWindowMinutes(NOW - 30 * 24 * 60 * 60_000, NOW)).toBe(PREVIEW_WINDOW_MIN)
    expect(previewWindowMinutes(NOW + 60_000, NOW)).toBe(PREVIEW_WINDOW_MIN)
  })
})
