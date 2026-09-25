import { describe, expect, it } from 'vitest'
import { findSettingsProblems, REQUIRED_SETTINGS } from './settings'

describe('findSettingsProblems', () => {
  it('нужные настройки — проблем нет', () => {
    expect(findSettingsProblems(REQUIRED_SETTINGS)).toEqual([])
  })

  it('новый инстанс (всё выключено) — критичные и некритичные проблемы', () => {
    const problems = findSettingsProblems({})
    expect(problems.filter((p) => p.critical)).toEqual([{ critical: true, text: 'выключено получение входящих' }])
    expect(problems.filter((p) => !p.critical).map((p) => p.text)).toEqual([
      'выключены статусы доставки',
      'не приходят сообщения, отправленные с телефона',
      'не отслеживаются правки и удаления',
    ])
  })

  it('заданный webhookUrl — критичная проблема', () => {
    expect(findSettingsProblems({ ...REQUIRED_SETTINGS, webhookUrl: 'https://example.com/hook' })).toEqual([
      expect.objectContaining({ critical: true, text: expect.stringContaining('webhookUrl') }),
    ])
  })

  it('достаточно одного выключенного флага из пары', () => {
    expect(findSettingsProblems({ ...REQUIRED_SETTINGS, outgoingAPIMessageWebhook: 'no' })).toEqual([
      { critical: false, text: 'не приходят сообщения, отправленные с телефона' },
    ])
    expect(findSettingsProblems({ ...REQUIRED_SETTINGS, deletedMessageWebhook: 'no' })).toEqual([
      { critical: false, text: 'не отслеживаются правки и удаления' },
    ])
  })

  it('stateWebhook и markIncomingMessagesReaded не считаются проблемой', () => {
    expect(findSettingsProblems({ ...REQUIRED_SETTINGS, stateWebhook: 'no', markIncomingMessagesReaded: 'no' })).toEqual(
      [],
    )
  })
})
