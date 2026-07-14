import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  User,
  Gear,
  Palette,
  Cube,
  Keyboard,
  Question,
  X,
  Check,
  Moon,
  Sun,
  ArrowClockwise,
  Star,
} from '@phosphor-icons/react'
import { testConnection, setStoredServerUrl, listModels, getConfig } from '../lib/piApi'
import type { ModelProviderInfo, ConfigInfo } from '../lib/piApi'
import type { UserProfile } from './Sidebar'

type TabId = 'account' | 'system' | 'personalization' | 'models' | 'shortcuts' | 'help'

interface Props {
  isDark: boolean
  onThemeChange: (dark: boolean) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  mode: 'young' | 'senior'
  onModeChange: (mode: 'young' | 'senior') => void
  serverUrl: string
  onServerUrlChange: (url: string) => void
  onClose: () => void
  userProfile: UserProfile
  onProfileChange: (p: UserProfile) => void
}

const ALL_FONT_SIZES = [14, 16, 18, 20, 22]
const DEFAULT_SIZE = 16
const MAX_USERNAME_LEN = 10

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?'
  const hue = name.trim() ? nameToHue(name) : 215
  const bg = name.trim() ? `hsl(${hue} 65% 45%)` : 'var(--text-muted)'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size < 36 ? 13 : 15,
        fontWeight: 600,
        flexShrink: 0,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15), 0 0 0 1px hsl(${hue} 50% 30% / 0.25)`,
      }}
    >
      {initial}
    </div>
  )
}

function nameToHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash % 360)
}

export function SettingsPanel({
  isDark,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  mode,
  onModeChange,
  serverUrl,
  onServerUrlChange,
  onClose,
  userProfile,
  onProfileChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('account')
  const [draftName, setDraftName] = useState(userProfile.name.slice(0, MAX_USERNAME_LEN))
  const [draftEmail, setDraftEmail] = useState(userProfile.email)
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl)
  const [testStatus, setTestStatus] = useState<{ loading: boolean; ok?: boolean; message?: string } | null>(null)
  const [draftTheme, setDraftTheme] = useState(isDark)
  const [draftFontSize, setDraftFontSize] = useState(fontSize)
  const [draftMode, setDraftMode] = useState(mode)

  const [models, setModels] = useState<ModelProviderInfo[]>([])
  const [config, setConfig] = useState<ConfigInfo | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const [shortcuts, setShortcuts] = useState<{ action: string; key: string }[]>(() => {
    try {
      const raw = localStorage.getItem('pi-shortcuts')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return [
      { action: '新建对话', key: 'Ctrl + N' },
      { action: '切换侧边栏', key: 'Ctrl + B' },
      { action: '发送消息', key: 'Enter' },
      { action: '换行', key: 'Shift + Enter' },
    ]
  })

  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    queueMicrotask(() => {
      setDraftServerUrl(serverUrl)
      setDraftTheme(isDark)
      setDraftFontSize(fontSize)
      setDraftMode(mode)
    })
  }, [serverUrl, isDark, fontSize, mode])

  useEffect(() => {
    setDraftName(userProfile.name.slice(0, MAX_USERNAME_LEN))
    setDraftEmail(userProfile.email)
  }, [userProfile])

  useEffect(() => {
    try { localStorage.setItem('pi-shortcuts', JSON.stringify(shortcuts)) } catch { /* ignore */ }
  }, [shortcuts])

  useEffect(() => {
    if (activeTab !== 'models') return
    setModelsLoading(true)
    setModelsError(null)
    Promise.all([listModels(), getConfig()])
      .then(([modelsData, configData]) => {
        setModels(modelsData)
        setConfig(configData)
      })
      .catch((err) => {
        setModelsError(err instanceof Error ? err.message : '加载模型失败')
      })
      .finally(() => setModelsLoading(false))
  }, [activeTab])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const applyServerSettings = useCallback((url: string) => {
    const trimmedUrl = url.trim()
    try {
      setStoredServerUrl(trimmedUrl)
    } catch (err) {
      console.error('Failed to save server settings to localStorage:', err)
      return false
    }
    onServerUrlChange(trimmedUrl)
    return true
  }, [onServerUrlChange])

  const saveAll = useCallback(() => {
    applyServerSettings(draftServerUrl)
    onThemeChange(draftTheme)
    onFontSizeChange(draftFontSize)
    onModeChange(draftMode)
  }, [draftServerUrl, draftTheme, draftFontSize, draftMode, applyServerSettings, onThemeChange, onFontSizeChange, onModeChange])

  const handleSaveProfile = useCallback(() => {
    const trimmedName = draftName.trim().slice(0, MAX_USERNAME_LEN)
    const trimmedEmail = draftEmail.trim()
    onProfileChange({ name: trimmedName, email: trimmedEmail })
    setIsEditingProfile(false)
  }, [draftName, draftEmail, onProfileChange])

  const handleLogout = useCallback(() => {
    onProfileChange({ name: '', email: '' })
  }, [onProfileChange])

  const testConnectionHandler = useCallback(async () => {
    setTestStatus({ loading: true })
    try {
      setStoredServerUrl(draftServerUrl.trim())
      await testConnection()
      const applied = applyServerSettings(draftServerUrl)
      setTestStatus({
        loading: false,
        ok: true,
        message: applied ? '连接成功，设置已应用' : '连接成功，但保存设置时出错',
      })
    } catch (err) {
      setTestStatus({ loading: false, ok: false, message: err instanceof Error ? err.message : '连接失败' })
    }
  }, [draftServerUrl, applyServerSettings])

  const menuItems: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: '账户管理', icon: <User weight="duotone" size={18} /> },
    { id: 'system', label: '系统设置', icon: <Gear weight="duotone" size={18} /> },
    { id: 'personalization', label: '个性化', icon: <Palette weight="duotone" size={18} /> },
    { id: 'models', label: '模型', icon: <Cube weight="duotone" size={18} /> },
    { id: 'shortcuts', label: '快捷键', icon: <Keyboard weight="duotone" size={18} /> },
    { id: 'help', label: '帮助与反馈', icon: <Question weight="duotone" size={18} /> },
  ]

  const renderAccount = () => (
    <div>
      <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>账户管理</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        <Avatar name={userProfile.name} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {userProfile.name || '未登录用户'}
          </div>
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
            {userProfile.email || '暂无邮箱'}
          </div>
        </div>
      </div>

      {isEditingProfile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>昵称</label>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value.slice(0, MAX_USERNAME_LEN))}
              placeholder="请输入昵称"
              className="input-field"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>邮箱</label>
            <input
              type="email"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              placeholder="请输入邮箱（可选）"
              className="input-field"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={handleSaveProfile} className="btn-save">保存</button>
            <button onClick={() => setIsEditingProfile(false)} className="btn-ghost">取消</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <button onClick={() => setIsEditingProfile(true)} className="btn-ghost">编辑资料</button>
          {userProfile.name && (
            <button onClick={handleLogout} className="btn-danger">退出登录</button>
          )}
        </div>
      )}

      <div style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>本地账户说明</div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          当前为本地体验模式，账户信息仅保存在浏览器 localStorage 中。云端登录、Credits、订阅权益等功能需要后端接入 auth 服务后启用。
        </div>
      </div>
    </div>
  )

  const renderSystem = () => (
    <div>
      <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>系统设置</h2>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>服务器连接</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={draftServerUrl}
            onChange={(e) => setDraftServerUrl(e.target.value)}
            placeholder="http://127.0.0.1:3000"
            className="input-field"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button onClick={testConnectionHandler} disabled={testStatus?.loading} className="btn-test">
            {testStatus?.loading ? '测试中...' : '测试连接'}
          </button>
        </div>
        {testStatus && !testStatus.loading && (
          <div style={{ marginTop: 8, fontSize: 12, color: testStatus.ok ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {testStatus.ok ? (
              <Check weight="bold" size={14} />
            ) : (
              <X weight="bold" size={14} />
            )}
            {testStatus.message}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>使用模式</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setDraftMode('young')} className={`btn-mode ${draftMode === 'young' ? 'active' : ''}`}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: draftMode === 'young' ? 'var(--accent)' : 'var(--bg-selected)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Star weight="fill" size={22} color={draftMode === 'young' ? '#fff' : 'var(--accent)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>青年教师版</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>现代化界面，标准字体，功能完整</div>
            </div>
            {draftMode === 'young' && <Check weight="bold" size={20} color="var(--accent)" />}
          </button>
          <button onClick={() => setDraftMode('senior')} className={`btn-mode ${draftMode === 'senior' ? 'active senior' : ''}`}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: draftMode === 'senior' ? 'var(--accent-senior)' : 'var(--bg-selected)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sun weight="fill" size={22} color={draftMode === 'senior' ? '#fff' : 'var(--accent-senior)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>老教师版本</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>大字体、高对比度、简洁布局</div>
            </div>
            {draftMode === 'senior' && <Check weight="bold" size={20} color="var(--accent-senior)" />}
          </button>
        </div>
      </div>
    </div>
  )

  const renderPersonalization = () => (
    <div>
      <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>个性化</h2>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>主题外观</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setDraftTheme(true)} className={`btn-theme ${draftTheme ? 'active' : ''}`}>
            <Moon weight="fill" size={18} />
            深色
          </button>
          <button onClick={() => setDraftTheme(false)} className={`btn-theme ${!draftTheme ? 'active' : ''}`}>
            <Sun weight="fill" size={18} />
            浅色
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>字体大小</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ALL_FONT_SIZES.map((size) => {
            const isSelected = draftFontSize === size
            const isStandard = size === DEFAULT_SIZE
            return (
              <button key={size} onClick={() => setDraftFontSize(size)} className={`btn-font-size ${isSelected ? 'active' : ''} ${draftMode === 'senior' ? 'senior' : ''}`}>
                <div style={{ fontSize: size, fontWeight: 700, marginBottom: 2, lineHeight: 1.2 }}>Aa</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{size}px</div>
                {isStandard && <div className={`font-size-badge ${isSelected ? 'active' : ''} ${draftMode === 'senior' ? 'senior' : ''}`}>标准</div>}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 18, padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 500 }}>预览效果</div>
          <div style={{ fontSize: draftFontSize, lineHeight: 1.6, color: 'var(--text)' }}>
            超级小金可以帮助您备课、批改作业、生成教案，让教学工作更加轻松高效。
          </div>
        </div>
      </div>
    </div>
  )

  const renderModels = () => (
    <div>
      <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>模型</h2>

      {config?.defaultModel && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>当前默认模型</div>
          <div style={{ fontSize: 'var(--font-md)', fontWeight: 600, color: 'var(--text)' }}>
            {config.defaultModel.provider} / {config.defaultModel.modelId || config.defaultModel.id}
          </div>
        </div>
      )}

      {modelsLoading ? (
        <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>加载模型列表中…</div>
      ) : modelsError ? (
        <div style={{ color: 'var(--danger)', padding: '20px 0' }}>{modelsError}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {models.map((provider) => (
            <div key={provider.id} style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--font-sm)', fontWeight: 700, color: 'var(--text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cube weight="duotone" size={16} />
                {provider.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {provider.models.map((model) => (
                  <div key={model.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text)', fontWeight: 500 }}>{model.name}</div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                        {model.contextWindow ? `上下文 ${model.contextWindow.toLocaleString()} tokens` : ''}
                        {model.maxTokens ? ` · 最大 ${model.maxTokens.toLocaleString()} tokens` : ''}
                        {model.reasoning ? ' · 支持推理' : ''}
                      </div>
                    </div>
                    {config?.defaultModel?.modelId === model.id || config?.defaultModel?.id === model.id ? (
                      <span style={{ fontSize: 'var(--font-xs)', color: 'var(--accent)', fontWeight: 600, padding: '2px 8px', background: 'var(--accent-bg)', borderRadius: 'var(--radius-lg)' }}>默认</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderShortcuts = () => (
    <div>
      <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>快捷键</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shortcuts.map((shortcut, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
            <input
              type="text"
              value={shortcut.action}
              onChange={(e) => {
                const next = [...shortcuts]
                next[index].action = e.target.value
                setShortcuts(next)
              }}
              className="input-field"
              style={{ flex: 1, border: 'none', background: 'transparent' }}
            />
            <input
              type="text"
              value={shortcut.key}
              onChange={(e) => {
                const next = [...shortcuts]
                next[index].key = e.target.value
                setShortcuts(next)
              }}
              className="input-field"
              style={{ width: 120, textAlign: 'center', border: 'none', background: 'transparent', fontFamily: 'var(--font-mono)' }}
            />
            <button
              onClick={() => setShortcuts(shortcuts.filter((_, i) => i !== index))}
              style={{ padding: '4px 8px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setShortcuts([...shortcuts, { action: '', key: '' }])}
        className="btn-ghost"
        style={{ marginTop: 12 }}
      >
        添加快捷键
      </button>
      <div style={{ marginTop: 16, fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
        快捷键设置仅保存在本地浏览器中。
      </div>
    </div>
  )

  const renderHelp = () => (
    <div>
      <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>帮助与反馈</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>版本信息</div>
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>超级小金 Web 客户端 v{__APP_VERSION__}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>使用说明</div>
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            1. 点击左侧「新建对话」开始与超级小金聊天。<br />
            2. 在系统设置中配置后端服务器地址，默认连接本地 127.0.0.1:3000。<br />
            3. 发送文件、图片或文字，超级小金会帮您处理教学相关任务。<br />
            4. 历史对话会自动保存在当前工作目录中。
          </div>
        </div>
        <div style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>反馈</div>
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            遇到问题请检查后端服务是否已启动，并确认服务器地址、网络连接正常。
          </div>
        </div>
      </div>
    </div>
  )

  const contentMap: Record<TabId, React.ReactNode> = {
    account: renderAccount(),
    system: renderSystem(),
    personalization: renderPersonalization(),
    models: renderModels(),
    shortcuts: renderShortcuts(),
    help: renderHelp(),
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal-backdrop)',
        background: 'var(--overlay-bg)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 12 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        style={{
          width: 900, maxWidth: '94vw', height: '82vh',
          background: 'color-mix(in srgb, var(--bg-panel) 95%, transparent)',
          border: '1px solid color-mix(in srgb, var(--border) 70%, rgba(255,255,255,0.1))',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), var(--shadow-xl)',
          display: 'flex', overflow: 'hidden',
          backdropFilter: 'blur(16px) saturate(180%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar */}
        <div style={{ width: 220, minWidth: 220, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          <div style={{ padding: '20px 18px 16px', fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--text)' }}>
            设置
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 16px' }}>
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id)
                  contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: activeTab === item.id ? 'var(--bg-selected)' : 'transparent',
                  color: activeTab === item.id ? 'var(--accent)' : 'var(--text)',
                  fontSize: 'var(--font-sm)',
                  fontWeight: activeTab === item.id ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s, color 0.15s',
                  marginBottom: 4,
                }}
              >
                <span style={{ color: activeTab === item.id ? 'var(--accent)' : 'var(--text-dim)' }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            v{__APP_VERSION__}
          </div>
        </div>

        {/* Right content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {menuItems.find((i) => i.id === activeTab)?.label}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => { saveAll(); onClose() }}
                className="btn-save"
              >
                <ArrowClockwise weight="bold" size={14} style={{ marginRight: 6 }} />
                保存并关闭
              </button>
              <button onClick={onClose} className="btn-close" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X weight="bold" size={18} />
              </button>
            </div>
          </div>
          <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            {contentMap[activeTab]}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
