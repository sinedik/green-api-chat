import { sleep } from '../lib/retry'
import type { GreenApiClient } from './client'
import type { Credentials, HistoryMessage, InstanceSettings, Notification, RemoteChat, Webhook } from './types'

/**
 * Демо-режим: клиент с тем же интерфейсом, что у настоящего, но без сети.
 * Чаты и история — фиктивные; «собеседник» отвечает на сообщения, статусы идут
 * sent → delivered → read. Нужен, чтобы посмотреть приложение без своего инстанса GREEN-API.
 */

export const DEMO_CREDENTIALS: Credentials = {
  idInstance: 'demo',
  apiTokenInstance: 'demo',
  apiUrl: 'demo',
  messenger: 'telegram',
  demo: true,
}

const SELF_ID = '1000'
const BOT_ID = '2001'

interface DemoContact extends RemoteChat {
  lastSeenAgo?: number
}

const CONTACTS: DemoContact[] = [
  { chatId: BOT_ID, name: 'Анна Смирнова', type: 'user', phoneNumber: 77011234567, username: '@anna_demo', lastSeenAgo: 0 },
  { chatId: '2002', name: 'Максим Петров', type: 'user', phoneNumber: 79031112233, lastSeenAgo: 25 * 60_000 },
  { chatId: '-3001', name: 'Frontend команда', type: 'supergroup' },
  { chatId: '2003', name: 'Дизайн-ревью', type: 'user', username: '@design_review', lastSeenAgo: 26 * 60 * 60_000 },
  { chatId: SELF_ID, name: 'Вы', type: 'user' },
]

const BOT_REPLIES = ['Привет 🙂', 'Ага, поняла', 'Звучит хорошо', 'Давай так и сделаем 👍', 'Напомни вечером, ладно?']

function buildHistory(now: number): Record<string, HistoryMessage[]> {
  const m = 60_000
  const d = 24 * 60 * m
  const item = (chatId: string, id: string, type: 'incoming' | 'outgoing', text: string, ago: number, extra: Partial<HistoryMessage> = {}): HistoryMessage => ({
    type,
    idMessage: id,
    chatId,
    timestamp: Math.floor((now - ago) / 1000),
    typeMessage: 'textMessage',
    textMessage: text,
    statusMessage: type === 'outgoing' ? 'read' : undefined,
    ...extra,
  })
  return {
    [BOT_ID]: [
      item(BOT_ID, 'h1', 'incoming', 'Привет! Как дела? 👋', d + 40 * m),
      item(BOT_ID, 'h2', 'outgoing', 'Привет, всё отлично', d + 38 * m),
      item(BOT_ID, 'h3', 'incoming', 'Созвонимся завтра?', d + 37 * m),
    ],
    '2002': [
      item('2002', 'h4', 'incoming', 'Посмотришь мой PR сегодня?', 3 * 60 * m),
      item('2002', 'h5', 'outgoing', 'Да, после обеда', 2 * 60 * m + 50 * m, { isEdited: true }),
      item('2002', 'h6', 'incoming', '', 2 * 60 * m, { typeMessage: 'imageMessage', caption: 'Скрин с багом' }),
    ],
    '-3001': [
      item('-3001', 'h7', 'incoming', 'Релиз переносим на пятницу', 2 * d, { senderName: 'Оля' }),
      item('-3001', 'h8', 'incoming', 'Ок, успеем с тестами', 2 * d - 5 * m, { senderName: 'Дима' }),
    ],
    '2003': [item('2003', 'h9', 'outgoing', 'Скинул макеты в Figma', 3 * d, { statusMessage: 'delivered' })],
    [SELF_ID]: [item(SELF_ID, 'h10', 'outgoing', 'Не забыть: записать видео для тестового', 5 * d)],
  }
}

export function createDemoClient(): GreenApiClient {
  const startedAt = Date.now()
  const history = buildHistory(startedAt)
  const queue: Notification[] = []
  const waiters = new Set<() => void>()
  let receiptId = 0
  let messageId = 0
  let replyIndex = 0
  let settings: InstanceSettings = {
    typeInstance: 'telegram',
    webhookUrl: '',
    incomingWebhook: 'yes',
    outgoingWebhook: 'yes',
    outgoingMessageWebhook: 'yes',
    outgoingAPIMessageWebhook: 'yes',
    editedMessageWebhook: 'yes',
    deletedMessageWebhook: 'yes',
    stateWebhook: 'yes',
    markIncomingMessagesReaded: 'no',
  }
  let avatar = ''

  const nextId = () => `demo-${Date.now()}-${++messageId}`

  function push(body: Webhook, delay = 0) {
    setTimeout(() => {
      queue.push({ receiptId: ++receiptId, body })
      waiters.forEach((wake) => wake())
    }, delay)
  }

  function incoming(chatId: string, text: string, delay: number) {
    const contact = CONTACTS.find((c) => c.chatId === chatId)
    push(
      {
        typeWebhook: 'incomingMessageReceived',
        timestamp: Math.floor((Date.now() + delay) / 1000),
        idMessage: nextId(),
        senderData: {
          chatId,
          chatName: contact?.name,
          chatType: 'user',
          sender: chatId,
          senderName: contact?.name,
          senderPhoneNumber: contact?.phoneNumber,
        },
        messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
      },
      delay,
    )
  }

  function status(chatId: string, idMessage: string, value: 'delivered' | 'read', delay: number) {
    push({ typeWebhook: 'outgoingMessageStatus', timestamp: Math.floor(Date.now() / 1000), chatId, idMessage, status: value }, delay)
  }

  // Приветствие через пару секунд после входа — чтобы сразу было видно получение в реальном времени
  incoming(BOT_ID, 'Ты тут?', 2500)

  const ok = <T>(value: T, delay = 150) => sleep(delay).then(() => value)

  return {
    getStateInstance: () => ok({ stateInstance: 'authorized' as const }),
    getAccountSettings: () =>
      ok({ avatar, phone: '79990000000', stateInstance: 'authorized' as const, chatId: SELF_ID, username: '@greenchat_demo' }),
    getSettings: () => ok({ ...settings }),
    setSettings: async (patch) => {
      settings = { ...settings, ...patch }
      return ok({ saveSettings: true }, 400)
    },
    checkAccount: async (query) => {
      await sleep(500)
      if ('username' in query) {
        const contact = CONTACTS.find((c) => c.username?.toLowerCase() === query.username.toLowerCase())
        return contact ? { exist: true, chatId: contact.chatId, username: contact.username } : { exist: false, chatId: '' }
      }
      const contact = CONTACTS.find((c) => c.phoneNumber === query.phoneNumber)
      return { exist: true, chatId: contact?.chatId ?? `demo-${query.phoneNumber}`, phoneNumber: query.phoneNumber }
    },
    sendMessage: async (chatId, message) => {
      await sleep(300)
      const idMessage = nextId()
      status(chatId, idMessage, 'delivered', 700)
      if (chatId === SELF_ID) return { idMessage }
      status(chatId, idMessage, 'read', 1600)
      if (chatId === BOT_ID) {
        const reply = message.trim().endsWith('?')
          ? 'Хороший вопрос, дай подумать 🤔'
          : BOT_REPLIES[replyIndex++ % BOT_REPLIES.length]
        incoming(BOT_ID, reply, 2600)
      }
      return { idMessage }
    },
    editMessage: (_chatId, idMessage) => ok({ idMessage }, 300),
    deleteMessage: () => ok(undefined, 300),
    sendTyping: () => ok(undefined),
    readChat: () => ok(undefined),
    getChats: () => ok(CONTACTS.map(({ lastSeenAgo: _ignored, ...chat }) => chat), 400),
    getChatHistory: async (chatId, count) => ok((history[chatId] ?? []).slice(-count).reverse(), 300),
    lastIncomingMessages: () => ok(Object.values(history).flat().filter((m) => m.type === 'incoming'), 300),
    lastOutgoingMessages: () => ok(Object.values(history).flat().filter((m) => m.type === 'outgoing'), 300),
    getContactInfo: async (chatId) => {
      const contact = CONTACTS.find((c) => c.chatId === chatId)
      return ok({
        chatId,
        name: contact?.name,
        phoneNumber: contact?.phoneNumber,
        username: contact?.username,
        lastSeen: contact?.lastSeenAgo !== undefined ? Math.floor((Date.now() - contact.lastSeenAgo) / 1000) : 0,
      })
    },
    getAvatar: () => ok({ urlAvatar: '' }),
    setProfilePicture: async (file) => {
      avatar = URL.createObjectURL(file)
      return ok({ urlAvatar: avatar, setProfilePicture: true }, 600)
    },
    getMessagesCount: () => ok({ count: 0 }),
    clearMessagesQueue: () => ok(undefined),
    reboot: () => ok(undefined, 400),
    logout: () => ok({ isLogout: true }),
    receiveNotification: async (receiveTimeout, signal) => {
      if (!queue.length) {
        // Ждём, пока появится уведомление, истечёт таймаут или запрос отменят — как long polling у GREEN-API
        await new Promise<void>((resolve) => {
          const done = () => {
            waiters.delete(done)
            clearTimeout(timer)
            signal?.removeEventListener('abort', done)
            resolve()
          }
          const timer = setTimeout(done, receiveTimeout * 1000)
          waiters.add(done)
          signal?.addEventListener('abort', done, { once: true })
        })
      }
      signal?.throwIfAborted()
      return queue[0] ?? null
    },
    deleteNotification: async (id) => {
      const index = queue.findIndex((n) => n.receiptId === id)
      if (index !== -1) queue.splice(index, 1)
      return { result: index !== -1 }
    },
  }
}
