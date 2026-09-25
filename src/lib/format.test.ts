import { afterAll, describe, expect, it, vi } from 'vitest'

// Часовой пояс с переходом на летнее время: задаём до импорта format.ts, чтобы Intl-форматтеры его подхватили
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const previousTz = vi.hoisted(() => {
  const processEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
  const previous = processEnv.TZ
  processEnv.TZ = 'Europe/Berlin'
  return previous
})

const { daysBetween, formatChatTime, formatDayDivider, formatLastSeen, isSameDay, plural } = await import('./format')

afterAll(() => {
  if (previousTz === undefined) delete env.TZ
  else env.TZ = previousTz
})

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

// 29.03.2026 в Европе/Берлине сутки длятся 23 часа
const hasDst = at(2026, 3, 30, 0) - at(2026, 3, 29, 0) === 23 * 3_600_000

describe('daysBetween', () => {
  it('считает календарные дни, а не 24-часовые интервалы', () => {
    expect(daysBetween(at(2026, 5, 10, 23, 59), at(2026, 5, 11, 0, 1))).toBe(1)
    expect(daysBetween(at(2026, 5, 10, 0, 0), at(2026, 5, 10, 23, 59))).toBe(0)
    expect(daysBetween(at(2026, 5, 11), at(2026, 5, 10))).toBe(-1)
  })

  it('через границы месяца и года', () => {
    expect(daysBetween(at(2026, 1, 31), at(2026, 2, 1))).toBe(1)
    expect(daysBetween(at(2025, 12, 31, 23), at(2026, 1, 1, 1))).toBe(1)
    expect(daysBetween(at(2024, 2, 28), at(2024, 3, 1))).toBe(2)
  })

  it.runIf(hasDst)('через переход на летнее и зимнее время', () => {
    expect(daysBetween(at(2026, 3, 28, 23), at(2026, 3, 29, 23))).toBe(1)
    expect(daysBetween(at(2026, 3, 28, 0, 30), at(2026, 3, 30, 23, 30))).toBe(2)
    expect(daysBetween(at(2026, 10, 24, 12), at(2026, 10, 26, 0, 10))).toBe(2)
    expect(isSameDay(at(2026, 10, 25, 0, 30), at(2026, 10, 25, 23, 30))).toBe(true)
  })
})

describe('formatDayDivider', () => {
  const now = at(2026, 9, 25, 10)

  it('Сегодня / Вчера', () => {
    expect(formatDayDivider(at(2026, 9, 25, 0, 5), now)).toBe('Сегодня')
    expect(formatDayDivider(at(2026, 9, 24, 23, 59), now)).toBe('Вчера')
  })

  it('дата без года в текущем году и с годом — в прошлом', () => {
    expect(formatDayDivider(at(2026, 3, 12), now)).toBe('12 марта')
    expect(formatDayDivider(at(2025, 3, 12), now)).toMatch(/^12 марта 2025/)
  })

  it('время из будущего считается сегодняшним', () => {
    expect(formatDayDivider(at(2026, 9, 26), now)).toBe('Сегодня')
  })
})

describe('formatChatTime', () => {
  const now = at(2026, 9, 25, 18)

  it('сегодня — часы и минуты', () => {
    expect(formatChatTime(at(2026, 9, 25, 9, 5), now)).toBe('09:05')
  })

  it('на этой неделе — день недели', () => {
    const ts = at(2026, 9, 22)
    expect(formatChatTime(ts, now)).toBe(new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(ts))
  })

  it('раньше — короткая дата', () => {
    expect(formatChatTime(at(2026, 3, 5), now)).toBe('05.03.26')
  })
})

describe('formatLastSeen', () => {
  const now = at(2026, 9, 25, 18)
  const minutesAgo = (n: number) => now - n * 60_000

  it('меньше минуты — в сети', () => {
    expect(formatLastSeen(now - 30_000, now)).toBe('в сети')
  })

  it('минуты с правильным склонением', () => {
    expect(formatLastSeen(minutesAgo(1), now)).toBe('был(а) 1 минуту назад')
    expect(formatLastSeen(minutesAgo(3), now)).toBe('был(а) 3 минуты назад')
    expect(formatLastSeen(minutesAgo(5), now)).toBe('был(а) 5 минут назад')
    expect(formatLastSeen(minutesAgo(11), now)).toBe('был(а) 11 минут назад')
    expect(formatLastSeen(minutesAgo(21), now)).toBe('был(а) 21 минуту назад')
    expect(formatLastSeen(minutesAgo(59), now)).toBe('был(а) 59 минут назад')
  })

  it('сегодня / вчера — со временем', () => {
    expect(formatLastSeen(at(2026, 9, 25, 15, 0), now)).toBe('был(а) сегодня в 15:00')
    expect(formatLastSeen(at(2026, 9, 24, 18, 40), now)).toBe('был(а) вчера в 18:40')
  })

  it('давно — датой', () => {
    expect(formatLastSeen(at(2026, 3, 12), now)).toBe('был(а) 12 марта')
  })
})

describe('plural', () => {
  const p = (n: number) => plural(n, 'минута', 'минуты', 'минут')

  it.each([
    [1, 'минута'],
    [2, 'минуты'],
    [5, 'минут'],
    [11, 'минут'],
    [12, 'минут'],
    [14, 'минут'],
    [21, 'минута'],
    [22, 'минуты'],
    [25, 'минут'],
    [111, 'минут'],
    [0, 'минут'],
  ])('%i → %s', (n, expected) => {
    expect(p(n)).toBe(expected)
  })
})
