import { motion, type Variants } from 'framer-motion'
import { BookOpen, Code, PencilSimple, Sparkle, Translate } from '@phosphor-icons/react'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { XiaojinLogo } from './XiaojinLogo'
import type { LocalAttachment } from '../mockData'

const TYPEWRITER_PHRASES = [
  '准备好了吗？',
  '有什么想问的？',
  '一起来做点酷的事。',
  '探索你的代码库。',
  '起草一份教案。',
  '总结这篇论文。',
  '规划你的课程。',
  '用简单的话解释一下。',
  '和我结对编程。',
  '修复那个烦人的 bug。',
  '翻译成中文。',
  '写一首俳句。',
  '头脑风暴一下。',
  '帮我审查代码。',
  '发布上线！',
  '让它更好看。',
  '和我一起理清思路。',
]

const QUICK_ACTIONS = [
  {
    icon: BookOpen,
    title: '起草教案',
    description: '输入年级和科目，快速生成教案框架',
    prompt: '帮我起草一份小学三年级数学教案，包含教学目标、重难点和课堂活动',
  },
  {
    icon: PencilSimple,
    title: '批改作文',
    description: '粘贴学生作文，自动批改并给出建议',
    prompt: '请帮我批改这篇作文，指出语法、用词和结构上的问题，并给出改进建议',
  },
  {
    icon: Code,
    title: '审查代码',
    description: '粘贴代码，找出潜在 bug 和优化点',
    prompt: '请帮我审查这段代码，找出潜在的 bug、性能问题和可优化的地方',
  },
  {
    icon: Translate,
    title: '翻译文本',
    description: '中英文互译，保持专业术语准确',
    prompt: '请把这段英文翻译成中文，保持专业术语准确，语言通顺自然',
  },
]

const container: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
}

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 20 },
  },
}

interface Props {
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onSend: (message: string, attachments?: LocalAttachment[]) => void
  institution?: string
}

export function WelcomeScreen({ chatInputRef, onSend, institution }: Props) {
  return (
    <div
      className="relative min-h-full w-full flex flex-col items-center justify-center px-6 py-12 overflow-hidden bg-app-bg"
      style={{ display: 'flex', minHeight: '100%' }}
    >
      {/* Soft radial gradient background */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 18%, color-mix(in srgb, var(--accent) 8%, transparent), transparent)',
        }}
      />

      {/* Subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.025]"
        style={{
          backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <motion.div
        className="relative z-10 w-full max-w-3xl flex flex-col items-center text-center"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Logo with glow and rotating ring */}
        <motion.div variants={item} className="relative mb-6">
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full blur-3xl opacity-60"
            style={{
              background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent), transparent 70%)',
            }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-dashed border-accent/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="relative z-10"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <XiaojinLogo size={64} />
          </motion.div>
        </motion.div>

        {/* Gradient title */}
        <motion.h1
          variants={item}
          className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-4 bg-gradient-to-br from-text via-accent to-text-muted bg-clip-text text-transparent"
        >
          超级小金
        </motion.h1>

        {/* Description */}
        <motion.p
          variants={item}
          className="text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl mb-2"
        >
          备课、批改、教案、代码审查、文档处理——把重复工作交给 AI，把时间留给学生和自己。
        </motion.p>

        {/* Typewriter with icon */}
        <motion.div variants={item} className="h-8 flex items-center justify-center text-text-muted mb-10">
          <Sparkle weight="fill" size={16} className="text-accent mr-2" />
          <Typewriter phrases={TYPEWRITER_PHRASES} />
        </motion.div>

        {/* Quick action cards (Bento grid) */}
        <motion.div variants={item} className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <motion.button
                key={action.title}
                type="button"
                onClick={() => chatInputRef.current?.insertText(action.prompt)}
                className="group text-left p-4 rounded-xl border border-app-border bg-app-panel hover:bg-app-hover hover:border-accent/30 transition-all duration-200"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent-bg flex items-center justify-center text-accent">
                    <Icon size={20} weight="fill" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-text text-sm mb-1 group-hover:text-accent transition-colors">
                      {action.title}
                    </div>
                    <div className="text-text-dim text-xs leading-relaxed">
                      {action.description}
                    </div>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </motion.div>

        {/* Input */}
        <motion.div variants={item} className="w-full max-w-2xl">
          <ChatInput ref={chatInputRef} placeholder="开始对话..." onSend={onSend} />
        </motion.div>

        {institution && (
          <motion.div variants={item} className="mt-6 text-xs text-text-dim font-mono">
            {institution}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
