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
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
}

const visualItem: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
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
    <div className="min-h-full flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 px-6 py-12 lg:px-20 overflow-hidden bg-app-bg">
      <motion.div
        className="flex-1 w-full max-w-2xl"
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

      <motion.div
        className="hidden lg:flex flex-1 w-full max-w-xl items-center justify-center"
        variants={visualContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="relative w-full max-w-md aspect-square flex items-center justify-center">
          {/* Background gradient blob */}
          <motion.div
            variants={visualItem}
            className="absolute inset-0 rounded-full opacity-60 blur-3xl"
            style={{
              background: 'radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%)',
            }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.7, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Rotating ring */}
          <motion.div
            className="absolute w-[78%] h-[78%] rounded-full border border-app-border/40"
            animate={{ rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent/60" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent/40" />
          </motion.div>

          <motion.div
            className="absolute w-[62%] h-[62%] rounded-full border border-dashed border-app-border/30"
            animate={{ rotate: -360 }}
            transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
          />

          {/* Floating logo */}
          <motion.div
            variants={visualItem}
            className="relative z-10"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <XiaojinLogo size={140} />
          </motion.div>

          {/* Floating capability cards */}
          <motion.div
            variants={visualItem}
            className="absolute top-8 right-0 p-3 rounded-2xl bg-app-panel/80 border border-app-border/50 shadow-diffusion backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-bg flex items-center justify-center text-accent">
                <BookOpen weight="duotone" size={18} />
              </div>
              <div className="text-xs font-medium text-text">智能备课</div>
            </div>
          </motion.div>

          <motion.div
            variants={visualItem}
            className="absolute bottom-16 left-0 p-3 rounded-2xl bg-app-panel/80 border border-app-border/50 shadow-diffusion backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-senior-bg)] flex items-center justify-center text-[var(--accent-senior)]">
                <FileText weight="duotone" size={18} />
              </div>
              <div className="text-xs font-medium text-text">文档处理</div>
            </div>
          </motion.div>

          <motion.div
            variants={visualItem}
            className="absolute bottom-4 right-8 p-3 rounded-2xl bg-app-panel/80 border border-app-border/50 shadow-diffusion backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--warning-bg)] flex items-center justify-center text-[var(--warning)]">
                <Code weight="duotone" size={18} />
              </div>
              <div className="text-xs font-medium text-text">代码审查</div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
