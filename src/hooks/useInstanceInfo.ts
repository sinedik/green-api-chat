import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GreenApiClient } from '../api/client'
import type { AccountSettings, InstanceSettings, StateInstance } from '../api/types'
import { errorMessage } from '../lib/errors'
import { toSquareJpeg } from '../lib/image'
import { withRetry } from '../lib/retry'
import type { Toast } from '../store/chatContext'
import { useLifetimeSignal } from './useLifetimeSignal'

type Notify = (text: string, tone?: Toast['tone']) => void

/** SetSettings перезапускает инстанс, настройки применяются до 5 минут */
const RESTART_WINDOW_MS = 5 * 60_000

/** Аккаунт, статус и настройки инстанса + действия профиля (фото, настройки, перезапуск) */
export function useInstanceInfo(client: GreenApiClient, toast: Notify) {
  const [account, setAccount] = useState<AccountSettings | null>(null)
  const [instanceState, setInstanceState] = useState<StateInstance | null>(null)
  const [settings, setSettings] = useState<InstanceSettings | null>(null)
  const [settingsError, setSettingsError] = useState(false)
  /** Инстанс перезапускается после SetSettings/Reboot — сбои связи в это время ожидаемы */
  const [restarting, setRestarting] = useState(false)
  const restartTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const markRestarting = useCallback(() => {
    setRestarting(true)
    clearTimeout(restartTimer.current)
    restartTimer.current = setTimeout(() => setRestarting(false), RESTART_WINDOW_MS)
  }, [])
  useEffect(() => () => clearTimeout(restartTimer.current), [])
  const getSignal = useLifetimeSignal(client)

  const fetchSettings = useCallback(() => {
    const signal = getSignal()
    withRetry(() => client.getSettings(signal), signal)
      .then(setSettings)
      .catch((error) => {
        if (signal.aborted) return
        console.warn('[settings]', error)
        setSettingsError(true)
      })
  }, [client, getSignal])

  useEffect(() => {
    const signal = getSignal()
    withRetry(() => client.getAccountSettings(signal), signal)
      .then((data) => {
        setAccount(data)
        setInstanceState(data.stateInstance)
      })
      .catch((error) => !signal.aborted && console.warn('[account]', error))
    fetchSettings()
  }, [client, fetchSettings, getSignal])

  const reloadSettings = useCallback(() => {
    setSettingsError(false)
    fetchSettings()
  }, [fetchSettings])

  const saveSettings = useCallback(
    async (patch: InstanceSettings) => {
      try {
        await client.setSettings(patch)
        setSettings((current) => ({ ...current, ...patch }))
        markRestarting()
        toast('Настройки сохранены, заработают через пару минут', 'success')
        return true
      } catch (error) {
        toast(`Не удалось сохранить настройки: ${errorMessage(error)}`, 'error')
        return false
      }
    },
    [client, markRestarting, toast],
  )

  const uploadAvatar = useCallback(
    async (file: File) => {
      try {
        const jpeg = await toSquareJpeg(file)
        const { urlAvatar } = await client.setProfilePicture(jpeg)
        setAccount((current) => (current ? { ...current, avatar: urlAvatar || URL.createObjectURL(jpeg) } : current))
        toast('Фото профиля обновлено', 'success')
        return true
      } catch (error) {
        toast(`Не удалось обновить фото: ${errorMessage(error)}`, 'error')
        return false
      }
    },
    [client, toast],
  )

  const rebootInstance = useCallback(async () => {
    try {
      await client.reboot()
      markRestarting()
      toast('Инстанс перезапускается, это около минуты', 'info')
    } catch (error) {
      toast(`Не удалось перезапустить: ${errorMessage(error)}`, 'error')
    }
  }, [client, markRestarting, toast])

  return useMemo(
    () => ({
      account,
      instanceState,
      setInstanceState,
      settings,
      settingsError,
      reloadSettings,
      saveSettings,
      uploadAvatar,
      rebootInstance,
      restarting,
    }),
    [account, instanceState, settings, settingsError, reloadSettings, saveSettings, uploadAvatar, rebootInstance, restarting],
  )
}
