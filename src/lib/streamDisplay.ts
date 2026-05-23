import type { FeedDisplayMode } from '@/lib/feedQuality'

/** Show watchlist fallback banner only when stream is actually down or stale. */
export function shouldShowWatchlistFallback(params: {
  displayMode: FeedDisplayMode
  wsConnected: boolean
  reconnecting: boolean
  registryUpdatedAt: number
  registrySize: number
}): boolean {
  if (params.displayMode !== 'watchlist_fallback') return false
  if (params.registrySize === 0) return true
  if (!params.wsConnected || params.reconnecting) return true
  if (params.registryUpdatedAt <= 0) return true
  return Date.now() - params.registryUpdatedAt > 45_000
}

export function displayModeLabel(mode: FeedDisplayMode): string {
  switch (mode) {
    case 'active':
      return 'live stream'
    case 'tradeable':
      return 'tradeable'
    case 'low_confidence':
      return 'low confidence (early)'
    case 'watchlist_fallback':
      return 'watchlist'
    default:
      return mode
  }
}
