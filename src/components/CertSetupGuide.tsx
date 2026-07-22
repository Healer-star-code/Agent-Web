import { useState } from 'react'
import { XiaojinLogo } from './XiaojinLogo'
import { GATEWAY_BASE } from '../lib/piApi'

export function CertSetupGuide({
  onRecheck,
  onBack,
  onRequestCert,
}: {
  onRecheck: () => Promise<string>
  onBack: () => void
  onRequestCert: () => Promise<string>
}) {
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<string>('')
  const [requesting, setRequesting] = useState(false)
  const [certPassword, setCertPassword] = useState('')
  const [requestError, setRequestError] = useState('')

  async function handleRequestCert() {
    setRequesting(true)
    setRequestError('')
    try {
      const pwd = await onRequestCert()
      setCertPassword(pwd)
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : '申请证书失败')
    } finally {
      setRequesting(false)
    }
  }

  async function handleConfirm() {
    setChecking(true)
    setCheckResult('')
    const result = await onRecheck()
    setChecking(false)
    if (result !== 'ready') {
      setCheckResult(result)
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
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px 32px 28px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <XiaojinLogo size={64} />
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--text)', marginTop: 12 }}>
            超级小金
          </div>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            证书导入引导
          </div>
        </div>

        {/* 步骤 0：信任网关证书（必须先做） */}
        <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            前置步骤：信任网关证书
          </div>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6 }}>
            首次使用需先在浏览器中信任网关的 HTTPS 证书。点击下方链接，在打开的页面点「高级」-&gt;「继续前往」。
          </div>
          <a href={`${GATEWAY_BASE}/health`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--font-xs)', color: 'var(--accent)', wordBreak: 'break-all' }}>
            {GATEWAY_BASE}/health
          </a>
        </div>

        {/* 步骤 1：申请证书 */}
        {!certPassword && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              第一步：申请并下载证书
            </div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              点击下方按钮申请客户端证书，浏览器会自动下载 certificate.zip 文件。
            </div>
            {requestError && (
              <div style={{
                marginBottom: 12,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-bg, rgba(239,68,68,0.1))',
                color: 'var(--danger)',
                fontSize: 'var(--font-xs)',
              }}>
                {requestError}
              </div>
            )}
            <button
              onClick={handleRequestCert}
              disabled={requesting}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--accent)',
                background: 'var(--accent-bg, transparent)',
                color: 'var(--accent)',
                fontSize: 'var(--font-sm)',
                fontWeight: 600,
                cursor: requesting ? 'wait' : 'pointer',
                opacity: requesting ? 0.7 : 1,
              }}
            >
              {requesting ? '正在申请...' : '申请证书'}
            </button>
          </div>
        )}

        {/* 步骤 2：导入证书 */}
        {certPassword && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              第二步：导入证书到浏览器
            </div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.8 }}>
              <div style={{ marginBottom: 4, color: 'var(--success)', fontWeight: 600 }}>✓ 证书已下载</div>
              请按以下步骤导入（仅需一次）：
              <div style={{ paddingLeft: 8, marginTop: 4 }}>
                <div>1. 打开下载的 certificate.zip</div>
                <div>2. 双击 client.p12 文件</div>
                <div>3. 输入下方密码</div>
                <div>4. 选择「个人」存储 -&gt; 完成导入</div>
                <div>5. 重启浏览器</div>
              </div>
            </div>

            <div style={{
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
          </div>
        )}

        {/* 检测结果提示 */}
        {checkResult === 'no_cert' && (
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

        {checkResult === 'unreachable' && (
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
            无法连接到网关 {GATEWAY_BASE}。<br />
            请先点击上方「{GATEWAY_BASE}/health」链接，<br />
            在打开的页面点「高级」-&gt;「继续前往」信任证书，<br />
            然后回到本页重试。
          </div>
        )}

        {/* 进入系统按钮（始终显示） */}
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
          {checking ? '正在验证证书...' : certPassword ? '我已导入，进入系统' : '已导入，进入系统'}
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
