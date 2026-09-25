import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGreenApiClient, defaultApiUrl, GreenApiError, isAbortError } from './client'

const credentials = { idInstance: '1101000001', apiTokenInstance: 'TOKEN', apiUrl: 'https://1101.api.green-api.com/' }

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>
let fetchMock: FetchMock

const respond = (body: string, status = 200) => new Response(body, { status })
const json = (data: unknown, status = 200) => respond(JSON.stringify(data), status)

const calledUrl = (i = 0) => String(fetchMock.mock.calls[i][0])
const calledInit = (i = 0) => fetchMock.mock.calls[i][1] ?? {}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('defaultApiUrl', () => {
  it('хост по первым 4 цифрам idInstance', () => {
    expect(defaultApiUrl(' 7105123456 ')).toBe('https://7105.api.green-api.com')
  })
})

describe('createGreenApiClient: запросы', () => {
  it('собирает URL и убирает хвостовой слэш apiUrl', async () => {
    fetchMock.mockResolvedValue(json({ stateInstance: 'authorized' }))
    const client = createGreenApiClient({ ...credentials, apiUrl: 'https://1101.api.green-api.com///' })
    await expect(client.getStateInstance()).resolves.toEqual({ stateInstance: 'authorized' })
    expect(calledUrl()).toBe('https://1101.api.green-api.com/waInstance1101000001/getStateInstance/TOKEN')
    expect(calledInit().method).toBe('GET')
    expect(calledInit().headers).toBeUndefined()
  })

  it('POST отправляет JSON с Content-Type', async () => {
    fetchMock.mockResolvedValue(json({ idMessage: 'abc' }))
    const client = createGreenApiClient(credentials)
    await expect(client.sendMessage('100', 'привет')).resolves.toEqual({ idMessage: 'abc' })
    expect(calledInit()).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: '100', message: 'привет' }),
    })
  })

  it('deleteNotification: receiptId после токена, метод DELETE', async () => {
    fetchMock.mockResolvedValue(json({ result: true }))
    await createGreenApiClient(credentials).deleteNotification(42)
    expect(calledUrl()).toBe('https://1101.api.green-api.com/waInstance1101000001/deleteNotification/TOKEN/42')
    expect(calledInit().method).toBe('DELETE')
  })

  it('receiveNotification передаёт receiveTimeout в query', async () => {
    fetchMock.mockResolvedValue(respond(''))
    await expect(createGreenApiClient(credentials).receiveNotification(20)).resolves.toBeNull()
    expect(calledUrl()).toBe(
      'https://1101.api.green-api.com/waInstance1101000001/receiveNotification/TOKEN?receiveTimeout=20',
    )
  })

  it('пустое тело → null, "null" → null; getChats/getChatHistory → []', async () => {
    fetchMock.mockImplementation(async () => respond(''))
    const client = createGreenApiClient(credentials)
    await expect(client.readChat('100')).resolves.toBeNull()
    await expect(client.getChats()).resolves.toEqual([])
    fetchMock.mockImplementation(async () => respond('null'))
    await expect(client.receiveNotification(5)).resolves.toBeNull()
  })

  it('некорректный JSON при 200 → GreenApiError', async () => {
    fetchMock.mockResolvedValue(respond('<html>'))
    await expect(createGreenApiClient(credentials).getAvatar('100')).rejects.toMatchObject({
      status: 200,
      message: expect.stringContaining('не удалось прочитать'),
    })
  })

  it('setProfilePicture отправляет FormData без JSON-заголовка', async () => {
    fetchMock.mockResolvedValue(json({ urlAvatar: 'u', setProfilePicture: true }))
    await createGreenApiClient(credentials).setProfilePicture(new Blob(['img'], { type: 'image/jpeg' }))
    const init = calledInit()
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.headers).toBeUndefined()
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob)
  })
})

describe('createGreenApiClient: ошибки', () => {
  it('401 → понятное сообщение про apiTokenInstance', async () => {
    fetchMock.mockResolvedValue(respond('', 401))
    const error = await createGreenApiClient(credentials).getStateInstance().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GreenApiError)
    expect(error).toMatchObject({ status: 401, message: expect.stringContaining('Неверный apiTokenInstance') })
  })

  it('466 с invokeStatus — used/total в сообщении', async () => {
    fetchMock.mockResolvedValue(json({ invokeStatus: { method: 'sendMessage', used: 3, total: 3 } }, 466))
    await expect(createGreenApiClient(credentials).sendMessage('1', 'x')).rejects.toMatchObject({
      status: 466,
      message: expect.stringContaining('использовано 3 из 3'),
    })
  })

  it('466 без invokeStatus — общее сообщение о лимите', async () => {
    fetchMock.mockResolvedValue(json({}, 466))
    await expect(createGreenApiClient(credentials).sendMessage('1', 'x')).rejects.toMatchObject({
      message: expect.stringContaining('лимит бесплатного тарифа'),
    })
  })

  it('400 с неизвестной причиной — понятный общий текст, исходная причина в details', async () => {
    fetchMock.mockResolvedValue(json({ message: 'chatId is invalid' }, 400))
    await expect(createGreenApiClient(credentials).sendMessage('1', 'x')).rejects.toMatchObject({
      status: 400,
      message: 'GREEN-API не смог выполнить запрос',
      details: 'chatId is invalid',
    })
  })

  it('известные английские причины переводятся', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Message editing time expired' }, 400))
    await expect(createGreenApiClient(credentials).editMessage('1', 'm', 'x')).rejects.toMatchObject({
      message: 'Сообщение уже нельзя изменить: прошло больше 48 часов',
    })
  })

  it('тело-строка уходит в details; пустое тело — описание статуса', async () => {
    fetchMock.mockResolvedValueOnce(respond('bad request data', 400))
    const client = createGreenApiClient(credentials)
    await expect(client.sendMessage('1', 'x')).rejects.toMatchObject({
      message: 'GREEN-API не смог выполнить запрос',
      details: 'bad request data',
    })
    fetchMock.mockResolvedValueOnce(respond('', 503))
    await expect(client.sendMessage('1', 'x')).rejects.toMatchObject({
      status: 503,
      message: 'Сервер GREEN-API временно недоступен. Попробуйте позже',
    })
  })

  it('сетевая ошибка (fetch reject TypeError) → GreenApiError со статусом 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createGreenApiClient(credentials).sendMessage('1', 'x')).rejects.toMatchObject({
      name: 'GreenApiError',
      status: 0,
    })
  })

  it('отменённый сигнал → AbortError без запроса', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await createGreenApiClient(credentials)
      .getStateInstance(controller.signal)
      .catch((e: unknown) => e)
    expect(isAbortError(error)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('отмена во время запроса пробрасывает signal.reason, а не статус 0', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const error = await createGreenApiClient(credentials)
      .getContactInfo('1', controller.signal)
      .catch((e: unknown) => e)
    expect(isAbortError(error)).toBe(true)
  })
})

describe('createGreenApiClient: 429 и частота запросов', () => {
  beforeEach(() => vi.useFakeTimers())

  it('429 повторяется с паузой и затем успешен', async () => {
    fetchMock
      .mockResolvedValueOnce(respond('', 429))
      .mockResolvedValueOnce(respond('', 429))
      .mockResolvedValueOnce(json({ exist: true, chatId: '1' }))
    const promise = createGreenApiClient(credentials).checkAccount({ phoneNumber: 7999 })
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(promise).resolves.toEqual({ exist: true, chatId: '1' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('после 3 повторов 429 отдаётся ошибкой', async () => {
    fetchMock.mockImplementation(async () => respond('', 429))
    const promise = createGreenApiClient(credentials).checkAccount({ phoneNumber: 7999 })
    const assertion = expect(promise).rejects.toMatchObject({ status: 429 })
    await vi.advanceTimersByTimeAsync(60_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('второй вызов getAccountSettings идёт не раньше чем через 1000 мс после первого', async () => {
    const times: number[] = []
    fetchMock.mockImplementation(async () => {
      times.push(Date.now())
      return json({})
    })
    const client = createGreenApiClient(credentials)
    const first = client.getAccountSettings()
    const second = client.getAccountSettings()
    await vi.advanceTimersByTimeAsync(0)
    expect(times).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(times).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await Promise.all([first, second])
    expect(times).toHaveLength(2)
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000)
  })

  it('разные методы не ждут друг друга', async () => {
    fetchMock.mockImplementation(async () => json({}))
    const client = createGreenApiClient(credentials)
    void client.getAccountSettings()
    void client.getStateInstance()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('createGreenApiClient: параллельные запросы', () => {
  it('обычным запросам — не больше 4 соединений, очередь уведомлений идёт в обход', async () => {
    const pending: Array<(r: Response) => void> = []
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)))
    const client = createGreenApiClient(credentials)

    const avatars = Array.from({ length: 6 }, (_, i) => client.getAvatar(String(i)))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))

    void client.receiveNotification(5)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    expect(calledUrl(4)).toContain('/receiveNotification/')

    // Освободилось соединение — ушёл следующий из очереди
    pending[0](json({ urlAvatar: '' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))

    pending.slice(1).forEach((resolve) => resolve(json({ urlAvatar: '' })))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
    pending.slice(5).forEach((resolve) => resolve(json({ urlAvatar: '' })))
    await expect(Promise.all(avatars)).resolves.toHaveLength(6)
  })
})

describe('createGreenApiClient: long polling', () => {
  it('408 от receiveNotification — пустой ответ, а не ошибка', async () => {
    fetchMock.mockResolvedValue(respond('', 408))
    await expect(createGreenApiClient(credentials).receiveNotification(5)).resolves.toBeNull()
  })

  it('408 от других методов — ошибка', async () => {
    fetchMock.mockResolvedValue(respond('', 408))
    await expect(createGreenApiClient(credentials).getChats()).rejects.toMatchObject({ status: 408 })
  })
})

describe('createGreenApiClient: повторное использование getSettings', () => {
  beforeEach(() => vi.useFakeTimers())

  // Свой idInstance на тест: кэш живёт на уровне модуля
  const creds = (idInstance: string) => ({ ...credentials, idInstance })

  it('ответ getSettings переиспользуется другим клиентом того же инстанса (экран входа → провайдер)', async () => {
    fetchMock.mockImplementation(async () => json({ typeInstance: 'v3' }))
    await createGreenApiClient(creds('1101000101')).getSettings()
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(createGreenApiClient(creds('1101000101')).getSettings()).resolves.toEqual({ typeInstance: 'v3' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('другой инстанс или токен — свой запрос', async () => {
    fetchMock.mockImplementation(async () => json({}))
    await createGreenApiClient(creds('1101000102')).getSettings()
    await createGreenApiClient({ ...creds('1101000102'), apiTokenInstance: 'OTHER' }).getSettings()
    await createGreenApiClient(creds('1101000103')).getSettings()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('устаревший ответ и ответ до setSettings не используются', async () => {
    fetchMock.mockImplementation(async () => json({}))
    const client = createGreenApiClient(creds('1101000104'))
    await client.getSettings()
    await vi.advanceTimersByTimeAsync(16_000)
    await client.getSettings()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await client.setSettings({ incomingWebhook: 'yes' })
    const reload = client.getSettings()
    await vi.advanceTimersByTimeAsync(2_000)
    await reload
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('ошибка не кэшируется', async () => {
    fetchMock.mockResolvedValueOnce(respond('', 500)).mockResolvedValue(json({}))
    const client = createGreenApiClient(creds('1101000105'))
    await expect(client.getSettings()).rejects.toMatchObject({ status: 500 })
    const retry = client.getSettings()
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(retry).resolves.toEqual({})
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
