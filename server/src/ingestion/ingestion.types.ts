export type IngestionSourceId = 'pumpportal' | 'pumpstream' | 'solana_rpc' | 'helius'

export type IngestionEventType =
  | 'token.launch'
  | 'token.trade'
  | 'token.migration'
  | 'token.liquidity'
  | 'wallet.activity'

export interface IngestionEvent {
  id: string
  source: IngestionSourceId
  type: IngestionEventType
  mint: string
  payload: Record<string, unknown>
  receivedAt: number
}
