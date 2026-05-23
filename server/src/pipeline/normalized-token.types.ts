import type { FeedToken } from '../feed/feed.types'
import type { TokenLifecycleState } from '@phronis/trading'

/** UI + API shape — always derived from in-memory registry (stream-first). */
export interface NormalizedToken extends FeedToken {
  updatedAt: number
  tradeCount: number
  /** Primary data source for this row */
  source: 'stream' | 'rest' | 'merged'
  /** Rolling dynamics lifecycle (not stored in registry core). */
  lifecycle?: TokenLifecycleState
  migrationProbability?: number
  burstIgnition?: number
}

export interface RegistrySnapshot {
  lane: string
  tokens: NormalizedToken[]
  updatedAt: string
  streamFirst: true
}
