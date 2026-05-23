export type PhronisProcessRole = 'all' | 'api' | 'persist'

export function getProcessRole(): PhronisProcessRole {
  const raw = process.env.PHRONIS_PROCESS_ROLE?.trim().toLowerCase()
  if (raw === 'api' || raw === 'persist') return raw
  return 'all'
}

export function isApiProcess(): boolean {
  const role = getProcessRole()
  return role === 'all' || role === 'api'
}

export function isPersistProcess(): boolean {
  const role = getProcessRole()
  return role === 'all' || role === 'persist'
}
