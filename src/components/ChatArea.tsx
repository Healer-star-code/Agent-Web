import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, MessageAttachment, LocalAttachment, AgentStep, ArtifactInfo } from '../mockData'
import { extractFileContent } from '../lib/fileContentExtractor'

type ChatSessionState = {
  messages: Message[]
  hasMessages: boolean
  streaming: boolean
  error: string | null
  sdkSessionId: string | null
  sdkSessionInfo: SessionInfo | null
  eventSource: EventSource | null
  eventReadySessionId: string | null
  eventReadyResolve: (() => void) | null
  eventReadyTimeout: ReturnType<typeof setTimeout> | null
  currentAssistantId: string | null
  currentThinking: string
  currentThinkingStart: number
  currentThinkingStepId: string | null
  pendingToolUpdate: { toolCallId: string; partialResult: unknown } | null
  toolUpdateTimer: ReturnType<typeof setTimeout> | null
  pendingTextDelta: string
  textDeltaTimer: ReturnType<typeof setTimeout> | null
  pendingThinkingDelta: string
  thinkingDeltaTimer: ReturnType<typeof setTimeout> | null
  skillParser: SkillStreamParser | null
  pendingSkillFreeText: string
  normalizeSessionId: string | null
  scannedForArtifacts: Map<string, number>
  fallbackScanTimer: ReturnType<typeof setTimeout> | null
  /** 该会话是否已完成首次历史消息加载 */
  loaded?: boolean
}
import { MessageView } from './MessageView'
import { MessageErrorBoundary } from './MessageErrorBoundary'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { ReasoningBlock } from './ReasoningBlock'
import { WelcomeScreen } from './WelcomeScreen'

import {
  connectSessionEvents,
  createSession,
  getMessages,
  sendPrompt,
  abortSession,
  type WebAgentEvent,
  type ApiImagePayload,
} from '../lib/piApi'
import { summarizeTitle } from '../lib/sessionState'
import { createSkillStreamParser, extractSkillBlocks, type SkillStreamParser } from '../lib/skillContentParser'

interface Props {
  session: SessionInfo | null
  selectedCwd: string | null
  newSessionCwd: string | null
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onSessionCreated?: (session: SessionInfo) => void
}

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? `v${__APP_VERSION__}`

function mergeConsecutiveAssistantMessages(messages: Message[]): Message[] {
  const merged: Message[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && merged.length > 0) {
      const prev = merged[merged.length - 1]
      if (prev.role === 'assistant') {
        merged[merged.length - 1] = {
          ...prev,
          content: [prev.content, msg.content].filter(Boolean).join('\n'),
          steps: [...(prev.steps ?? []), ...(msg.steps ?? [])],
          artifacts: [...(prev.artifacts ?? []), ...(msg.artifacts ?? [])],
          pendingTask: msg.pendingTask ?? prev.pendingTask,
        }
        continue
      }
    }
    merged.push({ ...msg })
  }
  return merged
}

function convertWebMessagesToUi(loadedMessages: import('../lib/piApi').WebMessage[]): Message[] {
  return loadedMessages.map((msg) => {
    const steps: AgentStep[] = []
    if (msg.thinkingContent) {
      steps.push({
        type: 'thinking',
        id: `think-${msg.id}`,
        content: msg.thinkingContent,
        durationMs: msg.thinkingDurationMs ?? 0,
        isThinking: false,
      })
    }
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        steps.push({
          type: 'tool',
          id: tc.id,
          name: tc.name,
          status: tc.status,
          args: tc.args,
          result: tc.result,
        })
      }
    }
    return {
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      steps,
      artifacts: msg.artifacts,
      // user 消息从 stripSystemPrompt 区块重建出来的附件（让刷新/切回会话后仍能显示文件卡片）
      attachments: msg.attachments,
    }
  })
}

function normalizeLoadedMessages(loadedMessages: import('../lib/piApi').WebMessage[]): Message[] {
  return mergeConsecutiveAssistantMessages(convertWebMessagesToUi(loadedMessages))
}

function formatPendingElapsed(ms: number) {
  if (ms <= 0) return ''
  if (ms < 1000) return `${ms}毫秒`
  if (ms < 60000) return `${Math.round(ms / 1000)}秒`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`
}

function PendingTaskCard({ task }: { task?: 'word' | 'default' }) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    setElapsedMs(0)
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [task])

  const label = task === 'word' ? '正在生成 Word 文档' : '正在处理'
  const timeText = formatPendingElapsed(elapsedMs)

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      color: 'var(--text-muted)', fontSize: 'var(--font-sm)',
      marginBottom: 8,
    }}>
      <span style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '1.5px solid var(--accent)',
        borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
        display: 'inline-block', flexShrink: 0,
      }} />
      <span>{timeText ? `${label} · 已耗时 ${timeText}` : label}</span>
    </div>
  )
}

function toMessageAttachments(attachments: LocalAttachment[] | undefined): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined
  return attachments.map((att) => ({
    id: att.id,
    name: att.name,
    url: att.url,
    type: att.file.type.startsWith('image/') ? 'image'
      : att.name.toLowerCase().endsWith('.pdf') ? 'pdf'
        : /\.(doc|docx)$/i.test(att.name) ? 'document'
          : /\.(ppt|pptx)$/i.test(att.name) ? 'presentation'
            : /\.(xls|xlsx|csv)$/i.test(att.name) ? 'spreadsheet'
              : /\.(txt|md)$/i.test(att.name) ? 'text'
                : 'file',
    mimeType: att.file.type,
    size: att.file.size,
  }))
}

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef, onSessionCreated }: Props) {
  const [messages, _setMessages] = useState<Message[]>([])
  const [hasMessages, setHasMessages] = useState(false)
  const [messagesLoaded, setMessagesLoaded] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sdkSessionIdRef = useRef<string | null>(null)
  const sdkSessionInfoRef = useRef<SessionInfo | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const eventReadySessionIdRef = useRef<string | null>(null)
  const eventReadyResolveRef = useRef<(() => void) | null>(null)
  // 当前 UI 正在显示的会话 id；SSE 事件按来源会话过滤，保证切会话时后台任务不污染当前显示
  const activeSessionIdRef = useRef<string | null>(null)
  const eventSourceSessionMapRef = useRef<Map<EventSource, string>>(new Map())
  const staleEventSourcesRef = useRef<Array<{ es: EventSource; sessionId: string; closeTimer: ReturnType<typeof setTimeout> }>>([])
  const currentAssistantIdRef = useRef<string | null>(null)
  const currentThinkingRef = useRef<string>('')
  const currentThinkingStartRef = useRef<number>(0)
  const currentThinkingStepIdRef = useRef<string | null>(null)
  const pendingToolUpdateRef = useRef<{ toolCallId: string; partialResult: unknown } | null>(null)
  const toolUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 流式 delta 缓冲（修复白屏：之前每个 SSE delta 都触发一次 setState + Markdown 重渲染）
  const pendingTextDeltaRef = useRef<string>('')
  const textDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingThinkingDeltaRef = useRef<string>('')
  const thinkingDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // skill_content 流式解析器：从 assistant_delta 中识别并抽出 <skill_content>...</skill_content>
  // 块，避免它们被当作普通文本拼进 message.content。
  const skillParserRef = useRef<SkillStreamParser | null>(null)
  // 流式中临时缓存当前一段普通文本（解析器 onText 回调收集），下次 flush 时拼进
  // pendingTextDeltaRef，由原有 60ms 节流接管渲染。
  const pendingSkillFreeTextRef = useRef<string>('')
  const isUserNearBottomRef = useRef(true)
  const forceScrollRef = useRef(false)
  const normalizeSessionIdRef = useRef<string | null>(null)

  // 记录已扫描过 artifact 的消息 id + content 长度，避免对同一条消息重复扫描
  const scannedForArtifactsRef = useRef<Map<string, number>>(new Map())
  // 兜底扫描 200ms debounce timer：高频 setMessages 时合并成一次扫描
  const fallbackScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 多会话运行时状态：切会话时保存/恢复，后台 SSE 保持连接继续运行
  const sessionStatesRef = useRef<Map<string, ChatSessionState>>(new Map())
  // messages 的 ref 镜像，saveSessionState 时直接读取，避免闭包 stale
  const messagesRef = useRef<Message[]>([])

  // 所有 setMessages 调用都同步更新 messagesRef，确保 saveSessionState 读取到最新值
  function setMessages(updater: React.SetStateAction<Message[]>) {
    _setMessages((prev) => {
      const next = typeof updater === 'function' ? (updater as (prev: Message[]) => Message[])(prev) : updater
      messagesRef.current = next
      return next
    })
  }

  function createDefaultSessionState(sessionId: string): ChatSessionState {
    return {
      messages: [],
      hasMessages: false,
      streaming: false,
      error: null,
      sdkSessionId: sessionId,
      sdkSessionInfo: session ?? null,
      eventSource: null,
      eventReadySessionId: null,
      eventReadyResolve: null,
      eventReadyTimeout: null,
      currentAssistantId: null,
      currentThinking: '',
      currentThinkingStart: 0,
      currentThinkingStepId: null,
      pendingToolUpdate: null,
      toolUpdateTimer: null,
      pendingTextDelta: '',
      textDeltaTimer: null,
      pendingThinkingDelta: '',
      thinkingDeltaTimer: null,
      skillParser: null,
      pendingSkillFreeText: '',
      normalizeSessionId: sessionId,
      scannedForArtifacts: new Map(),
      fallbackScanTimer: null,
      loaded: false,
    }
  }

  function getOrCreateSessionState(sessionId: string): ChatSessionState {
    let state = sessionStatesRef.current.get(sessionId)
    if (!state) {
      state = createDefaultSessionState(sessionId)
      sessionStatesRef.current.set(sessionId, state)
    }
    return state
  }

  function flushPendingDeltas() {
    const assistantId = currentAssistantIdRef.current
    if (textDeltaTimerRef.current) {
      clearTimeout(textDeltaTimerRef.current)
      textDeltaTimerRef.current = null
      const toFlush = pendingTextDeltaRef.current
      pendingTextDeltaRef.current = ''
      if (toFlush && assistantId) {
        messagesRef.current = messagesRef.current.map((msg) => (
          msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
        ))
      }
    }
    if (thinkingDeltaTimerRef.current) {
      clearTimeout(thinkingDeltaTimerRef.current)
      thinkingDeltaTimerRef.current = null
      const content = pendingThinkingDeltaRef.current
      pendingThinkingDeltaRef.current = ''
      const stepId = currentThinkingStepIdRef.current
      if (assistantId && stepId) {
        messagesRef.current = messagesRef.current.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'thinking' && s.id === stepId ? { ...s, content } : s
          )) }
        })
      }
    }
    if (toolUpdateTimerRef.current) {
      clearTimeout(toolUpdateTimerRef.current)
      toolUpdateTimerRef.current = null
      const pending = pendingToolUpdateRef.current
      pendingToolUpdateRef.current = null
      if (pending && assistantId) {
        messagesRef.current = messagesRef.current.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === pending.toolCallId ? { ...s, partialResult: pending.partialResult } : s
          )) }
        })
      }
    }
    if (skillParserRef.current) {
      skillParserRef.current.flush()
      skillParserRef.current = null
      if (pendingSkillFreeTextRef.current) {
        pendingTextDeltaRef.current += pendingSkillFreeTextRef.current
        pendingSkillFreeTextRef.current = ''
      }
      const toFlush = pendingTextDeltaRef.current
      pendingTextDeltaRef.current = ''
      if (toFlush && assistantId) {
        messagesRef.current = messagesRef.current.map((msg) => (
          msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
        ))
      }
    }
  }

  function saveSessionState(sessionId: string) {
    // 只有当前正在显示的会话才 flush 全局 refs 中的 pending delta；
    // 若 rapid switching 导致 cleanup 延迟，避免把当前活跃会话的缓冲刷进其他会话快照。
    if (activeSessionIdRef.current === sessionId) {
      flushPendingDeltas()
    }
    if (fallbackScanTimerRef.current) {
      clearTimeout(fallbackScanTimerRef.current)
      fallbackScanTimerRef.current = null
    }
    const existing = sessionStatesRef.current.get(sessionId)
    const state: ChatSessionState = {
      messages: messagesRef.current,
      hasMessages,
      streaming,
      error,
      sdkSessionId: sdkSessionIdRef.current,
      sdkSessionInfo: sdkSessionInfoRef.current,
      eventSource: eventSourceRef.current,
      eventReadySessionId: eventReadySessionIdRef.current,
      eventReadyResolve: eventReadyResolveRef.current,
      eventReadyTimeout: null,
      currentAssistantId: currentAssistantIdRef.current,
      currentThinking: currentThinkingRef.current,
      currentThinkingStart: currentThinkingStartRef.current,
      currentThinkingStepId: currentThinkingStepIdRef.current,
      pendingToolUpdate: pendingToolUpdateRef.current,
      toolUpdateTimer: null,
      pendingTextDelta: pendingTextDeltaRef.current,
      textDeltaTimer: null,
      pendingThinkingDelta: pendingThinkingDeltaRef.current,
      thinkingDeltaTimer: null,
      skillParser: skillParserRef.current,
      pendingSkillFreeText: pendingSkillFreeTextRef.current,
      normalizeSessionId: normalizeSessionIdRef.current,
      scannedForArtifacts: new Map(scannedForArtifactsRef.current),
      fallbackScanTimer: null,
      // 关键：不能无条件把 loaded 设成 true。如果会话还没从后端加载完（比如 React
      // StrictMode 导致 effect cleanup 提前触发），保存成 loaded=true 会让后续
      // 恢复直接拿空的缓存，导致历史记录空白。
      loaded: existing?.loaded ?? false,
    }
    sessionStatesRef.current.set(sessionId, state)
  }

  async function loadSessionState(sessionId: string) {
    const saved = sessionStatesRef.current.get(sessionId)
    if (saved?.loaded) {
      if (saved.eventSource && !eventSourceSessionMapRef.current.has(saved.eventSource)) {
        saved.eventSource = null
        saved.eventReadySessionId = null
        saved.eventReadyResolve = null
      }
      // 恢复前先把后台累积的 skill/parser 缓冲 flush 进 messages，并丢弃旧的解析器
      // （它的回调闭包指向旧的 state 对象，恢复为 active 后无法正确更新 UI）
      if (saved.skillParser) {
        saved.skillParser.flush()
        saved.skillParser = null
        if (saved.pendingSkillFreeText) {
          saved.pendingTextDelta += saved.pendingSkillFreeText
          saved.pendingSkillFreeText = ''
        }
        const toFlush = saved.pendingTextDelta
        saved.pendingTextDelta = ''
        if (toFlush && saved.currentAssistantId) {
          saved.messages = saved.messages.map((msg) => (
            msg.id === saved.currentAssistantId ? { ...msg, content: msg.content + toFlush } : msg
          ))
        }
      }
      messagesRef.current = saved.messages
      _setMessages(saved.messages)
      setHasMessages(saved.messages.length > 0)
      setMessagesLoaded(true)
      setStreaming(saved.streaming)
      setError(saved.error)
      sdkSessionIdRef.current = saved.sdkSessionId
      sdkSessionInfoRef.current = saved.sdkSessionInfo
      eventSourceRef.current = saved.eventSource
      eventReadySessionIdRef.current = saved.eventReadySessionId
      eventReadyResolveRef.current = saved.eventReadyResolve
      // 不恢复旧的 eventReadyTimeout：它的 closure 引用旧的 state，恢复后无法正确清理；
      // 若连接仍未就绪，让后续 connectEvents 重新创建新的 timeout。
      currentAssistantIdRef.current = saved.currentAssistantId
      currentThinkingRef.current = saved.currentThinking
      currentThinkingStartRef.current = saved.currentThinkingStart
      currentThinkingStepIdRef.current = saved.currentThinkingStepId
      pendingToolUpdateRef.current = saved.pendingToolUpdate
      toolUpdateTimerRef.current = saved.toolUpdateTimer
      pendingTextDeltaRef.current = saved.pendingTextDelta
      textDeltaTimerRef.current = saved.textDeltaTimer
      pendingThinkingDeltaRef.current = saved.pendingThinkingDelta
      thinkingDeltaTimerRef.current = saved.thinkingDeltaTimer
      skillParserRef.current = saved.skillParser
      pendingSkillFreeTextRef.current = saved.pendingSkillFreeText
      normalizeSessionIdRef.current = saved.normalizeSessionId
      scannedForArtifactsRef.current = saved.scannedForArtifacts
      fallbackScanTimerRef.current = saved.fallbackScanTimer
      forceScrollRef.current = true
      if (!saved.eventSource) {
        void connectEvents(sessionId)
      }
      return
    }

    // 丢弃未完成的占位快照（如上次初始化被切走）
    sessionStatesRef.current.delete(sessionId)

    messagesRef.current = []
    _setMessages([])
    setHasMessages(false)
    setMessagesLoaded(false)
    setStreaming(false)
    setError(null)
    sdkSessionIdRef.current = sessionId
    sdkSessionInfoRef.current = session ?? null
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null
    pendingToolUpdateRef.current = null
    toolUpdateTimerRef.current = null
    pendingTextDeltaRef.current = ''
    textDeltaTimerRef.current = null
    pendingThinkingDeltaRef.current = ''
    thinkingDeltaTimerRef.current = null
    skillParserRef.current = null
    pendingSkillFreeTextRef.current = ''
    normalizeSessionIdRef.current = sessionId
    scannedForArtifactsRef.current = new Map()
    if (fallbackScanTimerRef.current) {
      clearTimeout(fallbackScanTimerRef.current)
      fallbackScanTimerRef.current = null
    }

    try {
      await connectEvents(sessionId)
      const cwd = sdkSessionInfoRef.current?.cwd ?? session?.cwd
      const loadedMessages = await getMessages(sessionId, cwd)
      const normalized = normalizeLoadedMessages(loadedMessages)
      const state = getOrCreateSessionState(sessionId)
      state.messages = normalized
      state.hasMessages = normalized.length > 0
      state.sdkSessionId = sessionId
      state.sdkSessionInfo = sdkSessionInfoRef.current
      state.loaded = true
      if (activeSessionIdRef.current === sessionId) {
        messagesRef.current = normalized
        _setMessages(normalized)
        setHasMessages(normalized.length > 0)
        setMessagesLoaded(true)
        forceScrollRef.current = true
      }

      // 老会话没有标题时，用第一条用户消息内容作为标题回填
if (normalized.length > 0 && !sdkSessionInfoRef.current?.firstMessage && onSessionCreated) {
          const firstUser = normalized.find((msg) => msg.role === 'user')
          if (firstUser?.content) {
            const title = summarizeTitle(firstUser.content.trim())
            const updatedInfo = { ...sdkSessionInfoRef.current!, firstMessage: title }
            sdkSessionInfoRef.current = updatedInfo
            onSessionCreated(updatedInfo)
          }
        }
    } catch (err) {
      const state = getOrCreateSessionState(sessionId)
      const message = err instanceof Error ? err.message : String(err)
      state.error = message
      if (activeSessionIdRef.current === sessionId) {
        setError(`加载会话失败：${message}`)
        setMessages([])
      }
    }
  }

  function closeAllEventSources() {
    for (const [es] of eventSourceSessionMapRef.current) {
      es.close()
    }
    eventSourceSessionMapRef.current.clear()
    eventSourceRef.current = null
    for (const entry of staleEventSourcesRef.current) {
      clearTimeout(entry.closeTimer)
      entry.es.close()
    }
    staleEventSourcesRef.current = []
    for (const state of sessionStatesRef.current.values()) {
      if (state.eventReadyTimeout) {
        clearTimeout(state.eventReadyTimeout)
        state.eventReadyTimeout = null
      }
      state.eventSource = null
      state.eventReadySessionId = null
      state.eventReadyResolve = null
    }
  }

  useEffect(() => {
    return () => {
      // 组件卸载：关闭所有会话的 SSE，清理所有节流定时器
      closeAllEventSources()
      if (textDeltaTimerRef.current) {
        clearTimeout(textDeltaTimerRef.current)
        textDeltaTimerRef.current = null
      }
      if (thinkingDeltaTimerRef.current) {
        clearTimeout(thinkingDeltaTimerRef.current)
        thinkingDeltaTimerRef.current = null
      }
      if (toolUpdateTimerRef.current) {
        clearTimeout(toolUpdateTimerRef.current)
        toolUpdateTimerRef.current = null
      }
      if (fallbackScanTimerRef.current) {
        clearTimeout(fallbackScanTimerRef.current)
        fallbackScanTimerRef.current = null
      }
    }
  }, [])

  const normalizeMessagesForSession = useCallback(async (sessionId: string) => {
    if (!sessionId) return
    normalizeSessionIdRef.current = sessionId
    try {
      const cwd = sdkSessionInfoRef.current?.cwd ?? session?.cwd
      const loadedMessages = await getMessages(sessionId, cwd)
      if (normalizeSessionIdRef.current !== sessionId) return
      setMessages((currentMessages) => {
        // 保留前端独有的字段（后端不知道，normalize 会丢）：
        // 1) 用户消息的 attachments（上传文件卡片）
        // 2) assistant 消息的 source==='local-scan' artifacts（AI 生成文件卡片）
        // 用「同 role 出现顺序」匹配（id 在 normalize 前后会变，content 也可能略有差异，
        // 但顺序最稳定）。
        const userAttachmentsByOrder: (MessageAttachment[] | undefined)[] = []
        const assistantLocalArtifactsByOrder: ArtifactInfo[][] = []
        for (const msg of currentMessages) {
          if (msg.role === 'user') {
            userAttachmentsByOrder.push(msg.attachments)
          } else if (msg.role === 'assistant') {
            const localOnes = (msg.artifacts ?? []).filter((a) => a.source === 'local-scan')
            assistantLocalArtifactsByOrder.push(localOnes)
          }
        }

        let normalized = normalizeLoadedMessages(loadedMessages)
        // 按同 role 出现顺序回填前端独有字段
        {
          let userIdx = 0
          let assistantIdx = 0
          normalized = normalized.map((msg) => {
            if (msg.role === 'user') {
              const carry = userAttachmentsByOrder[userIdx++]
              if (carry && carry.length > 0) {
                console.info(`[normalize] carry user attachments: ${carry.length} item(s) → ${msg.id}`)
                return { ...msg, attachments: carry }
              }
              return msg
            }
            if (msg.role === 'assistant') {
              const carry = assistantLocalArtifactsByOrder[assistantIdx++]
              if (carry && carry.length > 0) {
                const existingPaths = new Set((msg.artifacts ?? []).map((a) => (a.localPath ?? a.path ?? '').toLowerCase()))
                const keep = carry.filter((a) => !existingPaths.has((a.localPath ?? a.path ?? '').toLowerCase()))
                if (keep.length > 0) {
                  console.info(`[normalize] carry assistant local-scan artifacts: ${keep.length} item(s) → ${msg.id}`)
                  return { ...msg, artifacts: [...(msg.artifacts ?? []), ...keep] }
                }
              }
              return msg
            }
            return msg
          })
        }
        return normalized
      })
      forceScrollRef.current = true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Normalize messages failed:', err)
      setError(`整理会话消息失败：${message}`)
    }
  }, [])

  function applyBackgroundAgentEvent(event: WebAgentEvent, sessionId: string) {
    const state = getOrCreateSessionState(sessionId)

    switch (event.type) {
      case 'connected': {
        if (state.eventReadyResolve) {
          state.eventReadyResolve()
          state.eventReadyResolve = null
        }
        state.eventReadySessionId = event.sessionId
        break
      }
      case 'agent_start': {
        state.streaming = true
        state.error = null
        state.hasMessages = true
        break
      }
      case 'thinking_start': {
        state.currentThinking = ''
        state.currentThinkingStart = Date.now()
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        const stepId = 'think-' + Date.now()
        state.currentThinkingStepId = stepId
        const step: AgentStep = { type: 'thinking', id: stepId, content: '', durationMs: 0, isThinking: true }
        state.messages = state.messages.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        ))
        break
      }
      case 'thinking_delta': {
        state.currentThinking += event.delta
        const assistantId = state.currentAssistantId
        const stepId = state.currentThinkingStepId
        if (!assistantId || !stepId) return
        const content = state.currentThinking
        state.pendingThinkingDelta = ''
        state.messages = state.messages.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'thinking' && s.id === stepId ? { ...s, content } : s
          )) }
        })
        break
      }
      case 'thinking_end': {
        const content = event.content || state.currentThinking
        state.currentThinking = content
        const durationMs = Date.now() - state.currentThinkingStart
        const assistantId = state.currentAssistantId
        const stepId = state.currentThinkingStepId
        state.pendingThinkingDelta = ''
        if (assistantId && stepId) {
          state.messages = state.messages.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content, durationMs, isThinking: false } : s
            )) }
          })
        }
        state.currentThinkingStepId = null
        break
      }
      case 'assistant_delta': {
        const assistantId = state.currentAssistantId
        if (!assistantId) return
        if (!state.skillParser) {
          state.skillParser = createSkillStreamParser({
            onText: (text) => { state.pendingSkillFreeText += text },
            onSkillStart: (id, name, baseDir) => {
              const step: AgentStep = { type: 'skill_load', id, name, baseDir, content: '', isLoading: true }
              state.messages = state.messages.map((msg) => (
                msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
              ))
            },
            onSkillDelta: (id, content) => {
              state.messages = state.messages.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return { ...msg, steps: msg.steps.map((s) => (
                  s.type === 'skill_load' && s.id === id ? { ...s, content: s.content + content } : s
                )) }
              })
            },
            onSkillEnd: (id) => {
              state.messages = state.messages.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return { ...msg, steps: msg.steps.map((s) => (
                  s.type === 'skill_load' && s.id === id ? { ...s, isLoading: false } : s
                )) }
              })
            },
          })
        }
        state.skillParser.push(event.delta)
        const buffered = state.pendingSkillFreeText
        state.pendingSkillFreeText = ''
        if (buffered) state.pendingTextDelta += buffered
        const toFlush = state.pendingTextDelta
        state.pendingTextDelta = ''
        if (toFlush) {
          state.messages = state.messages.map((msg) => (
            msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
          ))
        }
        break
      }
      case 'tool_start': {
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        const step: AgentStep = { type: 'tool', id: event.toolCallId, name: event.toolName, status: 'running', args: event.args }
        state.messages = state.messages.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        ))
        break
      }
      case 'tool_update': {
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        state.pendingToolUpdate = { toolCallId: event.toolCallId, partialResult: event.partialResult }
        const pending = state.pendingToolUpdate
        state.pendingToolUpdate = null
        if (pending) {
          state.messages = state.messages.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'tool' && s.id === pending.toolCallId ? { ...s, partialResult: pending.partialResult } : s
            )) }
          })
        }
        break
      }
      case 'tool_end': {
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        state.messages = state.messages.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === event.toolCallId ? { ...s, status: event.isError ? 'error' : 'done', result: event.result } : s
          )) }
        })
        break
      }
      case 'artifact_created': {
        const assistantId = state.currentAssistantId
        const targetId = assistantId ?? [...state.messages].reverse().find((msg) => msg.role === 'assistant')?.id
        if (!targetId) break
        state.messages = state.messages.map((msg) => (
          msg.id === targetId ? { ...msg, artifacts: [...(msg.artifacts ?? []), event.artifact] } : msg
        ))
        break
      }
      case 'session_renamed': {
        if (state.sdkSessionInfo) {
          state.sdkSessionInfo = { ...state.sdkSessionInfo, name: event.name, titleSource: event.titleSource, aiTitleGenerated: event.aiTitleGenerated }
        }
        onSessionCreated?.({
          id: event.sessionId,
          cwd: state.sdkSessionInfo?.cwd ?? selectedCwd ?? '',
          sessionFile: state.sdkSessionInfo?.sessionFile,
          created: state.sdkSessionInfo?.created ?? new Date().toISOString(),
          modified: new Date().toISOString(),
          firstMessage: event.name || state.sdkSessionInfo?.firstMessage || '',
          messageCount: state.sdkSessionInfo?.messageCount ?? 0,
          name: event.name,
          titleSource: event.titleSource,
          aiTitleGenerated: event.aiTitleGenerated,
        })
        break
      }
      case 'agent_end': {
        state.streaming = false
        const finishedAssistantId = state.currentAssistantId
        state.currentAssistantId = null
        if (state.skillParser) {
          state.skillParser.flush()
          state.skillParser = null
        }
        if (state.pendingSkillFreeText) {
          state.pendingTextDelta += state.pendingSkillFreeText
          state.pendingSkillFreeText = ''
        }
        const tailText = state.pendingTextDelta
        state.pendingTextDelta = ''
        state.pendingThinkingDelta = ''
        if (tailText && finishedAssistantId) {
          state.messages = state.messages.map((msg) => (
            msg.id === finishedAssistantId ? { ...msg, content: msg.content + tailText } : msg
          ))
        }
        break
      }
      case 'error': {
        state.error = event.message
        state.streaming = false
        break
      }
    }
  }

  const handleAgentEvent = useCallback((event: WebAgentEvent & { target?: EventSource }) => {
    const sourceSessionId = event.target
      ? eventSourceSessionMapRef.current.get(event.target)
      : activeSessionIdRef.current
    if (!sourceSessionId) return
    const isActiveSession = sourceSessionId === activeSessionIdRef.current

    // 连接事件：始终处理，用于释放 connectEvents 的 ready Promise。
    if (event.type === 'connected') {
      if (eventReadyResolveRef.current && isActiveSession) {
        eventReadyResolveRef.current()
        eventReadyResolveRef.current = null
      }
      eventReadySessionIdRef.current = event.sessionId
      if (!isActiveSession) {
        const state = getOrCreateSessionState(sourceSessionId)
        if (state.eventReadyResolve) {
          state.eventReadyResolve()
          state.eventReadyResolve = null
        }
        state.eventReadySessionId = event.sessionId
      }
      return
    }

    // 非当前会话的流式/状态事件：更新该会话快照，不污染当前 UI。
    if (!isActiveSession) {
      applyBackgroundAgentEvent(event, sourceSessionId)
      return
    }

    switch (event.type) {
      case 'agent_start':
        setStreaming(true)
        setError(null)
        break
      case 'thinking_start': {
        currentThinkingRef.current = ''
        currentThinkingStartRef.current = Date.now()
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        const stepId = 'think-' + Date.now()
        currentThinkingStepIdRef.current = stepId
        const step: AgentStep = { type: 'thinking', id: stepId, content: '', durationMs: 0, isThinking: true }
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        )))
        break
      }
      case 'thinking_delta': {
        currentThinkingRef.current += event.delta
        const assistantId = currentAssistantIdRef.current
        const stepId = currentThinkingStepIdRef.current
        if (!assistantId || !stepId) return
        // 节流 60ms：避免每个 SSE delta 都触发一次 React 重渲染（白屏修复的核心）
        pendingThinkingDeltaRef.current = currentThinkingRef.current
        if (thinkingDeltaTimerRef.current) break
        thinkingDeltaTimerRef.current = setTimeout(() => {
          thinkingDeltaTimerRef.current = null
          const latestContent = pendingThinkingDeltaRef.current
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content: latestContent } : s
            )) }
          }))
        }, 60)
        break
      }
      case 'thinking_end': {
        const content = event.content || currentThinkingRef.current
        currentThinkingRef.current = content
        const durationMs = Date.now() - currentThinkingStartRef.current
        const assistantId = currentAssistantIdRef.current
        const stepId = currentThinkingStepIdRef.current
        // 立刻 flush pending thinking delta（保证 thinking_end 不被节流的 setTimeout 覆盖）
        if (thinkingDeltaTimerRef.current) {
          clearTimeout(thinkingDeltaTimerRef.current)
          thinkingDeltaTimerRef.current = null
        }
        pendingThinkingDeltaRef.current = ''
        if (assistantId && stepId) {
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content, durationMs, isThinking: false } : s
            )) }
          }))
        }
        currentThinkingStepIdRef.current = null
        break
      }
      case 'assistant_delta': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) return

        // 懒初始化 skill 解析器
        if (!skillParserRef.current) {
          skillParserRef.current = createSkillStreamParser({
            onText: (text) => {
              pendingSkillFreeTextRef.current += text
            },
            onSkillStart: (id, name, baseDir) => {
              const step: AgentStep = {
                type: 'skill_load',
                id,
                name,
                baseDir,
                content: '',
                isLoading: true,
              }
              setMessages((prev) => prev.map((msg) => (
                msg.id === assistantId
                  ? { ...msg, steps: [...(msg.steps ?? []), step] }
                  : msg
              )))
            },
            onSkillDelta: (id, content) => {
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return {
                  ...msg,
                  steps: msg.steps.map((s) =>
                    s.type === 'skill_load' && s.id === id
                      ? { ...s, content: s.content + content }
                      : s,
                  ),
                }
              }))
            },
            onSkillEnd: (id) => {
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return {
                  ...msg,
                  steps: msg.steps.map((s) =>
                    s.type === 'skill_load' && s.id === id
                      ? { ...s, isLoading: false }
                      : s,
                  ),
                }
              }))
            },
          })
        }
        // 把原始 delta 喂给解析器；纯文本部分会累积到 pendingSkillFreeTextRef
        skillParserRef.current.push(event.delta)

        // 60ms 节流：把累积的"非 skill 文本"刷新到 message.content（保留白屏修复）
        const buffered = pendingSkillFreeTextRef.current
        pendingSkillFreeTextRef.current = ''
        if (buffered) pendingTextDeltaRef.current += buffered
        if (textDeltaTimerRef.current) break
        textDeltaTimerRef.current = setTimeout(() => {
          textDeltaTimerRef.current = null
          // 节流到期前可能又有新的 onText 回调进来，再合并一次
          const moreBuf = pendingSkillFreeTextRef.current
          pendingSkillFreeTextRef.current = ''
          if (moreBuf) pendingTextDeltaRef.current += moreBuf
          const toFlush = pendingTextDeltaRef.current
          pendingTextDeltaRef.current = ''
          if (!toFlush) return
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
          )))
        }, 60)
        break
      }
      case 'tool_start': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        const step: AgentStep = {
          type: 'tool',
          id: event.toolCallId,
          name: event.toolName,
          status: 'running',
          args: event.args,
        }
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        )))
        break
      }
      case 'tool_update': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        pendingToolUpdateRef.current = { toolCallId: event.toolCallId, partialResult: event.partialResult }
        if (toolUpdateTimerRef.current) return
        toolUpdateTimerRef.current = setTimeout(() => {
          toolUpdateTimerRef.current = null
          const pending = pendingToolUpdateRef.current
          if (!pending) return
          pendingToolUpdateRef.current = null
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'tool' && s.id === pending.toolCallId ? { ...s, partialResult: pending.partialResult } : s
            )) }
          }))
        }, 200)
        break
      }
      case 'tool_end': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === event.toolCallId ? { ...s, status: event.isError ? 'error' : 'done', result: event.result } : s
          )) }
        }))
        break
      }
      case 'artifact_created': {
        const assistantId = currentAssistantIdRef.current
        setMessages((prev) => {
          const targetId = assistantId ?? [...prev].reverse().find((msg) => msg.role === 'assistant')?.id
          if (!targetId) return prev
          return prev.map((msg) => (
            msg.id === targetId ? { ...msg, artifacts: [...(msg.artifacts ?? []), event.artifact] } : msg
          ))
        })
        break
      }
      case 'session_renamed':
        sdkSessionInfoRef.current = sdkSessionInfoRef.current
          ? { ...sdkSessionInfoRef.current, name: event.name, titleSource: event.titleSource, aiTitleGenerated: event.aiTitleGenerated }
          : sdkSessionInfoRef.current
        onSessionCreated?.({
          id: event.sessionId,
          cwd: sdkSessionInfoRef.current?.cwd ?? selectedCwd ?? '',
          sessionFile: sdkSessionInfoRef.current?.sessionFile,
          created: sdkSessionInfoRef.current?.created ?? new Date().toISOString(),
          modified: new Date().toISOString(),
          firstMessage: event.name || sdkSessionInfoRef.current?.firstMessage || '',
          messageCount: sdkSessionInfoRef.current?.messageCount ?? 0,
          name: event.name,
          titleSource: event.titleSource,
          aiTitleGenerated: event.aiTitleGenerated,
        })
        break
      case 'agent_end': {
        setStreaming(false)
        const sessionId = sdkSessionIdRef.current
        const finishedAssistantId = currentAssistantIdRef.current
        currentAssistantIdRef.current = null

        // 流结束：把 skill 解析器剩余缓冲全部 flush。把任何剩余的「非 skill 纯文本」
        // 也并入 pendingTextDeltaRef，下面的 tailText 会一起写到 message.content。
        if (skillParserRef.current) {
          skillParserRef.current.flush()
          skillParserRef.current = null
        }
        if (pendingSkillFreeTextRef.current) {
          pendingTextDeltaRef.current += pendingSkillFreeTextRef.current
          pendingSkillFreeTextRef.current = ''
        }

        // 立刻 flush 所有 pending delta，防止节流的 setTimeout 在 setStreaming(false) 之后才落地，
        // 造成"看上去结束了但末尾字符没写进消息"或与 normalize 抢覆盖。
        if (textDeltaTimerRef.current) {
          clearTimeout(textDeltaTimerRef.current)
          textDeltaTimerRef.current = null
        }
        const tailText = pendingTextDeltaRef.current
        pendingTextDeltaRef.current = ''
        if (thinkingDeltaTimerRef.current) {
          clearTimeout(thinkingDeltaTimerRef.current)
          thinkingDeltaTimerRef.current = null
        }
        pendingThinkingDeltaRef.current = ''
        if (tailText && finishedAssistantId) {
          setMessages((prev) => prev.map((msg) => (
            msg.id === finishedAssistantId ? { ...msg, content: msg.content + tailText } : msg
          )))
        }
        if (sessionId) {
          void normalizeMessagesForSession(sessionId)
        }
        break
      }
      case 'error':
        setError(event.message)
        setStreaming(false)
        break
    }
  }, [onSessionCreated, selectedCwd])

  const connectEvents = useCallback(async (sessionId: string): Promise<void> => {
    // 查找该会话是否已有 SSE 连接
    let existingEs: EventSource | undefined
    for (const [es, sid] of eventSourceSessionMapRef.current) {
      if (sid === sessionId) {
        existingEs = es
        break
      }
    }
    const state = getOrCreateSessionState(sessionId)
    if (existingEs) {
      // 该会话已有 SSE 连接（可能正在后台运行），直接复用
      if (sessionId === activeSessionIdRef.current) {
        eventSourceRef.current = existingEs
      }
      return
    }

    return new Promise((resolve) => {
      // SSE 连接应尽快就绪，但不应阻塞用户发送消息。
      // 2 秒内收到 open/connected 即认为就绪；否则也放行，由后续 prompt 调用自己报错。
      const timeout = setTimeout(() => {
        if (state.eventReadyResolve === readyResolve) {
          state.eventReadyResolve = null
        }
        state.eventReadyTimeout = null
        if (sessionId === activeSessionIdRef.current) {
          eventReadyResolveRef.current = null
        }
        resolve()
      }, 2000)

      const readyResolve = () => {
        clearTimeout(timeout)
        if (state.eventReadyResolve === readyResolve) {
          state.eventReadyResolve = null
        }
        state.eventReadyTimeout = null
        if (sessionId === activeSessionIdRef.current) {
          eventReadyResolveRef.current = null
        }
        resolve()
      }

      state.eventReadyResolve = readyResolve
      state.eventReadyTimeout = timeout
      if (sessionId === activeSessionIdRef.current) {
        eventReadyResolveRef.current = readyResolve
      }

      try {
        const es = connectSessionEvents(sessionId, (event) => handleAgentEvent({ ...event, target: es }))
        eventSourceSessionMapRef.current.set(es, sessionId)
        state.eventSource = es
        if (sessionId === activeSessionIdRef.current) {
          eventSourceRef.current = es
        }
      } catch (err) {
        clearTimeout(timeout)
        state.eventReadyResolve = null
        state.eventReadyTimeout = null
        if (sessionId === activeSessionIdRef.current) {
          eventReadyResolveRef.current = null
        }
        console.error('Failed to connect session events:', err)
        resolve()
      }
    })
  }, [handleAgentEvent])

  const ensureSdkSession = useCallback(async () => {
    if (sdkSessionIdRef.current && sdkSessionInfoRef.current) return sdkSessionInfoRef.current
    const cwd = newSessionCwd ?? session?.cwd ?? selectedCwd ?? undefined
    const created = await createSession(cwd)
    sdkSessionIdRef.current = created.id
    sdkSessionInfoRef.current = created
    activeSessionIdRef.current = created.id
    const state = getOrCreateSessionState(created.id)
    state.sdkSessionId = created.id
    state.sdkSessionInfo = created
    await connectEvents(created.id)
    return created
  }, [connectEvents, newSessionCwd, selectedCwd, session?.cwd])

  const handleSend = useCallback(async (text: string, attachments?: LocalAttachment[]) => {
    const userAttachments = toMessageAttachments(attachments)
    const userMsg: Message = {
      id: 'u' + Date.now(),
      role: 'user',
      content: text,
      attachments: userAttachments,
      timestamp: new Date().toISOString(),
    }
    const assistantId = 'a' + Date.now()
    const lower = text.toLowerCase()
    const isWordTask = lower.includes('word') || lower.includes('docx') || lower.includes('文档') || lower.includes('word文档') || lower.includes('word文件')
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      steps: [],
      pendingTask: isWordTask ? 'word' : 'default',
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setHasMessages(true)
    forceScrollRef.current = true
    setStreaming(true)
    setError(null)
    currentAssistantIdRef.current = assistantId
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null

    try {
      const sdkSession = await ensureSdkSession()
      // 必须等 SSE 连接就绪再发 prompt，否则权限事件可能丢失
      await connectEvents(sdkSession.id)
      const updatedSession = {
        ...sdkSession,
        firstMessage: sdkSession.firstMessage || summarizeTitle(text),
        messageCount: Math.max(sdkSession.messageCount, 1),
        modified: new Date().toISOString(),
      }
      sdkSessionInfoRef.current = updatedSession
      onSessionCreated?.(updatedSession)

      // ---- 附件处理：图片 base64 / 文档前端解析提取文本 ----
      const ready = (attachments ?? []).filter((a) => a.status === 'ready')
      const images: ApiImagePayload[] = []
      const docContents: { name: string; content: string; error?: string }[] = []
      let uploadFailedNotice: string[] = []

      if (ready.length > 0) {
        for (const att of ready) {
          const isImg = att.file.type.startsWith('image/')
          if (isImg) {
            try {
              const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => {
                  const result = reader.result as string
                  resolve(result.split(',')[1] ?? result)
                }
                reader.onerror = () => reject(new Error('读取文件失败'))
                reader.readAsDataURL(att.file)
              })
              images.push({ name: att.name, mimeType: att.file.type, data })
            } catch {
              uploadFailedNotice.push(`${att.name}（读取失败）`)
            }
          } else {
            const extracted = await extractFileContent(att.file)
            docContents.push({ name: att.name, content: extracted.text, error: extracted.error })
          }
        }
      }

      // ---- 拼接 message：把文档文本透明插入，让 agent 能读到文件内容 ----
      let finalMessage = text
      const promptLines: string[] = []
      if (docContents.length > 0) {
        promptLines.push('')
        for (const doc of docContents) {
          if (doc.error) {
            promptLines.push(`[系统：用户上传了 ${doc.name}，但${doc.error}]`)
          } else if (doc.content) {
            promptLines.push(`[系统：用户上传了 ${doc.name}，文件内容如下，请基于此内容回答用户问题：]`)
            promptLines.push('```')
            promptLines.push(doc.content)
            promptLines.push('```')
          } else {
            promptLines.push(`[系统：用户上传了 ${doc.name}，但文件内容为空]`)
          }
        }
      }
      if (images.length > 0) {
        promptLines.push('')
        promptLines.push(`[系统：用户附了 ${images.length} 张图片，请使用视觉能力分析。]`)
      }
      if (uploadFailedNotice.length > 0) {
        promptLines.push('')
        promptLines.push('[系统：以下附件上传失败，请告知用户：' + uploadFailedNotice.join('；') + ']')
      }
      if (promptLines.length > 0) {
        finalMessage = text + '\n' + promptLines.join('\n')
      }

      // ---- 标记图片附件，让历史卡片正确显示 ----
      if (images.length > 0) {
        setMessages((prev) => prev.map((m) => {
          if (m.id !== userMsg.id) return m
          if (!m.attachments) return m
          return {
            ...m,
            attachments: m.attachments.map((a) => ({
              ...a,
              isImage: a.type === 'image' ? true : a.isImage,
            })),
          }
        }))
      }

      await sendPrompt(sdkSession.id, {
        message: finalMessage,
        images: images.length > 0 ? images : undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStreaming(false)
      currentAssistantIdRef.current = null
      if (skillParserRef.current) {
        skillParserRef.current = null
      }
      pendingSkillFreeTextRef.current = ''
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId ? { ...msg, content: `调用 Pi SDK 失败：${message}` } : msg
      )))
    }
  }, [ensureSdkSession, connectEvents, onSessionCreated])

  const handleAbort = useCallback(async () => {
    const sdkSessionId = sdkSessionIdRef.current
    const assistantId = currentAssistantIdRef.current
    if (!sdkSessionId) return

    // Close SSE connection for the active session only
    const es = eventSourceRef.current
    if (es) {
      es.close()
      eventSourceSessionMapRef.current.delete(es)
      eventSourceRef.current = null
    }
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null
    const state = sessionStatesRef.current.get(sdkSessionId)
    if (state) {
      state.eventSource = null
      state.eventReadySessionId = null
      state.eventReadyResolve = null
    }

    // Call backend abort
    try {
      await abortSession(sdkSessionId)
    } catch (err) {
      console.error('Abort failed:', err)
    }

    // Clear any pending tool update timer
    if (toolUpdateTimerRef.current) {
      clearTimeout(toolUpdateTimerRef.current)
      toolUpdateTimerRef.current = null
    }
    pendingToolUpdateRef.current = null

    // Remove incomplete assistant message
    if (assistantId) {
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantId))
    }

    // Reset state
    setStreaming(false)
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null
    if (skillParserRef.current) {
      skillParserRef.current = null
    }
    pendingSkillFreeTextRef.current = ''
  }, [])

  useEffect(() => {
    const previousActiveId = activeSessionIdRef.current
    activeSessionIdRef.current = session?.id ?? null

    // 切走前先把上一个活跃会话的状态保存下来，避免 cleanup 延迟导致快照丢失或错乱
    if (previousActiveId && previousActiveId !== session?.id) {
      saveSessionState(previousActiveId)
    }

    if (!session?.id) {
      // 新会话占位状态：清空 active refs + UI
      messagesRef.current = []
      setMessages([])
      setHasMessages(!!session)
      setMessagesLoaded(false)
      setStreaming(false)
      setError(null)
      sdkSessionIdRef.current = null
      sdkSessionInfoRef.current = session
      eventSourceRef.current = null
      eventReadySessionIdRef.current = null
      eventReadyResolveRef.current = null
      currentAssistantIdRef.current = null
      currentThinkingRef.current = ''
      currentThinkingStartRef.current = 0
      currentThinkingStepIdRef.current = null
      pendingToolUpdateRef.current = null
      toolUpdateTimerRef.current = null
      pendingTextDeltaRef.current = ''
      textDeltaTimerRef.current = null
      pendingThinkingDeltaRef.current = ''
      thinkingDeltaTimerRef.current = null
      if (skillParserRef.current) {
        skillParserRef.current = null
      }
      pendingSkillFreeTextRef.current = ''
      normalizeSessionIdRef.current = null
      scannedForArtifactsRef.current.clear()
      if (fallbackScanTimerRef.current) {
        clearTimeout(fallbackScanTimerRef.current)
        fallbackScanTimerRef.current = null
      }
      return
    }

    const sid = session.id
    void loadSessionState(sid)

    return () => {
      // 切走前保存当前会话状态；后台 SSE 保持连接
      if (activeSessionIdRef.current === sid) {
        saveSessionState(sid)
      }
    }
  }, [session, newSessionCwd])

  useEffect(() => {
    return () => {
      // 组件卸载：关闭所有会话的 SSE，清理所有节流定时器
      closeAllEventSources()
      if (textDeltaTimerRef.current) {
        clearTimeout(textDeltaTimerRef.current)
        textDeltaTimerRef.current = null
      }
      if (thinkingDeltaTimerRef.current) {
        clearTimeout(thinkingDeltaTimerRef.current)
        thinkingDeltaTimerRef.current = null
      }
      if (toolUpdateTimerRef.current) {
        clearTimeout(toolUpdateTimerRef.current)
        toolUpdateTimerRef.current = null
      }
      if (fallbackScanTimerRef.current) {
        clearTimeout(fallbackScanTimerRef.current)
        fallbackScanTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // Auto-scroll to bottom only when user is near bottom
    const container = scrollContainerRef.current
    if (!container) return

    // Force scroll: user just sent a message, or history just loaded
    if (forceScrollRef.current) {
      forceScrollRef.current = false
      isUserNearBottomRef.current = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight
        })
      })
      return
    }

    const threshold = 100
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    isUserNearBottomRef.current = nearBottom
    if (nearBottom) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
    }
  }, [messages])

  const effectiveCwd = newSessionCwd ?? session?.cwd ?? selectedCwd
  const showChat = session !== null || newSessionCwd !== null
  const isEmptyNew = !!(session === null && newSessionCwd && !hasMessages)
  const isNewSession = !!(session && messagesLoaded && !hasMessages)

  if (!showChat && !selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-xl)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            boxShadow: 'var(--shadow-md)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
            选择一个项目目录
          </div>
          <div style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
            从左侧边栏选择或添加一个项目，开始与智能体对话
          </div>
        </div>
      </div>
    )
  }

  if (!showChat && selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-xl)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            boxShadow: 'var(--shadow-md)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
            开始新对话
          </div>
          <div style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)', textAlign: 'center' }}>
            点击左侧「新建对话」开始
          </div>
        </div>
      </div>
    )
  }

  if (isEmptyNew || isNewSession) {
    return (
      <WelcomeScreen
        chatInputRef={chatInputRef}
        onSend={handleSend}
        institution={APP_INSTITUTION}
      />
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-panel)', flexShrink: 0,
        fontSize: 'calc(var(--font-base) * 0.929)',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          {session?.name || session?.firstMessage?.slice(0, 50) || '会话'}
        </span>
        {effectiveCwd && (
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {effectiveCwd}
          </span>
        )}
        <div style={{ flex: 1 }} />
      </div>

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingTop: 16 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px' }}>
          {messages.map((m, index) => {
            const isLast = index === messages.length - 1
            const isActiveAssistant = isLast && m.role === 'assistant' && streaming
            // 历史消息可能在 content 中嵌有 <skill_content>...</skill_content>（流式拦截器是 0.1.22 之后才加的），
            // 这里再做一次防御性 sanitize：把 XML 块抽出作为虚拟 skill_load steps，
            // content 显示 sanitize 后的干净版本。流式期间不做（避免和实时解析器双重 emit）。
            let displayContent = m.content
            let displaySteps = m.steps
            if (m.role === 'assistant' && !isActiveAssistant && m.content && m.content.includes('<skill_content')) {
              const { cleanContent, skills } = extractSkillBlocks(m.content)
              if (skills.length > 0) {
                displayContent = cleanContent
                const histSkillSteps: AgentStep[] = skills.map((s) => ({
                  type: 'skill_load' as const,
                  id: `hist-${m.id}-${s.id}`,
                  name: s.name,
                  baseDir: s.baseDir,
                  content: s.content,
                  isLoading: false,
                }))
                displaySteps = [...(m.steps ?? []), ...histSkillSteps]
              }
            }
            const hasText = !!displayContent
            const hasSteps = !!(displaySteps && displaySteps.length > 0)
            // 用派生后的对象给 MessageView 渲染（保持原 m 不变以维持 memo 引用）
            const messageForView = displayContent === m.content && displaySteps === m.steps
              ? m
              : { ...m, content: displayContent, steps: displaySteps }
            return (
              <div key={m.id} style={{ marginBottom: m.role === 'user' ? 16 : 0 }}>
                {hasSteps && (
                  <ReasoningBlock steps={displaySteps!} />
                )}
                {!hasSteps && isActiveAssistant && !m.content && (
                  <PendingTaskCard task={m.pendingTask} />
                )}
                {hasText && (
                  <MessageErrorBoundary
                    content={displayContent}
                    sessionId={sdkSessionIdRef.current ?? session?.id ?? null}
                    messageId={m.id}
                  >
                    <MessageView message={messageForView} isStreaming={isLast && streaming} />
                  </MessageErrorBoundary>
                )}
              </div>
            )
          })}
          {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>{error}</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput ref={chatInputRef} onSend={handleSend} onAbort={handleAbort} isStreaming={streaming} />
    </div>
  )
}
