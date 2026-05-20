/** Baked in at Vercel build time — redeploy after changing env vars. */
export const API_BASE = import.meta.env.VITE_API_URL || '/api'
export const WS_URL = import.meta.env.VITE_WS_URL || ''

export function backendLabel(): string {
  if (!import.meta.env.VITE_API_URL) return 'same origin (/api)'
  try {
    return new URL(API_BASE).host
  } catch {
    return API_BASE
  }
}
