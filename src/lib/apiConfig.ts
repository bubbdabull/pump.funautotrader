/** Strip common copy-paste mistakes from Vercel env (e.g. `VITE_API_URL=https://...`). */
function normalizeEnvUrl(raw: string | undefined, fallback: string): string {
  let v = raw?.trim() ?? ''
  if (!v) return fallback
  const eq = v.indexOf('=')
  if (v.startsWith('VITE_') && eq > 0) {
    v = v.slice(eq + 1).trim()
  }
  return v.replace(/^['"]|['"]$/g, '')
}

/** Deployed Nest API on Fly — use directly from browser (CORS enabled). */
export const FLY_API_ORIGIN = 'https://pump-funautotrader.fly.dev'
export const FLY_API_BASE = `${FLY_API_ORIGIN}/api`

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return true
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

const envApi = normalizeEnvUrl(import.meta.env.VITE_API_URL, '/api')
const envWs = normalizeEnvUrl(import.meta.env.VITE_WS_URL, '')

/**
 * Vercel cannot proxy Socket.IO to Fly — WS must hit Fly directly.
 * HTTP also uses Fly in production (Vercel /api rewrites are unreliable).
 */
export const API_BASE = isLocalDevHost() ? envApi || '/api' : FLY_API_BASE
export const WS_URL = isLocalDevHost()
  ? envWs || (typeof window !== 'undefined' ? window.location.origin : '')
  : FLY_API_ORIGIN

export function backendLabel(): string {
  if (isLocalDevHost()) {
    if (!API_BASE || API_BASE === '/api') return 'local proxy'
    try {
      return new URL(API_BASE).host
    } catch {
      return API_BASE.slice(0, 40)
    }
  }
  return 'pump-funautotrader.fly.dev'
}

export function apiConfigMisconfigured(): boolean {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? ''
  return raw.startsWith('VITE_') && raw.includes('=')
}
