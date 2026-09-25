import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import type { Message } from '../store/chatReducer'
import { CheckIcon, CloseIcon, PencilIcon, SendIcon } from './icons'

const MAX_TEXTAREA_HEIGHT = 200
/** Счётчик символов показываем, когда до лимита осталось меньше этого */
const COUNTER_THRESHOLD = 500
const draftKey = (chatId: string) => `green-chat:draft:${chatId}`

// Черновики — в sessionStorage: переживают перезагрузку и переключение чатов, но не закрытие вкладки
function loadDraft(chatId: string): string {
  try {
    return sessionStorage.getItem(draftKey(chatId)) ?? ''
  } catch {
    return ''
  }
}

function saveDraft(chatId: string, value: string) {
  try {
    if (value) sessionStorage.setItem(draftKey(chatId), value)
    else sessionStorage.removeItem(draftKey(chatId))
  } catch {
    /* ignore */
  }
}

/** На тач-устройствах Enter — перенос строки (как в мобильных мессенджерах), отправка — кнопкой */
const isTouch = () => window.matchMedia('(pointer: coarse)').matches

interface Props {
  chatId: string
  /** Лимит GREEN-API на длину текста: 4000 для MAX, 4096 для Telegram */
  maxLength: number
  onSend: (text: string) => void
  onTyping: () => void
  /** Редактируемое сообщение — поле переключается в режим правки */
  editing: Message | null
  onEditSubmit: (text: string) => void
  onEditCancel: () => void
  /** Esc в пустом поле — вернуться к списку чатов */
  onEscape: () => void
}

export function Composer({ chatId, maxLength, onSend, onTyping, editing, onEditSubmit, onEditCancel, onEscape }: Props) {
  const [text, setText] = useState(() => loadDraft(chatId))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftBeforeEdit = useRef('')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Вход в режим правки: подставляем текст сообщения прямо во время рендера (без лишнего эффекта)
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null)
    if (editing) setText(editing.text)
  }

  const trimmed = text.trim()
  const tooLong = text.length > maxLength
  const canSend = trimmed.length > 0 && !tooLong && (!editing || trimmed !== editing.text)

  // При входе в режим правки черновик откладываем, курсор ставим в конец текста
  useEffect(() => {
    if (!editing) return
    draftBeforeEdit.current = loadDraft(chatId)
    const el = textareaRef.current
    el?.focus()
    requestAnimationFrame(() => el?.setSelectionRange(el.value.length, el.value.length))
  }, [editing, chatId])

  // Фокус в поле при открытии чата — только с мышью/клавиатурой, чтобы на телефоне не выскакивала клавиатура
  useEffect(() => {
    if (!isTouch()) textareaRef.current?.focus()
  }, [chatId])

  // Авто-высота поля ввода до ~8 строк
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [text])

  function update(value: string) {
    setText(value)
    if (!editing) {
      saveDraft(chatId, value)
      if (value.trim()) onTyping()
    }
  }

  function exitEdit() {
    setText(draftBeforeEdit.current)
    onEditCancel()
  }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSend) return
    if (editing) {
      onEditSubmit(trimmed)
      setText(draftBeforeEdit.current)
    } else {
      onSend(trimmed)
      update('')
    }
    textareaRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (editing) exitEdit()
      else if (!text) onEscape()
      return
    }
    // Enter — отправить, Shift+Enter — перенос строки; во время IME-ввода Enter не трогаем
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !isTouch()) submit(event)
  }

  return (
    <form onSubmit={submit} className="shrink-0 border-t border-line bg-panel px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      {editing && (
        <div className="mx-auto mb-2 flex max-w-3xl animate-[toast-in_160ms_ease-out] items-center gap-3 border-l-2 border-accent pl-3">
          <PencilIcon width={18} height={18} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-accent">Редактирование</p>
            <p className="truncate text-[13px] text-muted">{editing.text}</p>
          </div>
          <button
            type="button"
            onClick={exitEdit}
            aria-label="Отменить редактирование"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg max-md:size-11"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="relative flex-1">
          <label htmlFor="composer" className="sr-only">
            {editing ? 'Изменить сообщение' : 'Сообщение'}
          </label>
          <textarea
            id="composer"
            ref={textareaRef}
            rows={1}
            value={text}
            dir="auto"
            onChange={(e) => update(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение"
            enterKeyHint={isTouch() ? 'enter' : 'send'}
            aria-invalid={tooLong}
            className={cn(
              'scrollbar-thin block w-full resize-none rounded-[22px] bg-surface px-4 py-2.5 text-[15px] leading-[1.4] outline-none transition-colors placeholder:text-muted focus:bg-surface-hover',
              tooLong && 'ring-2 ring-danger',
            )}
            style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
          />
          {text.length > maxLength - COUNTER_THRESHOLD && (
            <span
              className={cn('absolute -top-5 right-2 text-xs', tooLong ? 'text-danger' : 'text-muted')}
              aria-live="polite"
            >
              {text.length} / {maxLength}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSend}
          aria-label={editing ? 'Сохранить' : 'Отправить'}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white transition-all duration-150 hover:bg-accent-strong-hover',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            canSend ? 'scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0',
          )}
        >
          {editing ? <CheckIcon width={20} height={20} /> : <SendIcon />}
        </button>
      </div>
    </form>
  )
}
