/** Текст ошибки для пользователя */
export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Неизвестная ошибка')
