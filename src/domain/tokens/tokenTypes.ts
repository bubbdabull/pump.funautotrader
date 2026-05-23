import type { PumpToken } from '@/types'

export type TokenDisplayStatus = 'LIVE' | 'EARLY' | 'INVALID'

export type StreamDisplayMode = 'LIVE_STREAM' | 'ANALYTICS_VIEW' | 'OFFLINE_MODE'

export type ConnectionStatus = 'CONNECTED' | 'DEGRADED' | 'OFFLINE'

/** Normalized token for UI — always renderable even with sparse backend fields */
export interface StreamToken extends PumpToken {
  displayStatus: TokenDisplayStatus
  ageMs: number
  /** Live price from tick or derived from mcap */
  livePriceUsd: number
  volumeSol5m: number
  intelScore: number
}

export function isInvalidStreamToken(t: StreamToken): boolean {
  return (
    t.displayStatus === 'INVALID' ||
    t.signalState === 'INVALID_SIGNAL' ||
    t.dataState === 'invalid'
  )
}
