export interface ReportPayload {
  source: string
  message?: string
  stack?: string
  componentStack?: string
  sessionId?: string | null
  contentLength?: number
  extra?: Record<string, unknown>
}

let lastReportKey = ''
let lastReportTime = 0

export function reportRendererError(payload: ReportPayload): void {
  try {
    const key = `${payload.source}::${payload.message ?? ''}`
    const now = Date.now()
    if (key === lastReportKey && now - lastReportTime < 1000) return
    lastReportKey = key
    lastReportTime = now

    console.error(`[errorReporter:${payload.source}]`, payload.message ?? '(no message)', payload)
  } catch (err) {
    try { console.warn('[errorReporter] internal failure', err) } catch {}
  }
}

/**
 * 注册全局兜底：window.onerror + window.onunhandledrejection
 * 在 main.tsx 启动时调用一次即可。
 */
export function installGlobalErrorReporters(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    reportRendererError({
      source: 'window.onerror',
      message: event.message,
      stack: event.error?.stack,
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    reportRendererError({
      source: 'unhandledrejection',
      message,
      stack,
    })
  })
}
