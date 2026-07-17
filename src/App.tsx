import { useState, useCallback, useRef, useEffect } from 'react'
import { Sidebar, type UserProfile } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { LoginDialog } from './components/LoginDialog'
import type { SessionInfo } from './mockData'
import { SettingsPanel } from './components/SettingsPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WelcomeScreen } from './components/WelcomeScreen'
import type { ChatInputHandle } from './components/ChatInput'
import {
  listSessions, deleteSession, renameSession, getStoredServerUrl, setStoredServerUrl,
  getAuthUser, setAuthUser, clearAuthUser, getMessages,
} from './lib/piApi'
import { upsertSession, summarizeTitle } from './lib/sessionState'

function pickDefaultServerUrl(): string {
  return 'http://192.168.157.117:3000'
}

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? `v${__APP_VERSION__}`

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null)
  const [selectedCwd, setSelectedCwd] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('pi-default-cwd')
      if (saved) return saved
    } catch { /* ignore */ }
    return 'E:\\\\SuperkingBackend'
  })
  const [language, setLanguage] = useState<'zh' | 'en'>(() => {
    try {
      const saved = localStorage.getItem('pi-language')
      return saved === 'en' ? 'en' : 'zh'
    } catch { return 'zh' }
  })

  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('pi-theme') === 'dark' } catch { return false }
  })
  const [fontSize, setFontSize] = useState(() => {
    try {
      const saved = localStorage.getItem('pi-font-size')
      if (saved !== null) {
        const v = Number(saved)
        if (v >= 12 && v <= 24) return v
      }
      const m = localStorage.getItem('pi-mode')
      return m === 'senior' ? 18 : 14
    } catch { return 14 }
  })
  const [mode, setMode] = useState<'young' | 'senior'>(() => {
    try { const v = localStorage.getItem('pi-mode'); return v === 'senior' ? 'senior' : 'young' } catch { return 'young' }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' } | null>(null)
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      const saved = getStoredServerUrl()
      const fallback = pickDefaultServerUrl()
      return saved || (import.meta.env.VITE_PI_API_BASE as string | undefined) || fallback
    } catch { return pickDefaultServerUrl() }
  })
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('pi-pinned-sessions')
      return new Set(raw ? JSON.parse(raw) as string[] : [])
    } catch { return new Set<string>() }
  })
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const auth = getAuthUser()
    return { name: auth?.name ?? '' }
  })
  const chatInputRef = useRef<ChatInputHandle | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const isLoggedIn = userProfile.name.trim().length > 0

  const handleLoginSuccess = useCallback((name: string, token: string) => {
    setAuthUser(name, token)
    setUserProfile({ name })
  }, [])

  const handleLogout = useCallback(() => {
    clearAuthUser()
    setUserProfile({ name: '' })
    setSettingsOpen(false)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('pi-default-cwd', selectedCwd ?? 'E:\\\\SuperkingBackend') } catch { /* ignore */ }
  }, [selectedCwd])

  useEffect(() => {
    try { localStorage.setItem('pi-language', language) } catch { /* ignore */ }
  }, [language])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('pi-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    document.documentElement.classList.toggle('senior-mode', mode === 'senior')
    localStorage.setItem('pi-mode', mode)
  }, [mode])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`)
    localStorage.setItem('pi-font-size', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    setStoredServerUrl(serverUrl)
  }, [serverUrl])

  useEffect(() => {
    setStoredServerUrl(serverUrl)
  }, [serverUrl])

  const loadSessionsForCwd = useCallback((cwd: string | null) => {
    let cancelled = false
    setSessionsLoading(true)
    listSessions(cwd ?? undefined)
      .then((loaded) => {
        if (cancelled) return
        setSessions(loaded)
        setSessionLoadError(null)
        // 服务器列表接口不返回 sessionName，对没有标题的会话批量加载第一条消息生成标题
        const unnamed = loaded.filter((s) => !s.name && !s.firstMessage)
        if (unnamed.length > 0) {
          unnamed.forEach((session) => {
            getMessages(session.id)
              .then((messages) => {
                if (cancelled) return
                const firstUser = messages.find((m) => m.role === 'user')
                if (firstUser?.content) {
                  const title = summarizeTitle(firstUser.content.trim())
                  setSessions((prev) => prev.map((s) =>
                    s.id === session.id ? { ...s, name: title, firstMessage: title } : s
                  ))
                }
              })
              .catch(() => { /* skip broken sessions */ })
          })
        }
      })
      .catch((error) => {
        if (cancelled) return
        setSessions([])
        setSessionLoadError(error instanceof Error ? error.message : '无法连接 Super-King 后端')
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false)
      })
    return () => { cancelled = true }
  }, [serverUrl])

  // 依赖 serverUrl：用户在设置面板改了地址，立即重试连接，不需要切目录。
  useEffect(() => loadSessionsForCwd(selectedCwd), [loadSessionsForCwd, selectedCwd])

  // 连接失败后自动重试：用户可能正在启动 super-king，每隔 5 秒刷新一次会话列表。
  const refreshSessions = useCallback(() => loadSessionsForCwd(selectedCwd), [loadSessionsForCwd, selectedCwd])
  useEffect(() => {
    if (!sessionLoadError) return
    const intervalId = setInterval(() => {
      refreshSessions()
    }, 5000)
    return () => clearInterval(intervalId)
  }, [sessionLoadError, refreshSessions])

  const handleSelectSession = useCallback((session: SessionInfo) => {
    setNewSessionCwd(null)
    setSelectedSession(session)
    try { localStorage.setItem('pi-last-session-id', session.id) } catch { /* ignore */ }
  }, [])

  const handleNewSession = useCallback(() => {
    setSelectedSession(null)
    setNewSessionCwd(selectedCwd)
    try { localStorage.removeItem('pi-last-session-id') } catch { /* ignore */ }
  }, [selectedCwd])

  // 刷新后恢复上次选中的会话：等 sessions 列表加载完，从里面找 last-session-id
  useEffect(() => {
    if (sessions.length === 0 || selectedSession !== null || newSessionCwd !== null) return
    try {
      const lastId = localStorage.getItem('pi-last-session-id')
      if (!lastId) return
      const found = sessions.find((s) => s.id === lastId)
      if (found) setSelectedSession(found)
    } catch { /* ignore */ }
  }, [sessions, selectedSession, newSessionCwd])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') {
          e.preventDefault()
          setSidebarOpen((v) => !v)
        }
        if (e.key === 'n') {
          e.preventDefault()
          handleNewSession()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNewSession])

  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setSessions((current) => upsertSession(current, session))
    // 同步更新当前选中会话的标题，避免 session_renamed 后主界面/侧边栏标题还是旧 ID
    setSelectedSession((current) => {
      if (current?.id !== session.id) return current
      return {
        ...current,
        ...session,
        firstMessage: session.firstMessage ?? current.firstMessage,
        name: session.name ?? current.name,
      }
    })
  }, [])

  const handleRenameSession = useCallback(async (session: SessionInfo, name: string) => {
    try {
      const renamed = await renameSession(session.id, name, session.cwd)
      const merged = { ...renamed, cwd: session.cwd }
      setSessions((current) => upsertSession(current, { ...session, ...merged }))
      setSelectedSession((current) => current?.id === session.id ? { ...current!, ...merged } : current)
    } catch (err) {
      setToast({ message: '重命名失败：' + (err instanceof Error ? err.message : String(err)), type: 'error' })
    }
  }, [])

  const handlePinSession = useCallback((session: SessionInfo) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(session.id)) {
        next.delete(session.id)
      } else {
        next.add(session.id)
      }
      localStorage.setItem('pi-pinned-sessions', JSON.stringify([...next]))
      return next
    })
  }, [])

  const handleDeleteSession = useCallback(async (session: SessionInfo) => {
    try {
      await deleteSession(session.id)
      if (selectedSession?.id === session.id) {
        setSelectedSession(null)
        setNewSessionCwd(session.cwd ?? selectedCwd)
        try { localStorage.removeItem('pi-last-session-id') } catch { /* ignore */ }
      }
      setSessions((current) => current.filter((s) => s.id !== session.id))
    } catch (err) {
      setToast({ message: '删除失败：' + (err instanceof Error ? err.message : String(err)), type: 'error' })
    }
  }, [selectedSession, selectedCwd])

  const showChat = selectedSession !== null || newSessionCwd !== null

  if (!isLoggedIn) {
    return (
      <ErrorBoundary>
        <LoginDialog onSuccess={handleLoginSuccess} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <>
      <div className="noise-overlay" aria-hidden="true" />
      <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Left sidebar - always visible */}
        <div style={{
          width: sidebarOpen ? 260 : 0,
          minWidth: sidebarOpen ? 260 : 0,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease, min-width 0.2s ease',
        }}>
          <div style={{ width: 260, minWidth: 260, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Sidebar
              sessions={sessions}
              selectedId={selectedSession?.id ?? null}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              onPinSession={handlePinSession}
              pinnedIds={pinnedIds}
              sessionLoadError={sessionLoadError}
              sessionsLoading={sessionsLoading}
              onToast={(message, type) => setToast({ message, type })}
              onRefreshSessions={refreshSessions}
              onOpenSettings={() => setSettingsOpen(true)}
              userProfile={userProfile}
              onProfileChange={(p) => { if (!p.name) handleLogout() }}
            />
          </div>
        </div>

        {/* Center: chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', flexShrink: 0,
            borderBottom: '1px solid var(--border)', height: 36, background: 'var(--bg)',
          }}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? '收起侧边栏 (Ctrl+B)' : '展开侧边栏 (Ctrl+B)'}
              className="btn-ghost-icon"
              style={{ width: 36, height: 36 }}
            >
              {sidebarOpen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setIsDark((v) => !v)}
              title={isDark ? '切换到浅色模式' : '切换到深色模式'}
              className="btn-ghost-icon"
              style={{ width: 36, height: 36 }}
            >
              {isDark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="设置"
              className={`btn-icon ${settingsOpen ? 'active' : ''}`}
              style={{ width: 32, height: 32, marginRight: 4 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          {/* Chat content */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {showChat ? (
              <ChatArea
                session={selectedSession}
                selectedCwd={selectedCwd}
                newSessionCwd={newSessionCwd}
                chatInputRef={chatInputRef}
                onSessionCreated={handleSessionCreated}
              />
            ) : (
              <WelcomeScreen
                chatInputRef={chatInputRef}
                onSend={() => setToast({ message: '请先从左侧新建或选择会话', type: 'error' })}
                institution={APP_INSTITUTION}
              />
            )}
          </div>
        </div>
      </div>
      {settingsOpen && (
        <SettingsPanel
          isDark={isDark}
          onThemeChange={setIsDark}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          mode={mode}
          onModeChange={setMode}
          serverUrl={serverUrl}
          onServerUrlChange={setServerUrl}
          onClose={() => setSettingsOpen(false)}
          userProfile={userProfile}
          onProfileChange={(p) => { if (!p.name) handleLogout() }}
          selectedCwd={selectedCwd}
          onCwdChange={setSelectedCwd}
          language={language}
          onLanguageChange={setLanguage}
        />
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 'var(--radius-lg)',
          background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)', color: '#fff',
          fontSize: 'calc(var(--font-base) * 0.929)', fontWeight: 600, boxShadow: 'var(--shadow-lg)',
          zIndex: 'var(--z-toast)', transition: 'opacity 0.3s',
        }}>
          {toast.message}
        </div>
      )}
    </>
    </ErrorBoundary>
  )
}
