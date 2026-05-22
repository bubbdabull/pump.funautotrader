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

/** On Vercel production, always use same-origin /api + socket proxy (vercel.json → Fly). */
function isVercelProductionHost(): boolean {
  return (
    typeof window !== 'undefined' &&
    (/\.vercel\.app$/i.test(window.location.hostname) ||
      /\.vercel\.app$/i.test(window.location.host))
  )
}

const envApi = normalizeEnvUrl(import.meta.env.VITE_API_URL, '/api')
const envWs = normalizeEnvUrl(import.meta.env.VITE_WS_URL, '')

/** Runtime: Vercel host uses proxy; local dev uses env or /api fallback. */
export const API_BASE = isVercelProductionHost() ? '/api' : envApi
export const WS_URL = isVercelProductionHost() ? '' : envWs

export function backendLabel(): string {
  if (!API_BASE || API_BASE === '/api') {
    if (typeof window !== 'undefined' && /vercel\.app$/i.test(window.location.hostname)) {
      return 'Vercel → Fly proxy'
    }
    return 'local proxy'
  }
  try {
    return new URL(API_BASE).host
  } catch {
    return API_BASE.slice(0, 40)
  }
}

export function apiConfigMisconfigured(): boolean {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? ''
  return raw.startsWith('VITE_') && raw.includes('=')
}
