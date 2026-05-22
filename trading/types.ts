/** Microstructure snapshot for a single Pump.fun mint (event-sourced). */

export interface TradeTick {
  signature: string
  wallet: string
  side: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  timestamp: number
  slot?: number
}

export interface LiquiditySnapshot {
  virtualSolReserves: number
  virtualTokenReserves: number
  marketCapSol: number
  timestamp: number
}

export interface TokenMarketState {
  mint: string
  symbol?: string
  name?: string
  createdAt: number
  bondingCurvePercent: number
  marketCapUsd: number
  liquidity: number
  liquidityHistory: LiquiditySnapshot[]
  trades: TradeTick[]
  /** wallet -> net token delta (approx holdings) */
  walletBalances: Map<string, number>
  /** cumulative buy SOL per wallet */
  walletBuySol: Map<string, number>
  /** deployer / creator if known */
  deployerWallet?: string
  lastUpdated: number
  /** EV at entry for exit deterioration check */
  entryEvScore?: number
}

export interface IndexComponents {
  lsi: number
  mqi: number
  hdi: number
  sms: number
  sis: number
  rrm: number
}

export interface ProbabilisticMetrics {
  components: IndexComponents
  pWin: number
  avgWin: number
  avgLoss: number
  expectedValue: number
  evScore: number
  evScoreRaw: number
}

export interface EntryDecision {
  allowed: boolean
  blocked: boolean
  blockReasons: string[]
  metrics: ProbabilisticMetrics
  positionSizeSol: number
  positionSizePct: number
}

export interface ExitDecision {
  shouldExit: boolean
  exitScore: number
  reasons: string[]
  metrics: ProbabilisticMetrics
}

export interface PositionContext {
  mint: string
  entrySol: number
  entryEvScore: number
  entryTimestamp: number
  peakEvScore: number
}

export interface NewTokenEvent {
  mint: string
  symbol?: string
  name?: string
  vSolInBondingCurve?: number
  vTokensInBondingCurve?: number
  marketCapSol?: number
  uri?: string
  traderPublicKey?: string
}

export interface TradeStreamEvent {
  mint: string
  signature?: string
  txType?: 'buy' | 'sell'
  solAmount?: number
  tokenAmount?: number
  traderPublicKey?: string
  slot?: number
  vSolInBondingCurve?: number
  marketCapSol?: number
}

export type { QuantitativeScores } from './quantitative/scores'
export type { RugScoreBreakdown } from './rug/rugScoreEngine'
export type { StrategySignal, StrategyId } from './strategies/types'
