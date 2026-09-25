import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MESSENGERS } from '../lib/messenger'
import { useChatActions, useChatState } from '../store/chatContext'
import { CloseIcon } from './icons'
import { Button, Field, IconButton } from './ui'

export function NewChatForm({ onClose }: { onClose: () => void }) {
  const { messenger } = useChatState()
  const { openChat } = useChatActions()
  const { usernames, name } = MESSENGERS[messenger]
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Фокус без прокрутки: форма в этот момент раскрывается из нулевой высоты, autoFocus «подкрутил» бы контейнер
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      await openChat(phone)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать чат')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      aria-labelledby="new-chat-title"
      className="mx-3 mb-3 flex flex-col gap-3 rounded-2xl border border-line bg-surface/60 p-3"
    >
      <div className="flex items-center justify-between">
        <h2 id="new-chat-title" className="pl-1 text-[15px] font-semibold">
          Новый чат в {name}
        </h2>
        <IconButton type="button" onClick={onClose} aria-label="Отмена" className="-my-1 size-8 max-md:size-10">
          <CloseIcon width={18} height={18} />
        </IconButton>
      </div>
      <Field
        id="new-chat-phone"
        label={usernames ? 'Номер телефона или @username' : 'Номер телефона получателя'}
        type={usernames ? 'text' : 'tel'}
        inputMode={usernames ? 'text' : 'tel'}
        autoComplete={usernames ? 'off' : 'tel'}
        placeholder={usernames ? '+7 999 123-45-67 или @username' : '+7 999 123-45-67'}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={error}
        ref={inputRef}
        className="bg-panel"
      />
      <Button type="submit" loading={loading} disabled={!phone.trim()}>
        {loading ? `Ищем в ${name}…` : 'Создать чат'}
      </Button>
    </form>
  )
}
