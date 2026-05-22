/** On-chain / Bubblemaps holder snapshot (cached per mint). */
export interface OnChainHolderSnapshot {
  holders: number
  top1Pct: number
  top5Pct: number
  entropy: number
  /** Wallets flagged as clustered (Bubblemaps) or top-holder linked */
  suspiciousClusterPct?: number
  source: 'helius' | 'bubblemaps' | 'stream' | 'merged'
  updatedAt: number
}
