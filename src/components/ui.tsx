import { useEffect, useId, useRef, useState, type ComponentProps, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cn } from '../lib/cn'
import { useChatActions, useChatState } from '../store/chatContext'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons'

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Загрузка"
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  )
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

export function Button({ variant = 'primary', loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent-strong text-white hover:bg-accent-strong-hover',
        variant === 'secondary' && 'bg-surface text-fg hover:bg-surface-hover',
        variant === 'ghost' && 'text-accent hover:bg-surface',
        variant === 'danger' && 'bg-danger-strong text-white hover:bg-danger-strong/90',
        className,
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function IconButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={cn(
        // На тач-экранах — зона нажатия 44px
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors max-md:size-11',
        'hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Элемент рядом с подписью, например подсказка */
  labelExtra?: ReactNode
  hint?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function Field({ label, labelExtra, hint, error, id, className, children, ref, ...props }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        {labelExtra}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(
            'h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] text-fg outline-none transition-colors placeholder:text-muted',
            error ? 'border-danger' : 'border-transparent focus:border-accent',
            className,
          )}
          {...props}
        />
        {children}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-[13px] text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
  hint?: string
}) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-3', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full bg-surface-hover transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          'after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform',
          checked && 'bg-accent-strong after:translate-x-4',
        )}
      />
    </label>
  )
}

/** Модальное окно на нативном <dialog>: фокус-ловушка, Esc и затемнение фона — из коробки */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="dialog-title"
      className={cn(
        'm-auto w-[min(400px,calc(100vw-32px))] rounded-2xl border border-line bg-panel p-0 text-fg shadow-2xl shadow-black/30 backdrop:bg-black/50 backdrop:backdrop-blur-[2px]',
        'open:animate-[dialog-in_160ms_ease-out]',
        className,
      )}
    >
      {open && (
        <div className="p-6">
          <h2 id="dialog-title" className="mb-2 text-[17px] leading-6 font-semibold">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {description && <p className="text-[15px] leading-5 text-muted">{description}</p>}
      {children}
      <div className="mt-6 flex justify-end gap-2 max-sm:flex-col-reverse max-sm:[&>*]:w-full">
        <Button variant="secondary" onClick={onClose} className="h-10 px-4 max-sm:h-11">
          Отмена
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
          className="h-10 px-4 max-sm:h-11"
          autoFocus
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}

const TOAST_ICONS = { error: AlertIcon, success: CheckIcon, info: InfoIcon }

export function Toaster() {
  const { toasts } = useChatState()
  const { dismissToast } = useChatActions()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 max-md:bottom-20"
    >
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md animate-[toast-in_200ms_ease-out] items-center gap-3 rounded-2xl border border-line bg-panel py-2.5 pr-2 pl-4 text-sm shadow-xl shadow-black/20"
          >
            <Icon
              width={18}
              height={18}
              className={cn(
                'shrink-0',
                toast.tone === 'error' && 'text-danger',
                toast.tone === 'success' && 'text-success',
                toast.tone === 'info' && 'text-accent',
              )}
            />
            <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{toast.text}</p>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Закрыть уведомление"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Иконка «?» с подсказкой: открывается по наведению и по клику (на тач-экранах), закрывается по Esc и клику мимо */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        // Клик только открывает: после наведения подсказка уже открыта и не должна закрыться
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="flex size-5 items-center justify-center rounded-full text-muted transition-colors hover:text-fg"
      >
        <InfoIcon width={15} height={15} />
      </button>
      {open && (
        // Прозрачный отступ снизу — «мостик», чтобы курсор дошёл до ссылки, не закрыв подсказку
        <span id={id} role="tooltip" className="absolute bottom-full -left-2 z-20 w-64 pb-2">
          <span className="block animate-[menu-in_120ms_ease-out] rounded-xl border border-line bg-panel p-3 text-[13px] leading-[18px] font-normal text-fg shadow-xl">
            {children}
          </span>
        </span>
      )}
    </span>
  )
}
