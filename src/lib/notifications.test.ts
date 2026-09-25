import { describe, expect, it } from 'vitest'
import type { HistoryMessage, Webhook } from '../api/types'
import { extractText, historyToMessage, parseNotification } from './notifications'

const instanceData = { idInstance: 3100000000, wid: '79990000000@c.us', typeInstance: 'v3' }

// Пример из документации GREEN-API для MAX
const incomingText = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1763115112,
  idMessage: '1763115112345',
  senderData: {
    chatId: '10000000',
    chatName: 'Иван Петров',
    chatType: 'user',
    sender: '10000000',
    senderName: 'Иван Петров',
    senderContactName: 'Ваня',
    senderPhoneNumber: 79876543210,
  },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!' } },
} as Webhook

describe('parseNotification', () => {
  it('разбирает входящее текстовое сообщение', () => {
    expect(parseNotification(incomingText)).toEqual({
      type: 'message',
      message: {
        id: '1763115112345',
        chatId: '10000000',
        text: 'Привет!',
        direction: 'in',
        timestamp: 1763115112000,
        status: undefined,
        author: undefined,
      },
      chat: { id: '10000000', title: 'Ваня', phone: '79876543210', type: 'user' },
    })
  })

  it('разбирает extendedTextMessage', () => {
    const event = parseNotification({
      ...incomingText,
      messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'со ссылкой' } },
    } as Webhook)
    expect(event?.type === 'message' && event.message.text).toBe('со ссылкой')
  })

  it('исходящее с телефона — direction "out" без имени отправителя', () => {
    const event = parseNotification({
      ...incomingText,
      typeWebhook: 'outgoingMessageReceived',
      senderData: { chatId: '10000000', chatName: 'Иван Петров', senderName: 'Я' },
    } as Webhook)
    expect(event).toMatchObject({
      type: 'message',
      message: { direction: 'out', status: 'sent' },
      chat: { title: 'Иван Петров', phone: undefined },
    })
  })

  it('медиа показывает подписью типа, а не прячет', () => {
    const event = parseNotification({
      ...incomingText,
      messageData: { typeMessage: 'imageMessage', fileMessageData: { caption: 'закат' } },
    } as Webhook)
    expect(event).toMatchObject({ type: 'message', message: { media: 'Фото', text: 'закат' } })
  })

  it('игнорирует реакции', () => {
    expect(parseNotification({ ...incomingText, messageData: { typeMessage: 'reactionMessage' } } as Webhook)).toBeNull()
  })

  it('разбирает удаление и редактирование', () => {
    expect(
      parseNotification({
        ...incomingText,
        messageData: { typeMessage: 'deletedMessage', deletedMessageData: { stanzaId: 'm1' } },
      } as Webhook),
    ).toEqual({ type: 'deleted', chatId: '10000000', messageId: 'm1' })

    // Уведомление об удалении своего сообщения приходит без senderData
    expect(
      parseNotification({
        typeWebhook: 'outgoingMessageReceived',
        timestamp: 1,
        messageData: { typeMessage: 'deletedMessage', deletedMessageData: { stanzaId: 'm2' } },
      } as Webhook),
    ).toEqual({ type: 'deleted', chatId: undefined, messageId: 'm2' })

    expect(
      parseNotification({
        ...incomingText,
        messageData: { typeMessage: 'editedMessage', editedMessageData: { stanzaId: 'm1', textMessage: 'новый' } },
      } as Webhook),
    ).toEqual({ type: 'edited', chatId: '10000000', messageId: 'm1', text: 'новый' })
  })

  it('в группе название чата — chatName, а автор — senderName', () => {
    const event = parseNotification({
      ...incomingText,
      senderData: { chatId: '-100500', chatType: 'supergroup', chatName: 'Команда', senderName: 'Оля' },
    } as Webhook)
    expect(event).toMatchObject({ chat: { id: '-100500', title: 'Команда', type: 'group' }, message: { author: 'Оля' } })
  })

  it('маппит статусы, ошибки доставки → failed', () => {
    const status = (value: string) =>
      parseNotification({
        typeWebhook: 'outgoingMessageStatus',
        chatId: '10000000',
        idMessage: 'abc',
        timestamp: 1,
        status: value,
      } as Webhook)

    expect(status('read')).toEqual({ type: 'status', chatId: '10000000', messageId: 'abc', status: 'read' })
    expect(status('noAccount')).toMatchObject({ status: 'failed' })
  })

  it('разбирает смену состояния инстанса', () => {
    expect(
      parseNotification({ typeWebhook: 'stateInstanceChanged', timestamp: 1, stateInstance: 'notAuthorized' } as Webhook),
    ).toEqual({ type: 'state', state: 'notAuthorized' })
  })

  it('квота тарифа — отдельное событие', () => {
    expect(parseNotification({ typeWebhook: 'quotaExceeded', timestamp: 1 })).toMatchObject({ type: 'quota' })
  })

  it('игнорирует неизвестные уведомления', () => {
    expect(parseNotification({ typeWebhook: 'somethingNew', timestamp: 1 })).toBeNull()
  })
})

describe('parseNotification: краевые случаи', () => {
  const text = (messageData: object) => {
    const event = parseNotification({ ...incomingText, messageData } as Webhook)
    return event?.type === 'message' ? event.message.text : null
  }

  it('quotedMessage берёт текст из extendedTextMessageData', () => {
    expect(text({ typeMessage: 'quotedMessage', extendedTextMessageData: { text: 'ответ', stanzaId: 'm0' } })).toBe(
      'ответ',
    )
  })

  it('extendedTextMessage без extendedTextMessageData падает обратно на textMessageData', () => {
    expect(text({ typeMessage: 'extendedTextMessage', textMessageData: { textMessage: 'запасной' } })).toBe('запасной')
  })

  it('текстовое сообщение с пустым текстом не отображается', () => {
    expect(parseNotification({ ...incomingText, messageData: { typeMessage: 'textMessage' } } as Webhook)).toBeNull()
    expect(
      parseNotification({
        ...incomingText,
        messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: '' } },
      } as Webhook),
    ).toBeNull()
  })

  it('неизвестный тип медиа показывается заглушкой', () => {
    const event = parseNotification({ ...incomingText, messageData: { typeMessage: 'weirdMessage' } } as Webhook)
    expect(event).toMatchObject({ message: { media: 'Неподдерживаемое сообщение', text: '' } })
  })

  it('без idMessage или senderData сообщение не разбирается', () => {
    expect(parseNotification({ ...incomingText, idMessage: undefined } as Webhook)).toBeNull()
    expect(parseNotification({ ...incomingText, senderData: undefined } as Webhook)).toBeNull()
  })

  it('правка без senderData — chatId undefined', () => {
    expect(
      parseNotification({
        typeWebhook: 'outgoingMessageReceived',
        timestamp: 1,
        messageData: { typeMessage: 'editedMessage', editedMessageData: { stanzaId: 'm3', textMessage: 'x' } },
      } as Webhook),
    ).toEqual({ type: 'edited', chatId: undefined, messageId: 'm3', text: 'x' })
  })

  it('editedMessage/deletedMessage без данных — служебные и игнорируются', () => {
    expect(parseNotification({ ...incomingText, messageData: { typeMessage: 'editedMessage' } } as Webhook)).toBeNull()
    expect(parseNotification({ ...incomingText, messageData: { typeMessage: 'deletedMessage' } } as Webhook)).toBeNull()
  })

  it('outgoingAPIMessageReceived — исходящее со статусом sent', () => {
    const event = parseNotification({ ...incomingText, typeWebhook: 'outgoingAPIMessageReceived' } as Webhook)
    expect(event).toMatchObject({ message: { direction: 'out', status: 'sent', author: undefined } })
  })

  it('чат с id на "-" считается группой даже без chatType', () => {
    const event = parseNotification({
      ...incomingText,
      senderData: { chatId: '-42', chatName: 'Чат', senderName: 'Петя', senderPhoneNumber: 7999 },
    } as Webhook)
    expect(event).toMatchObject({ chat: { type: 'group', title: 'Чат', phone: undefined }, message: { author: 'Петя' } })
  })

  it('квота с данными тарифа описывает used/total', () => {
    const event = parseNotification({
      typeWebhook: 'quotaExceeded',
      timestamp: 1,
      quotaData: { method: 'sendMessage', used: 3, total: 3 },
    } as Webhook)
    expect(event).toEqual({
      type: 'quota',
      description: 'Закончился месячный лимит бесплатного тарифа GREEN-API: использовано 3 из 3',
    })
  })
})

describe('extractText', () => {
  it('undefined и нетекстовые типы → null', () => {
    expect(extractText(undefined)).toBeNull()
    expect(extractText({ typeMessage: 'imageMessage' })).toBeNull()
  })
})

describe('historyToMessage', () => {
  const item = (overrides: Partial<HistoryMessage>): HistoryMessage => ({
    type: 'incoming',
    idMessage: 'h1',
    timestamp: 1700000000,
    typeMessage: 'textMessage',
    chatId: '100',
    textMessage: 'привет',
    senderName: 'Иван',
    ...overrides,
  })

  it('входящее без статуса и автора в личке', () => {
    expect(historyToMessage(item({}))).toEqual({
      id: 'h1',
      chatId: '100',
      text: 'привет',
      direction: 'in',
      timestamp: 1700000000000,
      status: undefined,
      edited: undefined,
      author: undefined,
    })
  })

  it('исходящее: статус из statusMessage, по умолчанию sent', () => {
    expect(historyToMessage(item({ type: 'outgoing', statusMessage: 'read' }))).toMatchObject({
      direction: 'out',
      status: 'read',
    })
    expect(historyToMessage(item({ type: 'outgoing' }))?.status).toBe('sent')
    expect(historyToMessage(item({ type: 'outgoing', statusMessage: 'failed' }))?.status).toBe('failed')
  })

  it('удалённое → null', () => {
    expect(historyToMessage(item({ isDeleted: true }))).toBeNull()
  })

  it('isEdited → edited: true', () => {
    expect(historyToMessage(item({ isEdited: true }))?.edited).toBe(true)
    expect(historyToMessage(item({ isEdited: false }))?.edited).toBeUndefined()
  })

  it('медиа с подписью и без', () => {
    expect(historyToMessage(item({ typeMessage: 'videoMessage', textMessage: undefined, caption: 'кот' }))).toMatchObject(
      { media: 'Видео', text: 'кот' },
    )
    expect(historyToMessage(item({ typeMessage: 'stickerMessage', textMessage: undefined }))).toMatchObject({
      media: 'Стикер',
      text: '',
    })
  })

  it('в группе входящее получает автора, исходящее — нет', () => {
    expect(historyToMessage(item({ chatId: '-100' }))?.author).toBe('Иван')
    expect(historyToMessage(item({ chatId: '-100', type: 'outgoing' }))?.author).toBeUndefined()
  })

  it('служебные и пустые текстовые → null', () => {
    expect(historyToMessage(item({ typeMessage: 'reactionMessage' }))).toBeNull()
    expect(historyToMessage(item({ textMessage: '' }))).toBeNull()
  })
})
