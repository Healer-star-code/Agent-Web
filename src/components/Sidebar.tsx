import { useState, useRef, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Plus, ChatCircle, PuzzlePiece, FileText, FilePdf, PresentationChart, Table, Wrench } from '@phosphor-icons/react'
import type { SessionInfo } from '../mockData'
import { getMessages } from '../lib/piApi'
import type { WebMessage } from '../lib/piApi'
import { XiaojinLogo } from './XiaojinLogo'

interface UserProfile {
  name: string
  email: string
}

const USER_PROFILE_KEY = 'pi-user-profile-v1'
const MAX_USERNAME_LEN = 10

interface Props {
  sessions: SessionInfo[]
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
  onDeleteSession: (s: SessionInfo) => void
  onRenameSession?: (s: SessionInfo, name: string) => void
  onPinSession?: (s: SessionInfo) => void
  pinnedIds?: Set<string>
  onNewSession: () => void
  sessionLoadError?: string | null
  sessionsLoading?: boolean
  onToast?: (message: string, type?: 'success' | 'error') => void
  onRefreshSessions?: () => void
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

interface SessionTreeNode {
  session: SessionInfo
  children: SessionTreeNode[]
}

function buildSessionTree(sessions: SessionInfo[], pinnedIds?: Set<string>): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>()
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] })
  }

  const parentOf = new Map<string, string>()
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId)
  }

  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id)
    const visited = new Set<string>()
    while (cur) {
      if (visited.has(cur)) return null
      visited.add(cur)
      if (byId.has(cur)) return cur
      cur = parentOf.get(cur)
    }
    return null
  }

  const roots: SessionTreeNode[] = []
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id)
    if (ancestor) {
      byId.get(ancestor)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => {
      const aPinned = pinnedIds?.has(a.session.id) ? 1 : 0
      const bPinned = pinnedIds?.has(b.session.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return b.session.modified.localeCompare(a.session.modified)
    })
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

function PiAgentTitle() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <XiaojinLogo size={28} />
      <span style={{ fontWeight: 750, fontSize: 'var(--font-md)', letterSpacing: '-0.02em', color: 'var(--text)' }}>
        超级小金
      </span>
    </span>
  )
}

type NavId = 'chat' | 'skills' | 'new'

interface NavItemDef {
  id: NavId | 'new'
  icon: ReactNode
  label: string
  action?: () => void
}

interface SkillDef {
  id: string
  name: string
  desc: string
}

const SKILLS: SkillDef[] = [
  { id: 'docx', name: 'Word 文档', desc: '创建和编辑 Word 文档' },
  { id: 'pdf', name: 'PDF 处理', desc: '读取、生成与处理 PDF' },
  { id: 'pptx', name: '演示文稿', desc: '制作 PowerPoint 演示文稿' },
  { id: 'xlsx', name: '表格处理', desc: '处理 Excel 表格与数据' },
  { id: 'skill-creator', name: '技能创建', desc: '自定义新技能与工具' },
]

export function Sidebar({ sessions, selectedId, onSelectSession, onNewSession, sessionLoadError, sessionsLoading, onDeleteSession, onRenameSession, onPinSession, pinnedIds, onToast, onRefreshSessions }: Props) {
  const [activeNav, setActiveNav] = useState<NavId>('chat')
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)
  const [skillsCollapsed, setSkillsCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const raw = localStorage.getItem(USER_PROFILE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as UserProfile
        if (parsed.name && typeof parsed.name === 'string') {
          return { name: parsed.name.slice(0, MAX_USERNAME_LEN), email: String(parsed.email ?? '') }
        }
      }
    } catch { /* ignore */ }
    return { name: '', email: '' }
  })
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedId && activeNav === 'new') {
      setActiveNav('chat')
      setSessionsCollapsed(false)
    }
  }, [selectedId, activeNav])

  useEffect(() => {
    try {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(userProfile))
    } catch { /* ignore */ }
  }, [userProfile])

  const filteredSessions = useMemo(() => {
    let list = sessions
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((s) => {
        const text = `${s.name ?? ''} ${s.firstMessage ?? ''} ${s.cwd ?? ''} ${s.model?.provider ?? ''} ${s.model?.modelId ?? ''}`.toLowerCase()
        return text.includes(q)
      })
    }
    return list
  }, [sessions, search])

  const sessionTree = useMemo(() => buildSessionTree(filteredSessions, pinnedIds), [filteredSessions, pinnedIds])

  const navItems: NavItemDef[] = [
    { id: 'new', icon: <Plus weight="bold" size={18} />, label: '新建对话' },
    { id: 'chat', icon: <ChatCircle weight="bold" size={18} />, label: '历史对话' },
    { id: 'skills', icon: <PuzzlePiece weight="bold" size={18} />, label: '技能库' },
  ]

  const sessionListSection = (
    <div style={{ padding: '0 10px' }}>
      <div
        onClick={() => setSessionsCollapsed((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)' }}>会话</span>
          <span style={{
            padding: '1px 6px',
            borderRadius: 'var(--radius-xs)',
            background: 'var(--bg-hover)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
          }}>
            {filteredSessions.length}
          </span>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: 'var(--text-dim)',
            transform: sessionsCollapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </div>
      {!sessionsCollapsed && (
        <div>
          {sessionsLoading && (
            <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                  <div className="skeleton-shimmer" style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', animationDelay: `${i * 80}ms` }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="skeleton-shimmer" style={{ width: '60%', height: 10, borderRadius: 'var(--radius-xs)', animationDelay: `${i * 80}ms` }} />
                    <div className="skeleton-shimmer" style={{ width: '40%', height: 8, borderRadius: 'var(--radius-xs)', animationDelay: `${i * 80 + 40}ms` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!sessionsLoading && filteredSessions.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', opacity: 0.5 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <div style={{ fontSize: 'var(--font-sm)', fontWeight: 500, marginBottom: 4, color: 'var(--text)' }}>
                {sessionLoadError ? '暂时连接不上' : '暂无会话'}
              </div>
              <div style={{ fontSize: 'var(--font-xs)', lineHeight: 1.5, marginBottom: sessionLoadError ? 10 : 0 }}>
                {sessionLoadError
                  ? '还没连上超级小金服务。请检查服务是否已启动、地址和密码是否填对。'
                  : '点击「新建对话」开始'}
              </div>
              {sessionLoadError && onRefreshSessions && (
                <button
                  onClick={onRefreshSessions}
                  disabled={sessionsLoading}
                  className="btn-sidebar-reload"
                  style={{ cursor: sessionsLoading ? 'wait' : 'pointer' }}
                >
                  {sessionsLoading ? '正在刷新…' : '重新加载'}
                </button>
              )}
            </div>
          )}
          {!sessionsLoading && sessionTree.map((node) => (
            <SessionTreeItem
              key={node.session.id}
              node={node}
              selectedId={selectedId}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              onRenameSession={onRenameSession}
              onPinSession={onPinSession}
              pinnedIds={pinnedIds}
              depth={0}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  )

  const renderContent = () => {
    switch (activeNav) {
      case 'chat':
      case 'new':
        return (
          <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '0', minHeight: 80 }}>
            <div style={{ padding: '10px 10px 8px', position: 'relative' }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-dim)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', left: 19, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索会话..."
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 28px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                  fontSize: 'var(--font-sm)',
                  outline: 'none',
                }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); searchRef.current?.focus() }}
                  style={{
                    position: 'absolute',
                    right: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 18,
                    height: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {sessionListSection}
          </div>
        )
      case 'skills':
        return (
          <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '0', minHeight: 80 }}>
            <div style={{ padding: '0 10px' }}>
              <div
                onClick={() => setSkillsCollapsed((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0 8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)' }}>技能库</span>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-hover)',
                    fontSize: 'var(--font-xs)',
                    color: 'var(--text-muted)',
                  }}>
                    {SKILLS.length}
                  </span>
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    color: 'var(--text-dim)',
                    transform: skillsCollapsed ? 'rotate(-90deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                >
                  <polyline points="2 3.5 5 6.5 8 3.5" />
                </svg>
              </div>
              {!skillsCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0 8px' }}>
                  {SKILLS.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div style={{ padding: '12px 10px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <PiAgentTitle />
      </div>

      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {navItems.map((item) => {
          const isActive = item.id === activeNav
          const baseStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: 'var(--font-sm)',
            color: 'var(--text)',
            transition: 'background 0.1s, color 0.1s',
            borderLeft: '2px solid transparent',
          }
          const activeStyle: React.CSSProperties = isActive
            ? {
                marginLeft: -10,
                paddingLeft: 18,
                background: 'var(--bg-selected)',
                color: 'var(--accent)',
                borderLeft: '2px solid var(--accent)',
              }
            : {}
          return (
            <motion.div
              key={item.id}
              onClick={() => {
                if (item.id === 'new') {
                  onNewSession()
                  setActiveNav('new')
                  setSessionsCollapsed(false)
                } else {
                  setActiveNav(item.id as NavId)
                  if (item.id === 'chat') {
                    setSessionsCollapsed(false)
                    // 切到历史对话时，如果没有选中任何会话，自动打开最新一条，
                    // 避免主界面一直停留在初始空白页。
                    if (!selectedId && sessions.length > 0) {
                      const latest = sessions.reduce((a, b) =>
                        a.modified > b.modified ? a : b
                      )
                      onSelectSession(latest)
                    }
                  }
                }
              }}
              style={{ ...baseStyle, ...activeStyle }}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <span style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</span>
              <span>{item.label}</span>
            </motion.div>
          )
        })}
      </div>

      {renderContent()}

      <UserProfileBar
        profile={userProfile}
        onProfileChange={setUserProfile}
        menuOpen={userMenuOpen}
        onMenuOpenChange={setUserMenuOpen}
        editing={editingProfile}
        onEditingChange={setEditingProfile}
      />
    </div>
  )
}

function SkillCard({ skill }: { skill: SkillDef }) {
  const [enabled, setEnabled] = useState(false)
  const skillIcon = useMemo(() => {
    switch (skill.id) {
      case 'docx': return <FileText weight="duotone" size={20} />
      case 'pdf': return <FilePdf weight="duotone" size={20} />
      case 'pptx': return <PresentationChart weight="duotone" size={20} />
      case 'xlsx': return <Table weight="duotone" size={20} />
      case 'skill-creator': return <Wrench weight="duotone" size={20} />
      default: return <PuzzlePiece weight="duotone" size={20} />
    }
  }, [skill.id])
  return (
    <motion.div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px',
        background: 'var(--bg-hover)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
      }}
      onClick={() => setEnabled((v) => !v)}
      whileHover={{ y: -2, boxShadow: 'var(--shadow-md)' }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--accent)', flexShrink: 0 }}>{skillIcon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--font-sm)', fontWeight: 500, color: 'var(--text)' }}>{skill.name}</div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{skill.desc}</div>
      </div>
      <div
        style={{
          width: 34,
          height: 18,
          borderRadius: 9,
          background: enabled ? 'var(--accent)' : 'var(--border)',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: enabled ? 17 : 3,
            top: 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }}
        />
      </div>
    </motion.div>
  )
}

function SessionTreeItem({ node, selectedId, onSelectSession, onDeleteSession, onRenameSession, onPinSession, pinnedIds, depth, onToast }: {
  node: SessionTreeNode
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
  onDeleteSession: (s: SessionInfo) => void
  onRenameSession?: (s: SessionInfo, name: string) => void
  onPinSession?: (s: SessionInfo) => void
  pinnedIds?: Set<string>
  depth: number
  onToast?: (message: string, type?: 'success' | 'error') => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {depth > 0 && (
          <div style={{
            position: 'absolute',
            left: depth * 12 + 6,
            top: 0, bottom: 0,
            width: 1,
            background: 'var(--border)',
            pointerEvents: 'none',
          }} />
        )}
        <SessionItem
          session={node.session}
          isSelected={node.session.id === selectedId}
          onClick={() => onSelectSession(node.session)}
          onDelete={() => onDeleteSession(node.session)}
          onRename={(name) => onRenameSession?.(node.session, name)}
          onPin={() => onPinSession?.(node.session)}
          isPinned={pinnedIds?.has(node.session.id) ?? false}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          onToast={onToast}
        />
      </div>
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedId={selectedId}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              onRenameSession={onRenameSession}
              onPinSession={onPinSession}
              pinnedIds={pinnedIds}
              depth={depth + 1}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function getSessionTitle(session: SessionInfo): string {
  return session.name || session.firstMessage || session.id.slice(0, 12)
}

function getSessionDisplayTitle(session: SessionInfo): string {
  return session.name || session.firstMessage || '新会话'
}

function formatSessionToMarkdown(session: SessionInfo, messages: WebMessage[]): string {
  const title = getSessionTitle(session)
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`> 项目：\`${session.cwd}\``)
  lines.push(`> 时间：${formatDateTime(session.modified)}`)
  if (session.model) {
    lines.push(`> 模型：${session.model.provider}/${session.model.modelId}`)
  }
  lines.push(`> 消息数：${messages.length} 条`)
  lines.push('')
  lines.push('---')
  lines.push('')

  messages.forEach((message, idx) => {
    const speaker = message.role === 'user' ? '用户' : '超级小金'
    lines.push(`## ${idx + 1}. ${speaker}`)
    lines.push('')
    if (message.content) {
      lines.push('```')
      lines.push(message.content)
      lines.push('```')
    } else {
      lines.push('（无内容）')
    }
    if (message.role === 'assistant' && message.thinkingContent) {
      lines.push('')
      const duration = message.thinkingDurationMs ? `（${message.thinkingDurationMs.toLocaleString()}ms）` : ''
      lines.push(`**思考过程**${duration}`)
      lines.push('')
      lines.push('```thinking')
      lines.push(message.thinkingContent)
      lines.push('```')
    }
    lines.push('')
  })

  return lines.join('\n')
}

function formatSessionToTxt(session: SessionInfo, messages: WebMessage[]): string {
  const title = getSessionTitle(session)
  const lines: string[] = []
  lines.push(`会话：${title}`)
  lines.push(`项目：${session.cwd}`)
  lines.push(`时间：${formatDateTime(session.modified)}`)
  if (session.model) {
    lines.push(`模型：${session.model.provider}/${session.model.modelId}`)
  }
  lines.push(`消息数：${messages.length} 条`)
  lines.push('')
  lines.push('='.repeat(60))
  lines.push('')

  messages.forEach((message, idx) => {
    const speaker = message.role === 'user' ? '用户' : '超级小金'
    lines.push(`--- ${idx + 1}. ${speaker} ---`)
    lines.push('')
    lines.push(message.content || '（无内容）')
    if (message.role === 'assistant' && message.thinkingContent) {
      lines.push('')
      const duration = message.thinkingDurationMs ? `（${message.thinkingDurationMs.toLocaleString()}ms）` : ''
      lines.push(`--- 思考过程${duration} ---`)
      lines.push('')
      lines.push(message.thinkingContent)
    }
    lines.push('')
  })

  return lines.join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function formatSessionToHtml(session: SessionInfo, messages: WebMessage[]): string {
  const title = getSessionTitle(session)
  const meta: string[] = [
    `项目：${escapeHtml(session.cwd)}`,
    `时间：${formatDateTime(session.modified)}`,
  ]
  if (session.model) {
    meta.push(`模型：${escapeHtml(`${session.model.provider}/${session.model.modelId}`)}`)
  }
  meta.push(`消息数：${messages.length} 条`)

  const messageHtml = messages.map((message, idx) => {
    const isUser = message.role === 'user'
    const speaker = isUser ? '用户' : '超级小金'
    const content = escapeHtml(message.content || '（无内容）')
    const thinking = !isUser && message.thinkingContent
      ? `
        <div class="thinking">
          <div class="thinking-header">思考过程${message.thinkingDurationMs ? `（${message.thinkingDurationMs.toLocaleString()}ms）` : ''}</div>
          <div class="thinking-body"><pre>${escapeHtml(message.thinkingContent)}</pre></div>
        </div>
      `
      : ''
    return `
      <div class="message ${isUser ? 'user' : 'assistant'}">
        <div class="message-header">${idx + 1}. ${speaker}</div>
        <div class="message-body"><pre>${content}</pre></div>
        ${thinking}
      </div>
    `
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - 超级小金</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 28px; }
  h1 { margin: 0 0 12px; font-size: 22px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eee; }
  .message { margin-bottom: 20px; }
  .message-header { font-size: 12px; font-weight: 600; color: #666; margin-bottom: 6px; text-transform: uppercase; }
  .message-body { background: #f8f9fa; border-radius: 8px; padding: 14px; }
  .message.user .message-body { background: #eef4ff; }
  .thinking { margin-top: 10px; border-left: 3px solid #f59e0b; padding-left: 12px; }
  .thinking-header { font-size: 11px; font-weight: 600; color: #b45309; margin-bottom: 4px; }
  .thinking-body { background: #fffbeb; border-radius: 6px; padding: 10px; }
  .thinking-body pre { color: #78350f; }
  .message.assistant .message-body { background: #f6f6f6; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; }
</style>
</head>
<body>
<div class="container">
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${meta.join(' · ')}</div>
  ${messageHtml}
</div>
</body>
</html>`
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'share'
}

function SessionItem({ session, isSelected, onClick, onDelete, onRename, onPin, isPinned, depth = 0, hasChildren = false, collapsed = false, onToggleCollapse, onToast }: {
  session: SessionInfo
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  onRename?: (name: string) => void
  onPin?: () => void
  isPinned?: boolean
  depth?: number
  hasChildren?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onToast?: (message: string, type?: 'success' | 'error') => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [shareMode, setShareMode] = useState(false)
  const title = getSessionTitle(session)
  const displayTitle = getSessionDisplayTitle(session)
  const [draftTitle, setDraftTitle] = useState(displayTitle)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirming(false)
        setShareMode(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setConfirming(false)
        setShareMode(false)
      }
    }
    const resizeHandler = () => {
      setMenuOpen(false)
      setConfirming(false)
      setShareMode(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    window.addEventListener('resize', resizeHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
      window.removeEventListener('resize', resizeHandler)
    }
  }, [menuOpen])

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const MENU_WIDTH = 150
    const MENU_HEIGHT = 180
    const GAP = 6
    const PAD = 8
    let left = rect.right + GAP
    let top = rect.top
    if (left + MENU_WIDTH > window.innerWidth - PAD) {
      left = rect.left - MENU_WIDTH - GAP
    }
    if (left < PAD) left = PAD
    if (top + MENU_HEIGHT > window.innerHeight - PAD) {
      top = window.innerHeight - MENU_HEIGHT - PAD
    }
    if (top < PAD) top = PAD
    setMenuPos({ top, left })
    setMenuOpen(true)
  }

  function submitRename() {
    const next = draftTitle.trim()
    setEditing(false)
    if (next && next !== displayTitle) onRename?.(next)
  }

  const detailTitle = [
    `项目：${session.cwd}`,
    session.model ? `模型：${session.model.provider}/${session.model.modelId}` : null,
    session.tokens?.total ? `tokens：${session.tokens.total.toLocaleString()}` : null,
    session.cost && session.cost > 0 ? `费用：$${session.cost.toFixed(4)}` : null,
    `时间：${session.modified}`,
    `消息：${session.messageCount} 条`,
  ].filter(Boolean).join('\n')

  return (
    <motion.div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!menuOpen) setConfirming(false) }}
      style={{
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        paddingRight: 8,
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-selected)' : (hovered || menuOpen) ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.1s',
        gap: 6,
        overflow: 'hidden',
      }}
      title={detailTitle}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      {depth > 0 && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--sidebar-title-size, 12px)',
            fontWeight: isSelected ? 500 : 400,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title={title}
        >
          {isPinned && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-2.4a1 1 0 0 0-.3-.7l-2.1-1.9V7.5a1 1 0 0 1 .3-.7l1.5-1.4a1 1 0 0 0 .3-.7V3H5v1.7a1 1 0 0 0 .3.7l1.5 1.4a1 1 0 0 1 .3.7V12l-2.1 1.9a1 1 0 0 0-.3.7Z" />
            </svg>
          )}
          {editing ? (
            <input
              value={draftTitle}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') { setDraftTitle(displayTitle); setEditing(false) }
              }}
              style={{
                flex: 1, minWidth: 0, boxSizing: 'border-box',
                fontSize: 'var(--font-sm)', lineHeight: 1.4,
                border: '1px solid var(--accent)', borderRadius: 'var(--radius-xs)',
                padding: '2px 5px', background: 'var(--bg-panel)', color: 'var(--text)',
                outline: 'none',
              }}
            />
          ) : (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayTitle}
            </span>
          )}
          {!editing && session.orphaned && (
            <span style={{
              padding: '1px 5px',
              background: 'var(--danger-bg)',
              borderRadius: 'var(--radius-xs)', fontSize: 'var(--font-xs)',
              color: 'var(--danger)', fontWeight: 500,
              flexShrink: 0,
            }}>
              incomplete
            </span>
          )}
        </div>
        <div style={{ marginTop: 2, display: 'flex', gap: 8, color: 'var(--text-dim)', fontSize: 'var(--sidebar-meta-size, 11px)', overflow: 'hidden' }}>
          <span title={session.modified} style={{ flexShrink: 0 }}>{formatRelativeTime(session.modified)}</span>
          <span style={{ flexShrink: 0 }}>{session.messageCount} 条消息</span>
          {session.model && (
            <span title={`${session.model.provider}/${session.model.modelId}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.model.modelId}
            </span>
          )}
        </div>
      </div>

      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        {(hovered || menuOpen) && !editing && (
          <button
            ref={triggerRef}
            onClick={(e) => {
              e.stopPropagation()
              if (menuOpen) {
                setMenuOpen(false)
                setConfirming(false)
                setShareMode(false)
              } else {
                openMenu()
              }
            }}
            title="更多选项"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, padding: 0,
              background: menuOpen ? 'var(--bg-selected)' : 'none',
              border: 'none', borderRadius: 'var(--radius-xs)',
              color: menuOpen ? 'var(--text)' : 'var(--text-dim)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        )}
        {menuOpen && menuPos && (
          <div
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 'var(--z-dropdown)',
              minWidth: 140,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
              padding: 4,
            }}
          >
            {!shareMode ? (
              <>
                <MenuButton onClick={(e) => { e.stopPropagation(); onPin?.(); setMenuOpen(false) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-2.4a1 1 0 0 0-.3-.7l-2.1-1.9V7.5a1 1 0 0 1 .3-.7l1.5-1.4a1 1 0 0 0 .3-.7V3H5v1.7a1 1 0 0 0 .3.7l1.5 1.4a1 1 0 0 1 .3.7V12l-2.1 1.9a1 1 0 0 0-.3.7Z" />
                  </svg>
                  {isPinned ? '取消顶置' : '顶置'}
                </MenuButton>
                <MenuButton onClick={(e) => { e.stopPropagation(); setShareMode(true) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  分享
                </MenuButton>
                <MenuButton onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setDraftTitle(displayTitle); setEditing(true) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  重命名
                </MenuButton>
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 6px' }} />
                {!confirming ? (
                  <MenuButton onClick={(e) => { e.stopPropagation(); setConfirming(true) }} style={{ color: 'var(--danger)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    删除
                  </MenuButton>
                ) : (
                  <div style={{ display: 'flex', gap: 4, padding: '2px 6px' }}>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); setConfirming(false) }} style={{ flex: 1, padding: '3px 0', fontSize: 'var(--font-xs)', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>
                      确认
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirming(false) }} style={{ flex: 1, padding: '3px 0', fontSize: 'var(--font-xs)', background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>
                      取消
                    </button>
                  </div>
                )}
              </>
            ) : (
              <SharePanel
                session={session}
                onToast={onToast}
                onClose={() => { setMenuOpen(false); setShareMode(false) }}
              />
            )}
          </div>
        )}
      </div>

      {hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse?.() }}
          title={collapsed ? 'Expand forks' : 'Collapse forks'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, padding: 0, flexShrink: 0,
            background: 'none', border: 'none',
            color: 'var(--text-dim)', cursor: 'pointer',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>
      )}
    </motion.div>
  )
}

const MAX_SHARE_BYTES = 2 * 1024 * 1024

type ShareFormat = 'markdown' | 'html' | 'txt'

function SharePanel({ session, onToast, onClose }: { session: SessionInfo; onToast?: (message: string, type?: 'success' | 'error') => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  async function loadMessages(): Promise<WebMessage[] | null> {
    try {
      return await getMessages(session.id, session.cwd)
    } catch (err) {
      console.warn('[SharePanel] getMessages failed', err)
      onToast?.('加载对话失败：' + (err instanceof Error ? err.message : String(err)), 'error')
      return null
    }
  }

  async function withLoadedMessages<T>(action: (messages: WebMessage[]) => Promise<T> | T): Promise<void> {
    setLoading(true)
    try {
      const messages = await loadMessages()
      if (!messages) return
      await action(messages)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await withLoadedMessages(async (messages) => {
      const markdown = formatSessionToMarkdown(session, messages)
      if (markdown.length > MAX_SHARE_BYTES) {
        const mb = (markdown.length / (1024 * 1024)).toFixed(1)
        onToast?.(`对话内容太长（${mb} MB），无法复制到剪贴板，请先导出为文件`, 'error')
        return
      }

      if (!navigator.clipboard) {
        onToast?.('当前环境不支持剪贴板操作，请使用导出为文件功能', 'error')
        return
      }

      try {
        await navigator.clipboard.writeText(markdown)
        onToast?.(`已复制完整对话（${messages.length} 条消息）`, 'success')
        onClose()
      } catch (err) {
        console.warn('[SharePanel] clipboard write failed', err)
        onToast?.('复制到剪贴板失败：' + (err instanceof Error ? err.message : String(err)), 'error')
      }
    })
  }

  async function handleExport(format: ShareFormat) {
    await withLoadedMessages(async (messages) => {
      const title = safeFileName(getSessionTitle(session))
      const config = (() => {
        switch (format) {
          case 'markdown':
            return {
              content: formatSessionToMarkdown(session, messages),
              defaultFileName: `${title}.md`,
              mimeType: 'text/markdown',
            }
          case 'html':
            return {
              content: formatSessionToHtml(session, messages),
              defaultFileName: `${title}.html`,
              mimeType: 'text/html',
            }
          case 'txt':
          default:
            return {
              content: formatSessionToTxt(session, messages),
              defaultFileName: `${title}.txt`,
              mimeType: 'text/plain',
            }
        }
      })()

      if (config.content.length > MAX_SHARE_BYTES) {
        const mb = (config.content.length / (1024 * 1024)).toFixed(1)
        onToast?.(`对话内容太长（${mb} MB），无法导出`, 'error')
        return
      }

      try {
        const blob = new Blob([config.content], { type: config.mimeType })
        if ('showSaveFilePicker' in window) {
          const picker = (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
          const handle = await picker({
            suggestedName: config.defaultFileName,
            types: [{
              description: config.defaultFileName.endsWith('.md') ? 'Markdown' : config.defaultFileName.endsWith('.html') ? 'HTML' : 'Text',
              accept: { [config.mimeType]: ['.' + config.defaultFileName.split('.').pop()] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          onToast?.('已保存', 'success')
        } else {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = config.defaultFileName
          a.click()
          URL.revokeObjectURL(a.href)
        }
        onClose()
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.warn('[SharePanel] export failed', err)
        onToast?.('保存失败：' + (err instanceof Error ? err.message : String(err)), 'error')
      }
    })
  }

  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ padding: '4px 8px 8px', fontSize: 'var(--font-xs)', color: 'var(--text-dim)', fontWeight: 600 }}>
        导出方式
      </div>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleCopy() }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {loading ? '加载中...' : '复制到剪贴板'}
      </MenuButton>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleExport('markdown') }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
        Markdown 文件
      </MenuButton>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleExport('html') }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="10" y1="9" x2="8" y2="9" />
          <line x1="16" y1="13" x2="8" y2="13" />
        </svg>
        HTML 文件
      </MenuButton>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleExport('txt') }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
        </svg>
        TXT 文件
      </MenuButton>
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 6px' }} />
      <MenuButton onClick={(e) => { e.stopPropagation(); onClose() }} style={{ color: 'var(--text-dim)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        返回
      </MenuButton>
    </div>
  )
}

function MenuButton({ onClick, style, disabled, children }: { onClick: (e: React.MouseEvent) => void; style?: React.CSSProperties; disabled?: boolean; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...menuItemStyle,
        ...style,
        background: hovered && !disabled ? 'var(--bg-hover)' : 'none',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  width: '100%', padding: '6px 8px',
  background: 'none', border: 'none', borderRadius: 'var(--radius-xs)',
  color: 'var(--text)', cursor: 'pointer',
  fontSize: 'var(--font-sm)', textAlign: 'left' as const,
  fontFamily: 'inherit', fontWeight: 400,
  transition: 'background 0.08s',
}

function getAvatarInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

function nameToHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash % 360)
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = getAvatarInitial(name)
  const hasName = name.trim().length > 0
  const hue = hasName ? nameToHue(name) : 215
  const bg = hasName ? `hsl(${hue} 65% 45%)` : 'var(--text-muted)'
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

function UserProfileBar({
  profile,
  onProfileChange,
  menuOpen,
  onMenuOpenChange,
  editing,
  onEditingChange,
}: {
  profile: UserProfile
  onProfileChange: (p: UserProfile) => void
  menuOpen: boolean
  onMenuOpenChange: (v: boolean) => void
  editing: boolean
  onEditingChange: (v: boolean) => void
}) {
  const isLoggedIn = profile.name.trim().length > 0
  const displayName = isLoggedIn ? profile.name.slice(0, MAX_USERNAME_LEN) : '点击登录'
  const statusText = isLoggedIn ? '已登录' : '未登录'
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) {
        onMenuOpenChange(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen, onMenuOpenChange])

  return (
    <>
      <div
        onClick={() => {
          if (isLoggedIn) {
            onMenuOpenChange(!menuOpen)
          } else {
            onEditingChange(true)
          }
        }}
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <Avatar name={profile.name} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </div>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 1 }}>{statusText}</div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--text-muted)', flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </div>

      {menuOpen && isLoggedIn && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            bottom: 58,
            left: 8,
            width: 244,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            zIndex: 'var(--z-dropdown)',
          }}
        >
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
            <Avatar name={profile.name} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.name.slice(0, MAX_USERNAME_LEN)}
              </div>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.email || '无邮箱'}
              </div>
            </div>
          </div>
          <div style={{ padding: '6px 0' }}>
            <button
              onClick={() => { onMenuOpenChange(false); onEditingChange(true) }}
              style={menuItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              个人资料
            </button>
            <button
              onClick={() => { onMenuOpenChange(false) }}
              style={menuItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.68 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              设置
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
            <button
              onClick={() => { onMenuOpenChange(false); onProfileChange({ name: '', email: '' }) }}
              style={{ ...menuItemStyle, color: '#ef4444' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              退出登录
            </button>
          </div>
        </div>
      )}

      {editing && (
        <UserProfileEditDialog
          profile={profile}
          onSave={(p) => { onProfileChange(p); onEditingChange(false); onMenuOpenChange(false) }}
          onCancel={() => onEditingChange(false)}
        />
      )}
    </>
  )
}

function UserProfileEditDialog({
  profile,
  onSave,
  onCancel,
}: {
  profile: UserProfile
  onSave: (p: UserProfile) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(profile.name.slice(0, MAX_USERNAME_LEN))
  const [email, setEmail] = useState(profile.email)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (dialogRef.current && !dialogRef.current.contains(target)) onCancel()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onCancel])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)',
      }}
    >
      <div
        ref={dialogRef}
        style={{
          width: 320,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ fontSize: 'var(--font-md)', fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>{profile.name ? '编辑个人资料' : '登录'}</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>用户名（最多 {MAX_USERNAME_LEN} 字）</div>
          <input
            type="text"
            value={name}
            maxLength={MAX_USERNAME_LEN}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入用户名"
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 'var(--font-sm)',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>邮箱</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="可选"
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 'var(--font-sm)',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--font-sm)',
              cursor: 'pointer',
            }}
          >取消</button>
          <button
            onClick={() => {
              const trimmed = name.trim()
              if (!trimmed) return
              onSave({ name: trimmed.slice(0, MAX_USERNAME_LEN), email: email.trim() })
            }}
            disabled={!name.trim()}
            style={{
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 'var(--font-sm)',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.5,
            }}
          >保存</button>
        </div>
      </div>
    </div>
  )
}
