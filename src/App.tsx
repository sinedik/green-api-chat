import { useCallback, useEffect, useState } from 'react'
import type { Credentials } from './api/types'
import { ChatView } from './components/ChatView'
import { ContactPanel } from './components/ContactPanel'
import { InstanceBanner } from './components/InstanceBanner'
import { LoginScreen } from './components/LoginScreen'
import { Logo } from './components/Logo'
import { PoweredBy } from './components/PoweredBy'
import { ProfilePanel } from './components/ProfilePanel'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/ui'
import { APP_NAME } from './lib/brand'
import { cn } from './lib/cn'
import { MESSENGERS } from './lib/messenger'
import { clearChats, clearCredentials, CREDENTIALS_KEY, loadCredentials, saveCredentials } from './lib/storage'
import { totalUnread } from './store/chatReducer'
import { useChatState } from './store/chatContext'
import { ChatProvider } from './store/ChatProvider'

export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(loadCredentials)

  const handleLogin = useCallback((next: Credentials, remember: boolean) => {
    // Демо каждый раз начинается с чистой истории
    if (next.demo) clearChats(next.idInstance)
    saveCredentials(next, remember)
    setCredentials(next)
  }, [])

  const handleLogout = useCallback(() => {
    clearCredentials()
    setCredentials(null)
  }, [])

  // Выход в одной вкладке — выход во всех
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CREDENTIALS_KEY && e.newValue === null) setCredentials(null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!credentials) return <LoginScreen onLogin={handleLogin} />

  return (
    <ChatProvider key={credentials.idInstance} credentials={credentials} onLogout={handleLogout}>
      <ChatLayout />
      <Toaster />
    </ChatProvider>
  )
}

function ChatLayout() {
  const { state, messenger } = useChatState()
  const [profileOpen, setProfileOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const activeChat = state.activeChatId ? state.chats[state.activeChatId] : undefined
  const unread = totalUnread(state)

  // Непрочитанные — в заголовке вкладки, чтобы было видно из другой вкладки
  useEffect(() => {
    document.title = `${unread ? `(${unread}) ` : ''}${APP_NAME} · ${MESSENGERS[messenger].name}`
  }, [unread, messenger])

  const showInfo = infoOpen && !!activeChat

  // На мобильных виден один экран: список (или профиль), чат, либо информация о собеседнике
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <InstanceBanner />
      <div className="relative flex min-h-0 flex-1">
        {profileOpen ? (
          <ProfilePanel
            onClose={() => setProfileOpen(false)}
            className={cn('w-full border-r border-line md:w-[340px] md:shrink-0 lg:w-[380px]', activeChat && 'max-md:hidden')}
          />
        ) : (
          <Sidebar
            onOpenProfile={() => setProfileOpen(true)}
            className={cn('w-full md:w-[320px] md:shrink-0 lg:w-[380px]', activeChat && 'max-md:hidden')}
          />
        )}

        <main className={cn('flex min-w-0 flex-1 flex-col', (!activeChat || showInfo) && 'max-md:hidden')}>
          {activeChat ? (
            <ChatView key={activeChat.id} chat={activeChat} onOpenInfo={() => setInfoOpen((v) => !v)} />
          ) : (
            <NoChatSelected />
          )}
        </main>

        {/* До xl панель выезжает поверх чата: на планшете рядом с ней чату осталось бы ~130px */}
        {showInfo && (
          <ContactPanel
            chat={activeChat}
            onClose={() => setInfoOpen(false)}
            className="w-full animate-[slide-in_200ms_ease-out] md:w-[340px] md:shrink-0 max-xl:md:absolute max-xl:md:inset-y-0 max-xl:md:right-0 max-xl:md:z-20 max-xl:md:shadow-2xl max-xl:md:shadow-black/30 xl:w-[360px] xl:animate-none"
          />
        )}
      </div>
    </div>
  )
}

function NoChatSelected() {
  return (
    <div className="chat-pattern flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Logo className="size-16" />
      <p className="mt-2 text-lg font-semibold">{APP_NAME}</p>
      <p className="max-w-xs text-sm text-muted">Выберите чат или создайте новый</p>
      {/* Каждая подсказка не переносится целиком, чтобы клавиша не отрывалась от действия */}
      <ul className="mt-4 hidden max-w-md flex-wrap justify-center gap-x-3 gap-y-1 text-xs leading-6 text-muted md:flex">
        <li className="whitespace-nowrap">
          <Kbd>Enter</Kbd> отправить
        </li>
        <li className="whitespace-nowrap">
          <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> перенос
        </li>
        <li className="whitespace-nowrap">
          <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> поиск
        </li>
        <li className="whitespace-nowrap">
          <Kbd>Esc</Kbd> назад
        </li>
      </ul>
      <PoweredBy className="mt-6" />
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-sans text-[11px]">{children}</kbd>
}
