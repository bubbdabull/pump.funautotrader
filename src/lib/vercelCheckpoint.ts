/** Detect Vercel Security Checkpoint HTML/errors (Code 11). */
export function isVercelSecurityCheckpoint(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: unknown; status?: number } }
  const msg = String(e?.message ?? '')
  const data = e?.response?.data
  const body = typeof data === 'string' ? data : JSON.stringify(data ?? '')
  return (
    /failed to verify your browser/i.test(msg) ||
    /failed to verify your browser/i.test(body) ||
    /vercel security checkpoint/i.test(body) ||
    /code 11/i.test(msg) ||
    /code 11/i.test(body)
  )
}

export const VERCEL_CHECKPOINT_HINT =
  'Vercel blocked your browser (Code 11). Dashboard → Firewall → Bot Management → Disable Attack Mode. Or run npm run dev locally (see docs/VERCEL_CODE11.md).'
