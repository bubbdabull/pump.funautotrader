/** Real-time trade tick from server (PumpPortal → ingestion → socket). */
export interface TradeTickPayload {
  mint: string
  signature: string
  wallet: string
  side: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  timestampMs: number
  slot?: number
  marketCapUsd?: number
  bondingCurvePercent?: number
  holders?: number
  holdersVerified?: boolean
}
