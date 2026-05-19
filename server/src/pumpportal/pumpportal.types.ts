export type PumpPortalPool =
  | 'pump'
  | 'raydium'
  | 'pump-amm'
  | 'launchlab'
  | 'raydium-cpmm'
  | 'bonk'
  | 'auto'

export interface PumpPortalTradeRequest {
  publicKey: string
  action: 'buy' | 'sell'
  mint: string
  amount: number | string
  denominatedInSol: 'true' | 'false'
  slippage: number
  priorityFee: number
  pool?: PumpPortalPool
}

export interface PumpPortalNewTokenEvent {
  mint: string
  name?: string
  symbol?: string
  uri?: string
  bondingCurveKey?: string
  marketCapSol?: number
  vSolInBondingCurve?: number
  vTokensInBondingCurve?: number
  traderPublicKey?: string
  signature?: string
}

export interface PumpPortalTradeEvent {
  mint: string
  txType?: 'buy' | 'sell'
  tokenAmount?: number
  solAmount?: number
  traderPublicKey?: string
  signature?: string
}
