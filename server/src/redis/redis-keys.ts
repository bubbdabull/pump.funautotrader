/** Canonical Upstash keys (secondary layer — not hot path). */
export const REDIS_KEYS = {
  snapshot: {
    registry: 'snapshot:registry',
    marketDynamics: 'snapshot:marketDynamics',
    activeTokens: 'snapshot:activeTokens',
    walletClusters: 'snapshot:walletClusters',
  },
  leaderboard: {
    score: 'top:tokens:score',
    volume: 'top:tokens:volume',
    migration: 'top:tokens:migration',
    velocity: 'top:tokens:velocity',
  },
  /** Legacy keys — read on recovery if canonical missing. */
  legacy: {
    registrySnapshot: 'phronis:snapshot:registry:v1',
    dynamicsSnapshot: 'phronis:snapshot:dynamics:v1',
    rankingCache: 'phronis:cache:rankings:v1',
  },
  ingestionChannel: 'phronis:ingestion',
  ingestionLeader: 'phronis:ingestion:leader',
  streamEpoch: 'phronis:stream:epoch',
  persistChannel: 'phronis:persist:jobs',
  hotToken: (mint: string) => `token:hot:${mint}`,
  tokenWindow: (mint: string, suffix: 'volume:5s' | 'volume:15s' | 'wallets:15s' | 'trades:5s') =>
    `token:${mint}:${suffix}`,
} as const

export type LeaderboardLane = keyof typeof REDIS_KEYS.leaderboard
export type TokenWindowSuffix = 'volume:5s' | 'volume:15s' | 'wallets:15s' | 'trades:5s'
