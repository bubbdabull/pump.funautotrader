/** Redis ingestion leader value: `instanceId@leaseExpiresAtMs` */

export function encodeIngestionLease(instanceId: string, ttlSec: number): string {
  const expiresAtMs = Date.now() + Math.max(1, ttlSec) * 1000
  return `${instanceId}@${expiresAtMs}`
}

export function parseIngestionLease(
  raw: string | null,
): { ownerId: string; expiresAtMs: number } | null {
  if (!raw?.trim()) return null
  const at = raw.indexOf('@')
  if (at < 0) return { ownerId: raw, expiresAtMs: 0 }
  const ownerId = raw.slice(0, at)
  const expiresAtMs = Number(raw.slice(at + 1))
  return {
    ownerId,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : 0,
  }
}
