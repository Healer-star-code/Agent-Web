import type { SessionInfo } from '../mockData'

export function upsertSession(sessions: SessionInfo[], incoming: SessionInfo): SessionInfo[] {
  const existing = sessions.find((session) => session.id === incoming.id)
  const merged: SessionInfo = {
    ...existing,
    ...incoming,
    firstMessage: incoming.firstMessage || existing?.firstMessage || '',
    name: incoming.name || existing?.name,
  }
  const next = [merged, ...sessions.filter((session) => session.id !== incoming.id)]
  return next.sort((a, b) => b.modified.localeCompare(a.modified))
}
