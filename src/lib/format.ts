const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })

const DAY = 86_400_000

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Разница в календарных днях. Округление спасает от суток в 23/25 часов при переходе на летнее время */
export function daysBetween(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY)
}

export function isSameDay(a: number, b: number): boolean {
  return daysBetween(a, b) === 0
}

export function formatTime(ts: number): string {
  return time.format(ts)
}

/** Время в списке чатов: сегодня — часы, на этой неделе — день недели, иначе дата. */
export function formatChatTime(ts: number, now = Date.now()): string {
  const days = daysBetween(ts, now)
  if (days <= 0) return time.format(ts)
  if (days < 7) return weekday.format(ts)
  return shortDate.format(ts)
}

/** Разделитель дат в ленте: "Сегодня", "Вчера", "12 марта". */
export function formatDayDivider(ts: number, now = Date.now()): string {
  const days = daysBetween(ts, now)
  if (days <= 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return new Date(ts).getFullYear() === new Date(now).getFullYear() ? dayMonth.format(ts) : dayMonthYear.format(ts)
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** "в сети", "был(а) 5 минут назад", "был(а) вчера в 18:40", "был(а) 12 марта" */
export function formatLastSeen(ts: number, now = Date.now()): string {
  const minutes = Math.floor((now - ts) / 60_000)
  if (minutes < 1) return 'в сети'
  if (minutes < 60) return `был(а) ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')} назад`
  const days = daysBetween(ts, now)
  if (days === 0) return `был(а) сегодня в ${time.format(ts)}`
  if (days === 1) return `был(а) вчера в ${time.format(ts)}`
  return `был(а) ${formatDayDivider(ts, now).toLowerCase()}`
}
