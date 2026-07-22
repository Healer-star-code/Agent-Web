import type { SessionInfo } from '../mockData'

const MAX_TITLE_LEN = 32

export function summarizeTitle(text: string): string {
  if (!text) return ''
  const cleaned = text.trim().replace(/\s+/g, ' ')
  // Prefer first sentence (ending with . ? ! 。 ？ ！), otherwise first line, otherwise truncated.
  const sentenceMatch = cleaned.match(/^.{1,200}[.?!。？！]/)
  if (sentenceMatch) {
    const sentence = sentenceMatch[0].trim()
    return sentence.length <= MAX_TITLE_LEN ? sentence : sentence.slice(0, MAX_TITLE_LEN) + '…'
  }
  const firstLine = cleaned.split('\n')[0].trim()
  if (firstLine.length <= MAX_TITLE_LEN) return firstLine
  return firstLine.slice(0, MAX_TITLE_LEN) + '…'
}

export function upsertSession(sessions: SessionInfo[], incoming: SessionInfo): SessionInfo[] {
  const existing = sessions.find((session) => session.id === incoming.id)
  const merged: SessionInfo = {
    ...existing,
    ...incoming,
    firstMessage: incoming.firstMessage ?? existing?.firstMessage ?? '',
    name: incoming.name ?? existing?.name,
  }
  const next = [merged, ...sessions.filter((session) => session.id !== incoming.id)]
  return next.sort((a, b) => b.modified.localeCompare(a.modified))
}
