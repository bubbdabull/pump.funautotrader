import type { FeedDisplayMode } from '@/lib/feedQuality'

export function displayModeLabel(mode: FeedDisplayMode | 'active' | 'low_confidence'): string {
  switch (mode) {
    case 'active':
      return 'live ranked feed'
    case 'tradeable':
      return 'high confidence'
    case 'low_confidence':
      return 'early signals'
    case 'watchlist_fallback':
      return 'reconnecting'
    default:
      return String(mode)
  }
}

/** True when the registry is empty because the stream is down, not because filters hid tokens. */
export function isStreamDisconnected(params: {
  wsConnected: boolean
  reconnecting: boolean
  registryUpdatedAt: number
  registrySize: number
}): boolean {
  if (params.registrySize > 0 && params.wsConnected && !params.reconnecting) return false
  if (!params.wsConnected || params.reconnecting) return true
  if (params.registryUpdatedAt <= 0) return true
  return Date.now() - params.registryUpdatedAt > 45_000
}
