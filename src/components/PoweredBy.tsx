import { cn } from '../lib/cn'

/** Атрибуция платформы: официальный логотип GREEN-API со ссылкой на сайт */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <a
      href="https://green-api.com/"
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-surface hover:text-fg',
        className,
      )}
    >
      <span>Powered by</span>
      <img src="./green-api-logo.svg" alt="GREEN-API" width={66} height={20} className="h-5 w-auto" />
    </a>
  )
}
