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

/** Deployed Nest API on Fly (PumpPortal + live feed). */
export const FLY_API_ORIGIN = 'https://pump-funautotrader.fly.dev'
export const FLY_API_BASE = `${FLY_API_ORIGIN}/api`

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return true
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

/** Socket.IO client needs https:// origin — not wss:// and no /api suffix. */
function normalizeWsOrigin(raw: string, fallback: string): string {
  let v = normalizeEnvUrl(raw, fallback)
  if (!v) return fallback
  if (v.startsWith('wss://')) v = `https://${v.slice('wss://'.length)}`
  else if (v.startsWith('ws://')) v = `http://${v.slice('ws://'.length)}`
  v = v.replace(/\/api\/?$/i, '').replace(/\/$/, '')
  return v.startsWith('http') ? v : fallback
}

const envApiRaw = import.meta.env.VITE_API_URL?.trim() ?? ''
const envWsRaw = import.meta.env.VITE_WS_URL?.trim() ?? ''
const envApi = envApiRaw ? normalizeEnvUrl(envApiRaw, FLY_API_BASE) : ''
const envWs = envWsRaw ? normalizeWsOrigin(envWsRaw, FLY_API_ORIGIN) : ''

/** Prefer explicit VITE_* URLs when set; local dev uses Vite proxy (`/api` + same-origin WS). */
export const API_BASE = envApi.startsWith('http')
  ? envApi
  : isLocalDevHost()
    ? '/api'
    : FLY_API_BASE
export const WS_URL = envWsRaw
  ? envWs
  : isLocalDevHost()
    ? ''
    : FLY_API_ORIGIN

export function backendLabel(): string {
  try {
    if (API_BASE.startsWith('http')) return new URL(API_BASE).host
  } catch {
    /* fall through */
  }
  if (API_BASE === '/api') return 'vite proxy → Fly'
  return API_BASE.slice(0, 48)
}

export function apiConfigMisconfigured(): boolean {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? ''
  return raw.startsWith('VITE_') && raw.includes('=')
}
