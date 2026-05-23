import type { FeedToken } from '../feed/feed.types'

/** UI + API shape — always derived from in-memory registry (stream-first). */
export interface NormalizedToken extends FeedToken {
  updatedAt: number
  tradeCount: number
  /** Primary data source for this row */
  source: 'stream' | 'rest' | 'merged'
}

export interface RegistrySnapshot {
  lane: string
  tokens: NormalizedToken[]
  updatedAt: string
  streamFirst: true
}
