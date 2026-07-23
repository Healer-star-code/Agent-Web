export interface ApiImagePayload {
  name: string
  mimeType: string
  data: string
}

export interface PromptPayload {
  message: string
  images?: ApiImagePayload[]
}

export interface WebSessionInfo {
  id: string
  cwd: string
  sessionFile?: string
  created: string
  modified: string
  firstMessage: string
  messageCount: number
  name?: string
  titleSource?: 'ai' | 'user'
  aiTitleGenerated?: boolean
  parentSessionId?: string
  active?: boolean
  model?: { provider: string; modelId: string } | null
  cost?: number
  tokens?: { input: number; output: number; total: number }
}

export interface WebToolCall {
  id: string
  name: string
  status: 'running' | 'done' | 'error' | 'waiting_permission'
  args?: unknown
  result?: unknown
}

export interface WebMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  thinkingContent?: string
  thinkingDurationMs?: number
  toolCalls?: WebToolCall[]
  artifacts?: never[]
  attachments?: import('../mockData').MessageAttachment[]
}

export interface ModelProviderInfo {
  id: string
  name: string
  models: {
    id: string
    name: string
    reasoning: boolean
    input: string[]
    contextWindow: number
    maxTokens: number
  }[]
}

export interface ConfigInfo {
  defaultModel?: { id: string; provider: string; modelId?: string } | null
  [key: string]: unknown
}

export type WebAgentEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'agent_start' }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_end'; content: string }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'assistant_message_end' }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_update'; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: 'tool_end'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'permission_requested'; request: PermissionRequestInfo }
  | { type: 'permission_resolved'; permissionId: string; approved: boolean }
  | { type: 'question'; question: QuestionInfo }
  | { type: 'question_resolved'; questionId: string; answer?: string }
  | { type: 'session_renamed'; sessionId: string; name: string; titleSource: 'ai' | 'user'; aiTitleGenerated: boolean }
  | { type: 'artifact_created'; artifact: ArtifactInfo }
  | { type: 'agent_end' }
  | { type: 'error'; message: string }

export const DEFAULT_API_BASE = '/app'
const LS_SERVER_URL = 'pi-server-url-v080'
const OLD_LS_SERVER_URL = 'pi-server-url'

function isValidApiBase(url: string): boolean {
  if (url === '/app') return true
  return /^https?:\/\//.test(url) && !url.includes('/superking-api') && !url.includes(':30142')
}

export function getApiBase(): string {
  try {
    // migrate from old v0.79 key if present
    const old = localStorage.getItem(OLD_LS_SERVER_URL)
    if (old && isValidApiBase(old) && !localStorage.getItem(LS_SERVER_URL)) {
      localStorage.setItem(LS_SERVER_URL, old)
    }
    const fromLs = localStorage.getItem(LS_SERVER_URL)
    if (fromLs && isValidApiBase(fromLs)) {
      // 迁移所有旧的绝对地址到相对路径 /app（同源代理）
      if (fromLs !== '/app') {
        localStorage.setItem(LS_SERVER_URL, '/app')
        return '/app'
      }
      return fromLs
    }
  } catch { /* ignore */ }
  const envBase = import.meta.env.VITE_PI_API_BASE as string | undefined
  if (envBase && isValidApiBase(envBase)) return envBase
  return DEFAULT_API_BASE
}

export function getStoredServerUrl(): string | null {
  try {
    const v = localStorage.getItem(LS_SERVER_URL)
    if (v && isValidApiBase(v)) return v
  } catch { /* ignore */ }
  return null
}

export function setStoredServerUrl(url: string): void {
  try {
    localStorage.setItem(LS_SERVER_URL, url)
  } catch { /* ignore */ }
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err
  return new Error(String(err))
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const err = (data as Record<string, unknown>).error
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.message === 'string') return e.message
    if (typeof e.code === 'string') return e.code
  }
  return undefined
}

// access_token 15 分钟过期；401 时用 refresh_token Cookie 换新 token 并重试一次。
// 并发请求共享同一次刷新，避免刷新接口被打爆。
let refreshPromise: Promise<string | null> | null = null

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })
        const json = await res.json() as { code: number; data?: { access_token?: string } }
        if (json.code === 200 && json.data?.access_token) {
          const auth = getAuthUser()
          if (auth) setAuthUser(auth.name, json.data.access_token)
          return json.data.access_token
        }
        return null
      } catch {
        return null
      }
    })().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

function notifyAuthExpired(): void {
  try { window.dispatchEvent(new CustomEvent('pi-auth-expired')) } catch { /* ignore */ }
}

async function requestJson<T>(path: string, init?: RequestInit, options?: { timeoutMs?: number | null }): Promise<T> {
  const timeoutMs = options?.timeoutMs === undefined ? 60000 : options?.timeoutMs
  const base = getApiBase()

  const doFetch = async (token: string | undefined): Promise<Response> => {
    const controller = timeoutMs === null ? undefined : new AbortController()
    const timer = timeoutMs === null ? undefined : setTimeout(() => controller?.abort(), timeoutMs)
    const headers = new Headers(init?.headers)
    headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    try {
      return await fetch(`${base}${path}`, {
        ...init,
        signal: controller?.signal,
        headers,
      })
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  try {
    let res = await doFetch(getAuthUser()?.token)
    if (res.status === 401) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        res = await doFetch(newToken)
      } else {
        clearAuthUser()
        notifyAuthExpired()
        throw new Error('登录已过期，请重新登录')
      }
    }
    let data: unknown
    try {
      data = await res.json()
    } catch {
      data = undefined
    }
    if (!res.ok) {
      const msg = extractErrorMessage(data) ?? `HTTP ${res.status}`
      throw new Error(msg)
    }
    return data as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    const message = err instanceof Error ? err.message : String(err)
    if (message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network') || err instanceof TypeError) {
      throw new Error('暂时连接不上超级小金服务。请检查：1. 超级小金是否已经启动；2. 服务器地址是否填对。如果刚修改过设置，稍等几秒会自动重试。')
    }
    throw normalizeError(err)
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthResult {
  name: string
  token: string
}

export interface AuthState {
  name: string
  token: string
}

const AUTH_KEY = 'pi-auth'
export const AUTH_API_BASE = 'https://192.168.157.118'
const MAX_USERNAME_LEN = 20

interface LoginApiResponse {
  code: number
  message: string
  data: { access_token?: string } | null
}

export function getAuthUser(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthState
    if (parsed.token && parsed.name) return parsed
  } catch { /* ignore */ }
  return null
}

export function setAuthUser(name: string, token: string): void {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ name, token }))
  } catch { /* ignore */ }
}

export function clearAuthUser(): void {
  try {
    localStorage.removeItem(AUTH_KEY)
  } catch { /* ignore */ }
}

// 通知后端吊销 refresh_token 并清理本地登录态
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch { /* ignore */ }
  clearAuthUser()
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const trimmed = username.trim()
  if (!trimmed) throw new Error('请输入账号')
  if (!password) throw new Error('请输入密码')

  const body = JSON.stringify({ username: trimmed, password })
  let data: LoginApiResponse
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const text = await res.text()
    data = JSON.parse(text) as LoginApiResponse
  } catch {
    throw new Error('无法连接登录服务器，请检查网络')
  }

  if (data.code === 200 && data.data?.access_token) {
    return { name: trimmed.slice(0, MAX_USERNAME_LEN), token: data.data.access_token }
  }
  if (data.code === 400) {
    throw new Error('账号或密码错误')
  }
  if (data.code === 403) {
    throw new Error('该账号无登录权限')
  }
  throw new Error(data.message || '登录失败')
}

// ---------------------------------------------------------------------------
// Certificate - mTLS removed, JWT-only
// ---------------------------------------------------------------------------

export const GATEWAY_BASE = DEFAULT_API_BASE.replace(/\/app$/, '')

export type CertCheckResult = 'ready'

export async function checkCertReady(): Promise<CertCheckResult> {
  return 'ready'
}

// ---------------------------------------------------------------------------
// Directory selection (no longer supported by v0.80 backend; returns null)
// ---------------------------------------------------------------------------

export async function selectDirectory(): Promise<string | null> {
  return null
}

// ---------------------------------------------------------------------------
// Super-king internal types (v0.80)
// ---------------------------------------------------------------------------

interface SuperKingSessionState {
  sessionId: string
  sessionName?: string
  model?: { provider: string; id: string }
  thinkingLevel: string
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: 'all' | 'one-at-a-time'
  followUpMode: 'all' | 'one-at-a-time'
  autoCompactionEnabled: boolean
  messageCount: number
  pendingMessageCount: number
}

interface SuperKingSessionListItem {
  id: string
  createdAt: string
  lastActivityAt: string
  state?: SuperKingSessionState
  // 兼容旧版后端返回的扁平结构
  cwd?: string
  name?: string | null
  messageCount?: number
  model?: { provider: string; id: string }
}

interface SuperKingSessionCreateResponse {
  id: string
  state: SuperKingSessionState
}

type SuperKingContent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; redacted?: boolean }
  | { type: 'toolCall'; id: string; name: string; arguments: unknown }
  | { type: 'image'; data: string; mimeType: string }

interface SuperKingMessage {
  role: 'user' | 'assistant' | 'toolResult'
  content: SuperKingContent[]
  timestamp: number
  provider?: string
  model?: string
  usage?: {
    input: number
    output: number
    totalTokens: number
    cost: { total: number }
  }
  stopReason?: string
  toolCallId?: string
  toolName?: string
  isError?: boolean
}

// ---------------------------------------------------------------------------
// Session APIs (v0.80)
// ---------------------------------------------------------------------------

export async function createSession(_cwd?: string, _sessionFile?: string): Promise<WebSessionInfo> {
  const data = await requestJson<SuperKingSessionCreateResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return convertSession({ id: data.id, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), state: data.state }, _cwd)
}

export async function listSessions(_cwd?: string): Promise<WebSessionInfo[]> {
  const data = await requestJson<{ sessions: SuperKingSessionListItem[] }>(`/sessions`)
  return data.sessions.map((s) => convertSession(s, _cwd))
}

export async function getSession(sessionId: string): Promise<WebSessionInfo> {
  const data = await requestJson<SuperKingSessionState & { id?: string; name?: string; sessionName?: string; cwd?: string }>(`/sessions/${encodeURIComponent(sessionId)}`)
  const sessionName = data.sessionName ?? data.name
  return {
    id: data.sessionId ?? data.id ?? sessionId,
    cwd: data.cwd ?? '',
    name: sessionName,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    firstMessage: sessionName ?? '',
    messageCount: data.messageCount,
    active: false,
    model: data.model ? { provider: data.model.provider, modelId: data.model.id } : null,
  }
}

function convertSession(s: SuperKingSessionListItem, fallbackCwd?: string): WebSessionInfo {
  const state = s.state
  // 兼容旧版扁平结构（name/cwd 在顶层）和 v0.80 嵌套结构（sessionName/cwd 在 state 里）
  const sessionName = s.name ?? state?.sessionName
  const cwd = s.cwd ?? fallbackCwd ?? ''
  const createdAt = typeof s.createdAt === 'number' ? new Date(s.createdAt).toISOString() : s.createdAt
  const lastActivityAt = typeof s.lastActivityAt === 'number' ? new Date(s.lastActivityAt).toISOString() : s.lastActivityAt
  const model = state?.model ?? s.model ?? null
  return {
    id: s.id,
    cwd,
    name: sessionName ?? undefined,
    created: createdAt,
    modified: lastActivityAt,
    firstMessage: sessionName ?? '',
    messageCount: state?.messageCount ?? s.messageCount ?? 0,
    active: false,
    model: model ? { provider: model.provider, modelId: model.id } : null,
  }
}

export async function getMessages(sessionId: string, cwd?: string): Promise<WebMessage[]> {
  const data = await requestJson<{ messages: SuperKingMessage[] }>(`/sessions/${encodeURIComponent(sessionId)}/messages`)
  return convertSuperKingMessages(data.messages, cwd)
}

export async function sendPrompt(sessionId: string, payload: PromptPayload): Promise<void> {
  const body: Record<string, unknown> = { message: payload.message }
  if (payload.images && payload.images.length > 0) {
    body.images = payload.images
  }
  await requestJson<{ accepted: boolean }>(`/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, { timeoutMs: null })
}

export async function abortSession(sessionId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function deleteSession(sessionId: string): Promise<void> {
  await requestJson<void>(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export async function renameSession(sessionId: string, name: string, cwd?: string): Promise<WebSessionInfo> {
  await requestJson<{ state: SuperKingSessionState }>(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  const session = await getSession(sessionId)
  return { ...session, cwd: cwd ?? session.cwd }
}

// ---------------------------------------------------------------------------
// Health / connection test
// ---------------------------------------------------------------------------

export async function testConnection(): Promise<{ ok: true }> {
  return requestJson<{ status: string }>('/health', { method: 'GET' }, { timeoutMs: 10000 }).then(() => ({ ok: true as const }))
}

// ---------------------------------------------------------------------------
// Models & config (v0.80)
// ---------------------------------------------------------------------------

export interface V80Model {
  provider: string
  id: string
  name?: string
  reasoning?: boolean
  input?: string[]
  contextWindow?: number
  maxTokens?: number
}

export interface V80Provider {
  id: string
  name: string
  configured: boolean
}

export async function listModels(): Promise<ModelProviderInfo[]> {
  const data = await requestJson<{ models: V80Model[] }>('/models')
  const byProvider = new Map<string, V80Model[]>()
  for (const m of data.models) {
    const arr = byProvider.get(m.provider) ?? []
    arr.push(m)
    byProvider.set(m.provider, arr)
  }
  return Array.from(byProvider.entries()).map(([providerId, models]) => ({
    id: providerId,
    name: providerId,
    models: models.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      reasoning: m.reasoning ?? false,
      input: m.input ?? ['text'],
      contextWindow: m.contextWindow ?? 0,
      maxTokens: m.maxTokens ?? 0,
    })),
  }))
}

export async function getConfig(): Promise<ConfigInfo> {
  return requestJson<ConfigInfo>('/config')
}

// ---------------------------------------------------------------------------
// SSE (v0.80 generic message events)
// ---------------------------------------------------------------------------

function truncateForUi(value: unknown, limit: number): unknown {
  if (typeof value !== 'string') return value
  if (value.length <= limit) return value
  return value.slice(0, limit) + `\n…（已省略 ${value.length - limit} 字符以保护渲染性能）`
}

// v0.80 后端在不同接口返回的 content 格式可能不同：SSE 事件通常是数组，
// 但 /sessions/:id/messages 可能直接返回字符串。统一标准化为数组格式。
function normalizeContent(content: unknown): SuperKingContent[] {
  if (Array.isArray(content)) return content as SuperKingContent[]
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (content && typeof content === 'object') return [content as SuperKingContent]
  return []
}

function extractTextAndThinking(content: SuperKingContent[] | string | unknown): { text: string; thinking: string } {
  const normalized = normalizeContent(content)
  let text = ''
  let thinking = ''
  for (const c of normalized) {
    if (c.type === 'text') text += c.text
    if (c.type === 'thinking') thinking += c.thinking
  }
  return { text, thinking }
}

export interface SessionEventsConnection {
  close(): void
}

// EventSource 不支持自定义请求头，带不了 JWT；改用 fetch 流式解析 SSE。
export function connectSessionEvents(sessionId: string, onEvent: (event: WebAgentEvent) => void): SessionEventsConnection {
  const base = getApiBase()
  const controller = new AbortController()
  let closed = false

  const state = {
    inTurn: false,
    assistantText: '',
    assistantThinking: '',
    thinkingOpen: false,
    emittedToolIds: new Set<string>(),
  }

  function reset() {
    state.assistantText = ''
    state.assistantThinking = ''
    state.thinkingOpen = false
    state.emittedToolIds.clear()
  }

  function ensureTurnStarted() {
    if (!state.inTurn) {
      state.inTurn = true
      reset()
      onEvent({ type: 'agent_start' })
    }
  }

  function emitTextDelta(delta: string) {
    if (!delta) return
    state.assistantText += delta
    if (delta.length > 10_000) {
      console.warn(`[piApi] huge assistant_delta: ${delta.length} chars`)
    }
    onEvent({ type: 'assistant_delta', delta })
  }

  function emitThinkingDelta(delta: string) {
    if (!delta) return
    if (!state.thinkingOpen) {
      state.thinkingOpen = true
      onEvent({ type: 'thinking_start' })
    }
    state.assistantThinking += delta
    onEvent({ type: 'thinking_delta', delta })
  }

  function closeThinking() {
    if (state.thinkingOpen) {
      onEvent({ type: 'thinking_end', content: state.assistantThinking })
      state.thinkingOpen = false
    }
  }

  function flushFinal() {
    closeThinking()
    reset()
  }

  function endTurn() {
    flushFinal()
    state.inTurn = false
    onEvent({ type: 'agent_end' })
  }

  function emitToolStart(toolCallId: string, toolName: string, args: unknown) {
    if (!toolCallId || state.emittedToolIds.has(toolCallId)) return
    state.emittedToolIds.add(toolCallId)
    onEvent({ type: 'tool_start', toolCallId, toolName, args })
  }

  function handleEventData(data: any) {
    const eventType = data?.type as string | undefined
    if (!eventType) return

    switch (eventType) {
      case 'message_start': {
        const message = data.message as SuperKingMessage | undefined
        if (!message || message.role !== 'assistant') return
        ensureTurnStarted()
        const content = message.content ?? []
        const { text, thinking } = extractTextAndThinking(content)
        state.assistantText = text
        state.assistantThinking = thinking
        if (thinking) {
          state.thinkingOpen = true
          onEvent({ type: 'thinking_start' })
          onEvent({ type: 'thinking_delta', delta: thinking })
        }
        if (text) onEvent({ type: 'assistant_delta', delta: text })
        for (const c of content) {
          if (c.type === 'toolCall') {
            emitToolStart(c.id, c.name, c.arguments)
          }
        }
        break
      }
      case 'message_update': {
        const assistantEvent = data.assistantMessageEvent as { type: string; delta?: string; content?: string; partial?: SuperKingMessage } | undefined
        if (!assistantEvent) return
        ensureTurnStarted()

        switch (assistantEvent.type) {
          case 'thinking_start':
            state.thinkingOpen = true
            onEvent({ type: 'thinking_start' })
            break
          case 'thinking_delta':
            if (typeof assistantEvent.delta === 'string') {
              emitThinkingDelta(assistantEvent.delta)
            }
            break
          case 'thinking_end':
            if (typeof assistantEvent.content === 'string') {
              const delta = assistantEvent.content.slice(state.assistantThinking.length)
              if (delta) emitThinkingDelta(delta)
            }
            closeThinking()
            break
          case 'text_start':
            // text starts; deltas will follow
            break
          case 'text_delta':
            if (typeof assistantEvent.delta === 'string') {
              const current = state.assistantText
              const delta = assistantEvent.delta
              // 防止后端把 message_start 已给过的完整文本又从 text_delta 重放一遍
              if (current === delta) {
                // 完全重复，跳过
              } else if (delta.startsWith(current) && current.length > 0) {
                // delta 已包含 current，只取新增部分
                const actualDelta = delta.slice(current.length)
                if (actualDelta) emitTextDelta(actualDelta)
              } else {
                emitTextDelta(delta)
              }
            }
            break
          case 'text_end':
            if (typeof assistantEvent.content === 'string') {
              const delta = assistantEvent.content.slice(state.assistantText.length)
              if (delta) emitTextDelta(delta)
            }
            break
          default:
            // unknown subtype, try to extract from partial message
            if (assistantEvent.partial) {
              const { text, thinking } = extractTextAndThinking(assistantEvent.partial.content ?? [])
              const textDelta = text.slice(state.assistantText.length)
              const thinkingDelta = thinking.slice(state.assistantThinking.length)
              if (textDelta) emitTextDelta(textDelta)
              if (thinkingDelta) emitThinkingDelta(thinkingDelta)
            }
        }
        break
      }
      case 'tool_execution_start':
        ensureTurnStarted()
        emitToolStart(data.toolCallId, data.toolName, data.args)
        break
      case 'tool_execution_update':
        onEvent({
          type: 'tool_update',
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          partialResult: truncateForUi(data.partialResult, 2000),
        })
        break
      case 'tool_execution_end':
        onEvent({
          type: 'tool_end',
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          result: truncateForUi(data.result, 200_000),
          isError: data.isError,
        })
        break
      case 'message_end': {
        const message = data.message as SuperKingMessage | undefined
        if (!message || message.role === 'toolResult') return
        // 不要在 message_end 重置状态；turn_end / agent_end 会负责收尾，
        // 避免重置后 turn_end 重新 emit 完整文本导致重复。
        onEvent({ type: 'assistant_message_end' })
        break
      }
      case 'turn_end': {
        const message = data.message as SuperKingMessage | undefined
        if (message && message.role === 'assistant') {
          const { text, thinking } = extractTextAndThinking(message.content ?? [])
          const textDelta = text.slice(state.assistantText.length)
          const thinkingDelta = thinking.slice(state.assistantThinking.length)
          if (textDelta) emitTextDelta(textDelta)
          if (thinkingDelta) {
            if (!state.thinkingOpen && thinking) {
              state.thinkingOpen = true
              onEvent({ type: 'thinking_start' })
            }
            emitThinkingDelta(thinkingDelta)
          }
        }
        endTurn()
        break
      }
      case 'agent_end':
        if (state.inTurn) {
          endTurn()
        }
        break
      case 'extension_ui_request':
      case 'ping':
      case 'pong':
        // ignore
        break
      default:
        // ignore unknown event types
    }
  }

  const RECONNECT_DELAY_MS = 3000

  async function connect(): Promise<void> {
    for (;;) {
      if (closed) return
      const token = getAuthUser()?.token
      const headers: Record<string, string> = { Accept: 'text/event-stream' }
      if (token) headers.Authorization = `Bearer ${token}`
      let res: Response
      try {
        res = await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/events`, {
          headers,
          signal: controller.signal,
        })
      } catch {
        if (closed) return
        await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS))
        continue
      }
      if (res.status === 401) {
        const newToken = await refreshAccessToken()
        if (newToken) continue
        clearAuthUser()
        notifyAuthExpired()
        onEvent({ type: 'error', message: '登录已过期，请重新登录' })
        return
      }
      if (!res.ok || !res.body) {
        if (closed) return
        await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS))
        continue
      }

      onEvent({ type: 'connected', sessionId })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let sepIdx: number
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx)
            buffer = buffer.slice(sepIdx + 2)
            const dataLines: string[] = []
            for (const line of rawEvent.split('\n')) {
              if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
            }
            if (dataLines.length === 0) continue
            let parsed: any
            try {
              parsed = JSON.parse(dataLines.join('\n'))
            } catch {
              continue
            }
            handleEventData(parsed)
          }
        }
      } catch {
        // 主动 close() 或网络中断都会走到这里
      }
      if (closed) return
      // 流意外结束（nginx 超时、网络抖动等）：重置状态后静默重连
      state.inTurn = false
      reset()
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS))
    }
  }

  void connect()

  return {
    close() {
      closed = true
      controller.abort()
    },
  }
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

function convertSuperKingMessages(messages: SuperKingMessage[], cwd?: string): WebMessage[] {
  const result: WebMessage[] = []
  const runningToolCalls = new Map<string, WebToolCall>()

  function findLastAssistant(): WebMessage | null {
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].role === 'assistant') return result[i]
    }
    return null
  }

  function extractText(content: SuperKingContent[] | string | unknown): string {
    return normalizeContent(content)
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('')
  }

  for (const msg of messages) {
    if (msg.role === 'toolResult') {
      const assistant = findLastAssistant()
      if (assistant && assistant.toolCalls) {
        const tc = assistant.toolCalls.find((t) => t.id === msg.toolCallId)
        if (tc) {
          tc.status = msg.isError ? 'error' : 'done'
          tc.result = extractText(msg.content)
        }
      }
      continue
    }

    const webMsg: WebMessage = {
      id: generateMessageId(msg.timestamp),
      role: msg.role,
      content: '',
      timestamp: new Date(msg.timestamp).toISOString(),
      thinkingContent: '',
      thinkingDurationMs: 0,
      toolCalls: [],
      artifacts: [],
    }

    for (const c of normalizeContent(msg.content)) {
      if (c.type === 'text') webMsg.content += c.text
      if (c.type === 'thinking') webMsg.thinkingContent += c.thinking
      if (c.type === 'toolCall') {
        const tc: WebToolCall = {
          id: c.id,
          name: c.name,
          status: 'running',
          args: c.arguments,
        }
        webMsg.toolCalls!.push(tc)
        runningToolCalls.set(c.id, tc)
      }
      // 后端图片格式：{ name, mimeType, data }（没有 type 字段）
      const ci = c as unknown as Record<string, unknown>
      if ((!ci.type || ci.type === 'image') && ci.mimeType && ci.data) {
        if (!webMsg.attachments) webMsg.attachments = []
        const mimeType = ci.mimeType as string
        const ext = mimeType.split('/')[1] ?? 'png'
        webMsg.attachments.push({
          id: msg.timestamp * 100 + webMsg.attachments.length,
          name: (ci.name as string) ?? `image-${webMsg.attachments.length + 1}.${ext}`,
          url: `data:${mimeType};base64,${ci.data}`,
          type: 'image',
          isImage: true,
        })
      }
    }

    if (webMsg.role === 'user' && webMsg.content) {
      const { cleanContent, detectedUploads } = stripSystemPrompt(webMsg.content)
      webMsg.content = cleanContent
      if (detectedUploads.length > 0) {
        const docAttachments = detectedUploads.map((u, i) => buildAttachmentFromUpload(u, cwd ?? '', msg.timestamp, i))
        webMsg.attachments = [...(webMsg.attachments ?? []), ...docAttachments]
      }
    }

    result.push(webMsg)
  }

  return result
}

export function stripSystemPrompt(content: string): {
  cleanContent: string
  detectedUploads: { name: string; relPath: string }[]
} {
  if (!content) return { cleanContent: content, detectedUploads: [] }
  // 匹配所有 [系统： 开头的块（新格式"用户上传了" + 旧格式）
  const re = /\n\[系统：/
  const m = re.exec(content)
  if (!m) return { cleanContent: content, detectedUploads: [] }
  const idx = m.index
  const cleanContent = content.slice(0, idx).replace(/\s+$/, '')
  const systemPart = content.slice(idx)
  const detectedUploads: { name: string; relPath: string }[] = []

  // 新格式：[系统：用户上传了 xxx.docx，文件内容如下...]
  const newNameRe = /\[系统：用户上传了 (.+?)，/g
  let nm: RegExpExecArray | null
  while ((nm = newNameRe.exec(systemPart)) !== null) {
    const name = nm[1]?.trim()
    if (name) detectedUploads.push({ name, relPath: '' })
  }

  // 旧格式：- xxx.docx -> .uploads/xxx.docx
  const lineRe = /^-\s+(.+?)\s+(?:->|->)\s+([.\w\-/\\][^\n\r]*)$/gm
  let lm: RegExpExecArray | null
  while ((lm = lineRe.exec(systemPart)) !== null) {
    const name = lm[1]?.trim()
    const relPath = lm[2]?.trim()
    if (name && relPath) detectedUploads.push({ name, relPath })
  }

  return { cleanContent, detectedUploads }
}

function buildAttachmentFromUpload(
  upload: { name: string; relPath: string },
  cwd: string,
  msgTimestamp: number,
  idx: number,
): import('../mockData').MessageAttachment {
  const lower = upload.name.toLowerCase()
  const type: import('../mockData').MessageAttachment['type'] =
    /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|tiff|tif|avif)$/.test(lower) ? 'image'
      : lower.endsWith('.pdf') ? 'pdf'
        : /\.(doc|docx)$/.test(lower) ? 'document'
          : /\.(ppt|pptx)$/.test(lower) ? 'presentation'
            : /\.(xls|xlsx|csv)$/.test(lower) ? 'spreadsheet'
              : /\.(txt|md|mdx|log|rtf)$/.test(lower) ? 'text'
                : 'file'
  const attachment: import('../mockData').MessageAttachment = {
    id: msgTimestamp * 100 + idx,
    name: upload.name,
    url: '',
    type,
  }
  // 只有有 relPath 时才构建 localPath（浏览器模式 relPath 为空）
  if (upload.relPath) {
    const relWin = upload.relPath.replace(/\//g, '\\').replace(/^[\\]+/, '')
    const cwdWin = cwd.replace(/\//g, '\\').replace(/[\\]+$/, '')
    attachment.localPath = /^[A-Za-z]:\\/.test(relWin) ? relWin : `${cwdWin}\\${relWin}`
  }
  return attachment
}

function generateMessageId(timestamp?: number): string {
  if (timestamp === undefined) return 'm' + Date.now() + Math.random().toString(36).slice(2, 7)
  return 'm' + timestamp
}

// ---------------------------------------------------------------------------
// Unsupported features in v0.80 (kept as empty stubs to avoid breaking imports)
// ---------------------------------------------------------------------------

export interface SkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
}

export interface ToolInfo {
  name: string
  description: string
  active: boolean
}

export interface ArtifactInfo {
  id: string
  sessionId: string
  name: string
  path: string
  mimeType: string
  size: number
  kind: 'word' | 'presentation' | 'spreadsheet' | 'pdf' | 'image' | 'text' | 'file'
  timeCreated: number
  messageIndex?: number
  localPath?: string
  exists?: boolean
  source?: 'backend' | 'local-scan'
}

export interface PermissionRequestInfo {
  permissionId: string
  sessionId: string
  kind: string
  message: string
  options?: unknown
  diff?: unknown
}

export interface QuestionInfo {
  questionId: string
  sessionId: string
  questions: { label: string; value?: string }[][]
}

export interface RecentPathInfo {
  path: string
  name: string
  timeCreated: number
  timeUpdated: number
}

export async function switchModel(): Promise<void> {
  throw new Error('切换模型在 v0.80 后端中暂不支持')
}

export async function listPermissions(): Promise<PermissionRequestInfo[]> {
  return []
}

export async function resolvePermission(..._args: unknown[]): Promise<void> {
  throw new Error('权限处理在 v0.80 后端中暂不支持')
}

export async function listQuestions(): Promise<QuestionInfo[]> {
  return []
}

export async function answerQuestion(..._args: unknown[]): Promise<void> {
  throw new Error('问题处理在 v0.80 后端中暂不支持')
}

export async function rejectQuestion(..._args: unknown[]): Promise<void> {
  throw new Error('问题处理在 v0.80 后端中暂不支持')
}

export async function listSkills(): Promise<SkillInfo[]> {
  return []
}

export async function listInstalledSkills(): Promise<{ skills: SkillInfo[]; root: string }> {
  return { skills: [], root: '' }
}

export async function reinstallOfficeSkills(): Promise<{ skills: SkillInfo[]; root: string }> {
  return { skills: [], root: '' }
}

export async function createSkill(): Promise<SkillInfo> {
  throw new Error('技能管理在 v0.80 后端中暂不支持')
}

export async function deleteSkill(): Promise<void> {
  throw new Error('技能管理在 v0.80 后端中暂不支持')
}

export async function getSkillsRoot(): Promise<string> {
  return ''
}

export async function listTools(): Promise<ToolInfo[]> {
  return []
}

export async function setTools(): Promise<void> {
  throw new Error('工具管理在 v0.80 后端中暂不支持')
}

export async function openFolder(): Promise<void> {
  throw new Error('打开文件夹在 v0.80 后端中暂不支持')
}

export function artifactDownloadUrl(_artifact?: unknown): string {
  return ''
}

export async function listLocalSkills(): Promise<{ skills: SkillInfo[]; root: string }> {
  return { skills: [], root: '' }
}

export async function listLocalSkillsWithCache(): Promise<{ skills: SkillInfo[]; root: string; fromCache: boolean }> {
  return { skills: [], root: '', fromCache: false }
}

export async function getLocalSkillsRoot(): Promise<{ path: string }> {
  return { path: '' }
}

export async function openLocalFolder(_path?: unknown): Promise<void> {
  throw new Error('打开文件夹在 v0.80 后端中暂不支持')
}

export async function listRecentPaths(): Promise<RecentPathInfo[]> {
  return []
}

export async function addRecentPath(_path: string): Promise<RecentPathInfo[]> {
  return []
}

export async function removeRecentPath(_path: string): Promise<RecentPathInfo[]> {
  return []
}

export function getCachedLocalSkills(): { root: string; skills: SkillInfo[]; updatedAt: number } | null {
  return null
}

export interface CreateSkillPayload {
  cwd?: string
  name: string
  description: string
  content: string
}

export interface LocalSkillsCache {
  root: string
  skills: SkillInfo[]
  updatedAt: number
}

export function getLocalHelperBase(): string {
  return ''
}
