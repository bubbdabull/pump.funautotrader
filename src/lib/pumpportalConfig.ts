/**
 * PumpPortal data API — https://pumpportal.fun/data-api/real-time
 * Use ONE websocket per process. The server relays to the UI via Socket.IO by default.
 */
export const PUMPPORTAL_WS_BASE =
  import.meta.env.VITE_PUMPPORTAL_WS || 'wss://pumpportal.fun/api/data'

/** When true, the browser opens its own PumpPortal WS (only for frontend-only dev). */
export function useDirectPumpPortalWs(): boolean {
  return import.meta.env.VITE_PUMPPORTAL_DIRECT === 'true'
}

export function pumpPortalWsUrl(): string {
  const key = import.meta.env.VITE_PUMPPORTAL_API_KEY
  if (!key) return PUMPPORTAL_WS_BASE
  const sep = PUMPPORTAL_WS_BASE.includes('?') ? '&' : '?'
  return `${PUMPPORTAL_WS_BASE}${sep}api-key=${encodeURIComponent(key)}`
}
