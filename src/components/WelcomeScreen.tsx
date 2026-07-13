import { motion, type Variants } from 'framer-motion'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { XiaojinLogo } from './XiaojinLogo'
import { FileText, Code, BookOpen, Sparkle } from '@phosphor-icons/react'

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

const visualContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
}

const visualItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 120, damping: 18 },
  },
}

interface Props {
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onSend: () => void
  institution?: string
}

export function WelcomeScreen({ chatInputRef, onSend, institution }: Props) {
  return (
    <div
      className="min-h-full w-full flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16 px-6 py-10 lg:px-20 overflow-hidden bg-app-bg"
      style={{ display: 'flex', minHeight: '100%' }}
    >
      {/* Left: text + input */}
      <motion.div
        className="flex-1 w-full max-w-xl"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={item} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-bg text-accent text-xs font-semibold mb-5">
          <Sparkle weight="fill" size={12} />
          <span>为教师打造的智能工作流</span>
        </motion.div>

        <motion.h1
          variants={item}
          className="text-4xl md:text-6xl font-extrabold tracking-tighter leading-[0.95] text-text mb-5"
        >
          超级小金
        </motion.h1>

        <motion.p
          variants={item}
          className="text-base md:text-lg text-text-muted leading-relaxed max-w-[65ch] mb-6"
        >
          备课、批改、教案、代码审查、文档处理——把重复工作交给 AI，把时间留给学生和自己。
        </motion.p>

        <motion.div variants={item} className="h-7 flex items-center text-text-muted">
          <span className="text-accent mr-1">·</span>
          <Typewriter phrases={TYPEWRITER_PHRASES} />
        </motion.div>

        <motion.div variants={item} className="mt-8 max-w-xl">
          <ChatInput ref={chatInputRef} placeholder="开始对话..." onSend={onSend} />
        </motion.div>

        {institution && (
          <motion.div variants={item} className="mt-4 text-xs text-text-dim font-mono">
            {institution}
          </motion.div>
        )}
      </motion.div>

      {/* Right: brand visual */}
      <motion.div
        className="flex-1 w-full max-w-lg hidden lg:flex flex-col items-center justify-center"
        variants={visualContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="relative flex flex-col items-center w-full">
          {/* Glow */}
          <motion.div
            variants={visualItem}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-50 blur-3xl"
            style={{
              background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 25%, transparent), transparent 70%)',
            }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.65, 0.45] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Logo */}
          <motion.div
            variants={visualItem}
            className="relative z-10 mb-8"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <XiaojinLogo size={160} />
          </motion.div>

          {/* Feature cards */}
          <motion.div variants={visualItem} className="grid grid-cols-3 gap-3 w-full max-w-md">
            <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-app-panel border border-app-border/50 shadow-diffusion">
              <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent">
                <BookOpen weight="duotone" size={22} />
              </div>
              <div className="text-xs font-semibold text-text text-center">智能备课</div>
            </div>

            <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-app-panel border border-app-border/50 shadow-diffusion">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-senior-bg)] flex items-center justify-center text-[var(--accent-senior)]">
                <FileText weight="duotone" size={22} />
              </div>
              <div className="text-xs font-semibold text-text text-center">文档处理</div>
            </div>

            <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-app-panel border border-app-border/50 shadow-diffusion">
              <div className="w-10 h-10 rounded-xl bg-[var(--warning-bg)] flex items-center justify-center text-[var(--warning)]">
                <Code weight="duotone" size={22} />
              </div>
              <div className="text-xs font-semibold text-text text-center">代码审查</div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
