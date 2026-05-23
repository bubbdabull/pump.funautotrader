export type PhronisProcessRole = 'all' | 'api' | 'persist'

export function getProcessRole(): PhronisProcessRole {
  const raw = process.env.PHRONIS_PROCESS_ROLE?.trim().toLowerCase()
  if (raw === 'api' || raw === 'persist') return raw
  return 'all'
}

/**
 * On Fly, use the machine process group — not PHRONIS_PROCESS_ROLE secrets alone.
 * A global secret `PHRONIS_PROCESS_ROLE=persist` on app machines prevents binding :8080.
 */
export function resolveBootRole(): PhronisProcessRole {
  if (process.env.FLY_APP_NAME) {
    const group = process.env.FLY_PROCESS_GROUP?.trim().toLowerCase()
    if (group === 'persist') return 'persist'
    return 'api'
  }
  return getProcessRole()
}

export function isApiProcess(): boolean {
  const role = resolveBootRole()
  return role === 'all' || role === 'api'
}

export function isPersistProcess(): boolean {
  const role = resolveBootRole()
  return role === 'all' || role === 'persist'
}
