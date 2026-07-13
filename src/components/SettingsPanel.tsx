import { useState, useEffect, useCallback } from 'react'
import { testConnection, setStoredServerUrl } from '../lib/piApi'

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
}

export function SettingsPanel({ isDark, onThemeChange, fontSize, onFontSizeChange, mode, onModeChange, serverUrl, onServerUrlChange, onClose }: Props) {
  const [draftTheme, setDraftTheme] = useState(isDark)
  const [draftFontSize, setDraftFontSize] = useState(fontSize)
  const [draftMode, setDraftMode] = useState(mode)
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl)
  const [testStatus, setTestStatus] = useState<{ loading: boolean; ok?: boolean; message?: string } | null>(null)

  useEffect(() => {
    queueMicrotask(() => {
      setDraftTheme(isDark)
      setDraftFontSize(fontSize)
      setDraftMode(mode)
      setDraftServerUrl(serverUrl)
    })
  }, [isDark, fontSize, mode, serverUrl])

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

  const saveAndClose = useCallback(() => {
    if (!applyServerSettings(draftServerUrl)) return
    onThemeChange(draftTheme)
    onFontSizeChange(draftFontSize)
    onModeChange(draftMode)
    onClose()
  }, [draftServerUrl, draftTheme, draftFontSize, draftMode, applyServerSettings, onThemeChange, onFontSizeChange, onModeChange, onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      saveAndClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveAndClose])

  const ALL_FONT_SIZES = [14, 16, 18, 20, 22]
  const DEFAULT_SIZE = 16

  const handleModeChange = (newMode: 'young' | 'senior') => {
    setDraftMode(newMode)
    if (!ALL_FONT_SIZES.includes(draftFontSize)) {
      setDraftFontSize(DEFAULT_SIZE)
    }
  }

  return (
    <div onClick={() => {
      saveAndClose()
    }} style={{
      position: 'fixed', inset: 0, zIndex: 299,
      background: 'var(--overlay-bg)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 460, maxWidth: '90vw',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)',
        position: 'relative',
        overflow: 'hidden',
        padding: '24px 28px 20px',
        animation: 'fadeIn 0.2s ease',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>设置</span>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        {/* Server Connection */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>服务器连接</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>服务器地址</div>
              <input
                type="text"
                value={draftServerUrl}
                onChange={(e) => setDraftServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:3000"
                className="input-field"
              />
              <button
                onClick={async () => {
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
                    const message = err instanceof Error ? err.message : String(err)
                    setTestStatus({ loading: false, ok: false, message })
                  }
                }}
                disabled={testStatus?.loading}
                className="btn-test"
              >
                {testStatus?.loading ? '测试中...' : '测试连接'}
              </button>
              {testStatus && !testStatus.loading && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: testStatus.ok ? 'var(--success)' : 'var(--danger)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {testStatus.ok ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                  {testStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>使用模式</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => handleModeChange('young')} className={`btn-mode ${draftMode === 'young' ? 'active' : ''}`}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                background: draftMode === 'young' ? 'var(--accent)' : 'var(--bg-selected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={draftMode === 'young' ? '#fff' : 'var(--accent)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c0 1.66 4 3 9 3s9-1.34 9-3v-5" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  青年教师版
                  {draftMode === 'young' && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                      background: 'var(--accent-bg)', padding: '2px 8px',
                      borderRadius: 'var(--radius-lg)',
                    }}>当前</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  现代化界面，标准字体，功能完整
                </div>
              </div>
              {draftMode === 'young' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <button
              onClick={() => handleModeChange('senior')}
              className={`btn-mode ${draftMode === 'senior' ? 'active senior' : ''}`}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                background: draftMode === 'senior' ? 'var(--accent-senior)' : 'var(--bg-selected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={draftMode === 'senior' ? '#fff' : 'var(--accent-senior)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 18v-3" />
                  <path d="M12 8v1" />
                  <circle cx="12" cy="12" r="1" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  老教师版本
                  {draftMode === 'senior' && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--accent-senior)',
                      background: 'var(--warning-bg)', padding: '2px 8px',
                      borderRadius: 'var(--radius-lg)',
                    }}>当前</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  大字体、高对比度、简洁布局，更适合年长教师
                </div>
              </div>
              {draftMode === 'senior' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-senior)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Font Size */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>字体大小</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {ALL_FONT_SIZES.map((size) => {
              const isSelected = draftFontSize === size
              const isStandard = size === DEFAULT_SIZE
              return (
                <button key={size} onClick={() => setDraftFontSize(size)} className={`btn-font-size ${isSelected ? 'active' : ''} ${draftMode === 'senior' ? 'senior' : ''}`}>
                  <div style={{ fontSize: size, fontWeight: 700, marginBottom: 2, lineHeight: 1.2 }}>Aa</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{size}px</div>
                  {isStandard && (
                    <div className={`font-size-badge ${isSelected ? 'active' : ''} ${draftMode === 'senior' ? 'senior' : ''}`}>标准</div>
                  )}
                </button>
              )
            })}
          </div>
          {/* Preview */}
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 500 }}>预览效果</div>
            <div style={{ fontSize: draftFontSize, lineHeight: 1.6, color: 'var(--text)' }}>
              超级小金可以帮助您备课、批改作业、生成教案，让教学工作更加轻松高效。
            </div>
          </div>
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>主题外观</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDraftTheme(true)} className={`btn-theme ${draftTheme ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              深色
            </button>
            <button onClick={() => setDraftTheme(false)} className={`btn-theme ${!draftTheme ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              浅色
            </button>
          </div>
        </div>


        {/* Save button */}
        <button onClick={saveAndClose} className={`btn-save ${draftMode === 'senior' ? 'senior' : ''}`}>
          保存并连接
        </button>
      </div>
    </div>
  )
}
