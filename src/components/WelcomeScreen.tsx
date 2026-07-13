import { motion, type Variants } from 'framer-motion'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
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

const bentoContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.25 },
  },
}

const bentoItem: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
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
    <div className="min-h-full flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 px-6 py-12 lg:px-20 overflow-hidden bg-app-bg">
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
        className="hidden lg:flex flex-1 w-full max-w-lg items-center justify-center"
        variants={bentoContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="grid grid-cols-2 gap-4 w-full">
          <motion.div
            variants={bentoItem}
            className="col-span-2 p-6 rounded-[2.5rem] bg-app-panel border border-app-border/50 shadow-diffusion"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent">
                <BookOpen weight="duotone" size={22} />
              </div>
              <div className="text-sm font-semibold text-text">智能备课</div>
            </div>
            <div className="text-sm text-text-muted leading-relaxed">
              输入课程主题，自动生成教学目标、板书设计与课后作业。
            </div>
          </motion.div>

          <motion.div
            variants={bentoItem}
            className="p-5 rounded-[2rem] bg-app-panel border border-app-border/50 shadow-diffusion"
          >
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-senior-bg)] flex items-center justify-center text-[var(--accent-senior)] mb-3">
              <FileText weight="duotone" size={20} />
            </div>
            <div className="text-sm font-semibold text-text mb-1">文档处理</div>
            <div className="text-xs text-text-muted">Word / PDF / PPT 一键生成</div>
          </motion.div>

          <motion.div
            variants={bentoItem}
            className="p-5 rounded-[2rem] bg-app-panel border border-app-border/50 shadow-diffusion"
          >
            <div className="w-9 h-9 rounded-xl bg-[var(--warning-bg)] flex items-center justify-center text-[var(--warning)] mb-3">
              <Code weight="duotone" size={20} />
            </div>
            <div className="text-sm font-semibold text-text mb-1">代码审查</div>
            <div className="text-xs text-text-muted">读懂代码库，定位 bug</div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
