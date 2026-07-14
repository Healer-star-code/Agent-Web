import { motion, type Variants } from 'framer-motion'
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

const container: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
}

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
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
      className="min-h-full w-full flex flex-col items-center justify-center px-6 py-12 overflow-hidden bg-app-bg"
      style={{ display: 'flex', minHeight: '100%' }}
    >
      <motion.div
        className="w-full max-w-2xl flex flex-col items-center text-center"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Logo with soft glow */}
        <motion.div
          variants={item}
          className="relative mb-8"
        >
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full blur-3xl opacity-50"
            style={{
              background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)',
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="relative z-10"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <XiaojinLogo size={72} />
          </motion.div>
        </motion.div>

        <motion.h1
          variants={item}
          className="text-4xl md:text-5xl font-bold tracking-tighter leading-tight text-text mb-4"
        >
          超级小金
        </motion.h1>

        <motion.p
          variants={item}
          className="text-base md:text-lg text-text-muted leading-relaxed max-w-xl mb-3"
        >
          备课、批改、教案、代码审查、文档处理——把重复工作交给 AI，把时间留给学生和自己。
        </motion.p>

        <motion.div variants={item} className="h-7 flex items-center justify-center text-text-muted mb-10">
          <span className="text-accent mr-1">·</span>
          <Typewriter phrases={TYPEWRITER_PHRASES} />
        </motion.div>

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
