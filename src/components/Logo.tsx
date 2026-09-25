import { useId } from 'react'

/** Знак приложения: белый пузырь с галочкой на зелёном GREEN-API */
export function Logo({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="GREEN Chat">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#6cc21e" />
          <stop offset="1" stopColor="#3b9702" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <path
        d="M24 14h16c5.5 0 10 4.5 10 10v9c0 5.5-4.5 10-10 10H30.5l-8.3 6.2c-1.3 1-3.2.1-3.2-1.6v-5.3c-3-1.7-5-5-5-8.8v-9.5c0-5.5 4.5-10 10-10z"
        fill="#fff"
      />
      <path d="m24.5 28.5 5 5 10-10" fill="none" stroke="#3b9702" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
