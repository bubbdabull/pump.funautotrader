/**
 * PumpPortal data API — https://pumpportal.fun/data-api/real-time
 * Production UI uses ONE Socket.IO connection to Fly (`realtimeGateway`).
 * Do not open a browser PumpPortal WS unless VITE_PUMPPORTAL_DIRECT/HYBRID (removed).
 */
export const PUMPPORTAL_WS_BASE =
  import.meta.env.VITE_PUMPPORTAL_WS || 'wss://pumpportal.fun/api/data'

/** When true, the browser opens its own PumpPortal WS (only for frontend-only dev). */
export function useDirectPumpPortalWs(): boolean {
  return import.meta.env.VITE_PUMPPORTAL_DIRECT === 'true'
}

/**
 * Browser opens PumpPortal for trade ticks on viewed mints; Fly still does scan + autotrader.
 * Requires VITE_PUMPPORTAL_API_KEY (single-user / private Vercel project).
 */
export function useHybridPumpPortalWs(): boolean {
  if (useDirectPumpPortalWs()) return true
  return (
    import.meta.env.VITE_PUMPPORTAL_HYBRID === 'true' &&
    Boolean(import.meta.env.VITE_PUMPPORTAL_API_KEY?.trim())
  )
}

export function useBrowserPumpPortalWs(): boolean {
  return useDirectPumpPortalWs() || useHybridPumpPortalWs()
}

export function pumpPortalWsUrl(): string {
  const key = import.meta.env.VITE_PUMPPORTAL_API_KEY
  if (!key) return PUMPPORTAL_WS_BASE
  const sep = PUMPPORTAL_WS_BASE.includes('?') ? '&' : '?'
  return `${PUMPPORTAL_WS_BASE}${sep}api-key=${encodeURIComponent(key)}`
}
