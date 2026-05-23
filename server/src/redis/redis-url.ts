/**
 * Normalize REDIS_URL for ioredis. Fly secrets sometimes get a full redis-cli
 * command pasted instead of the URL alone.
 */
export function normalizeRedisUrl(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  if (/^rediss?:\/\//i.test(trimmed)) {
    return upgradeUpstashToTls(trimmed)
  }

  const embedded = trimmed.match(/(rediss?:\/\/[^\s'"]+)/i)
  if (embedded?.[1]) {
    return upgradeUpstashToTls(embedded[1])
  }

  return null
}

function upgradeUpstashToTls(url: string): string {
  if (url.startsWith('redis://') && /upstash\.io/i.test(url)) {
    return `rediss://${url.slice('redis://'.length)}`
  }
  return url
}

export function redisTlsOptions(url: string): Record<string, unknown> | undefined {
  return url.startsWith('rediss://') ? {} : undefined
}
