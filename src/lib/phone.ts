/**
 * Приводит введённый номер к формату GREEN-API: только цифры с кодом страны.
 * "8 (999) 123-45-67" → "79991234567", "+998 90 123 45 67" → "998901234567".
 * Возвращает null, если номер некорректный.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

/** Человекочитаемый вид: "79991234567" → "+7 999 123-45-67". */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  }
  return `+${d}`
}
