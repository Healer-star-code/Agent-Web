import { useState } from 'react'
import { XiaojinLogo } from './XiaojinLogo'

export function CertSetupGuide({ onRecheck }: { onRecheck: () => void }) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setError('')
    setChecking(true)
    onRecheck()
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
            <div>3. 输入密码（打开 password.txt 查看）</div>
            <div>4. 选择「个人」存储 → 完成导入</div>
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: 16,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--danger-bg, rgba(239,68,68,0.1))',
            color: 'var(--danger)',
            fontSize: 'var(--font-xs)',
            lineHeight: 1.5,
          }}>
            {error}
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

        <div style={{
          marginTop: 16,
          fontSize: 'var(--font-xs)',
          color: 'var(--text-dim)',
          lineHeight: 1.5,
        }}>
          ⚠ 提示「未检测到证书」？请确认：<br />
          · 导入时选择了「个人」而非「受信任的根证书」<br />
          · 导入完成后重启了浏览器
        </div>
      </div>
    </div>
  )
}
