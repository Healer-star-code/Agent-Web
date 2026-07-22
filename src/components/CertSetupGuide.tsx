import { useState } from 'react'
import { XiaojinLogo } from './XiaojinLogo'

export function CertSetupGuide({
  onRecheck,
  onBack,
  certPassword,
}: {
  onRecheck: () => Promise<boolean>
  onBack: () => void
  certPassword: string
}) {
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)

  async function handleConfirm() {
    setChecking(true)
    setCheckFailed(false)
    const ready = await onRecheck()
    setChecking(false)
    if (!ready) {
      setCheckFailed(true)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-bg)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)',
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px 32px 28px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <XiaojinLogo size={64} />
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--text)', marginTop: 12 }}>
            超级小金
          </div>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            证书导入引导
          </div>
        </div>

        <div style={{ marginBottom: 20, fontSize: 'var(--font-sm)', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <div style={{ marginBottom: 8, color: 'var(--success)', fontWeight: 600 }}>
            ✓ 证书已下载到您的电脑
          </div>
          <div style={{ marginBottom: 12 }}>请按以下步骤导入（仅需操作一次）：</div>
          <div style={{ paddingLeft: 8 }}>
            <div>1. 打开下载的 certificate.zip</div>
            <div>2. 双击 client.p12 文件</div>
            <div>3. 输入下方密码</div>
            <div>4. 选择「个人」存储 -&gt; 完成导入</div>
            <div>5. 重启浏览器后点击下方按钮</div>
          </div>
        </div>

        {certPassword && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <div>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginBottom: 2 }}>P12 密码</div>
              <div style={{ fontSize: 'var(--font-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600, letterSpacing: '0.05em' }}>
                {certPassword}
              </div>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(certPassword) }}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-muted)',
                fontSize: 'var(--font-xs)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              复制
            </button>
          </div>
        )}

        {checkFailed && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--danger-bg, rgba(239,68,68,0.1))',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            fontSize: 'var(--font-xs)',
            lineHeight: 1.5,
          }}>
            未检测到客户端证书。请确认：<br />
            · 已双击 client.p12 并输入密码完成导入<br />
            · 导入时选择了「个人」存储<br />
            · 已重启浏览器（关闭所有窗口后重新打开）
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={checking}
          style={{
            width: '100%',
            padding: '11px 16px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 'var(--font-sm)',
            fontWeight: 600,
            cursor: checking ? 'wait' : 'pointer',
            opacity: checking ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'opacity 0.15s',
          }}
        >
          {checking ? '正在验证证书...' : '我已导入，进入系统'}
        </button>

        <button
          onClick={onBack}
          style={{
            width: '100%',
            padding: '10px 16px',
            marginTop: 8,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 'var(--font-sm)',
            cursor: 'pointer',
          }}
        >
          返回登录
        </button>
      </div>
    </div>
  )
}
