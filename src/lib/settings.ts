import type { InstanceSettings } from '../api/types'

/**
 * Настройки, которые нужны приложению. У нового инстанса все уведомления выключены,
 * а при заданном webhookUrl они уходят на него, а не в очередь HTTP API.
 */
export const REQUIRED_SETTINGS: InstanceSettings = {
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  editedMessageWebhook: 'yes',
  deletedMessageWebhook: 'yes',
  stateWebhook: 'yes',
}

export interface SettingsProblem {
  /** critical — без этого сообщения не придут вовсе */
  critical: boolean
  text: string
}

export function findSettingsProblems(settings: InstanceSettings): SettingsProblem[] {
  const problems: SettingsProblem[] = []
  if (settings.webhookUrl) {
    problems.push({ critical: true, text: 'указан webhookUrl' })
  }
  if (settings.incomingWebhook !== 'yes') problems.push({ critical: true, text: 'выключено получение входящих' })
  if (settings.outgoingWebhook !== 'yes') problems.push({ critical: false, text: 'выключены статусы доставки' })
  if (settings.outgoingMessageWebhook !== 'yes' || settings.outgoingAPIMessageWebhook !== 'yes') {
    problems.push({ critical: false, text: 'не приходят сообщения, отправленные с телефона' })
  }
  if (settings.editedMessageWebhook !== 'yes' || settings.deletedMessageWebhook !== 'yes') {
    problems.push({ critical: false, text: 'не отслеживаются правки и удаления' })
  }
  return problems
}

/** Переключатели на странице профиля */
export const SETTINGS_TOGGLES: Array<{ key: keyof InstanceSettings; label: string; hint?: string }> = [
  { key: 'incomingWebhook', label: 'Входящие сообщения' },
  { key: 'outgoingWebhook', label: 'Статусы доставки и прочтения' },
  { key: 'outgoingMessageWebhook', label: 'Сообщения, отправленные с телефона' },
  { key: 'outgoingAPIMessageWebhook', label: 'Сообщения, отправленные через API' },
  { key: 'editedMessageWebhook', label: 'Редактирование сообщений' },
  { key: 'deletedMessageWebhook', label: 'Удаление сообщений' },
  { key: 'stateWebhook', label: 'Изменение статуса авторизации' },
  { key: 'markIncomingMessagesReaded', label: 'Автоматически отмечать входящие прочитанными' },
]
