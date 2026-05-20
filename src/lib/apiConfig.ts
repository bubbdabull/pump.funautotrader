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

/** Baked in at Vercel build time — redeploy after changing env vars. */
export const API_BASE = normalizeEnvUrl(import.meta.env.VITE_API_URL, '/api')
export const WS_URL = normalizeEnvUrl(import.meta.env.VITE_WS_URL, '')

export function backendLabel(): string {
  if (!API_BASE || API_BASE === '/api') return 'local proxy'
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
