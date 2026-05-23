export type PumpPortalPool =
  | 'pump'
  | 'raydium'
  | 'pump-amm'
  | 'launchlab'
  | 'raydium-cpmm'
  | 'bonk'
  | 'auto'

export type TokenDataState = 'raw' | 'enriching' | 'active' | 'invalid'

export type SignalState =
  | 'RAW_SIGNAL'
  | 'ACCUMULATION_SIGNAL'
  | 'MOMENTUM_SIGNAL'
  | 'DISTRIBUTION_SIGNAL'
  | 'INVALID_SIGNAL'

export type PumpDetectionLabel =
  | 'EARLY_BREAKOUT'
  | 'ACCUMULATION_PHASE'
  | 'FAKEOUT_RISK'
  | 'NO_SIGNAL'

export type SmartMoneyFlow = 'SMART_MONEY_IN' | 'SMART_MONEY_EXIT' | 'NEUTRAL'

export type SubscriptionTier = 'free' | 'pro'

export type TokenLifecycleState =
  | 'NEW'
  | 'DISCOVERING'
  | 'MOMENTUM'
  | 'BREAKOUT'
  | 'MIGRATION_WATCH'
  | 'MIGRATED'
  | 'DEAD'
  | 'RUGGED'

export interface PumpToken {
  mint: string
  name: string
  symbol: string
  image: string
  metadataUri?: string
  twitter?: string
  telegram?: string
  website?: string
  marketCap: number
  bondingCurvePercent: number
  holders: number
  /** On-chain holder snapshot applied (Helius / Bubblemaps) */
  holdersVerified?: boolean
  volume24h: number
  /** Rule-based entry quality (lower = better snipe) */
  signalScore?: number
  aiRiskScore?: number
  momentumScore: number
  whaleActivity: 'low' | 'medium' | 'high'
  launchedAt: string
  priceUsd: number
  priceChange24h: number
  liquidity: number
  lastTradeAt?: number
  trades1m?: number
  volume5mSol?: number
  buyPressure1m?: number
  mcapChange5m?: number
  isActive?: boolean
  isWatchlisted?: boolean
  /** Stream registry intelligence */
  lifecycle?: TokenLifecycleState
  migrationProbability?: number
  burstIgnition?: number
  updatedAt?: number
  tradeCount?: number
  top1Pct?: number
  top5Pct?: number
  coordinationPenalty?: number
  /** Pipeline readiness — raw/enriching still visible in scanner */
  dataState?: TokenDataState
  signalState?: SignalState
  /** Unified intelligence score 0–100 */
  score?: number
  confidenceScore?: number
  dataCompletenessScore?: number
  smartMoneyScore?: number
  smartMoneyFlow?: SmartMoneyFlow
  pumpProbabilityScore?: number
  pumpSignal?: PumpDetectionLabel
  scoreVelocity?: number
  subscriptionTier?: SubscriptionTier
}

export interface AutoTradeRules {
  enabled: boolean
  buyAmountSol: number
  slippage: number
  priorityFee: number
  pool: PumpPortalPool
  snipeNewTokens: boolean
  minBondingCurve: number
  maxBondingCurve: number
  maxMarketCapUsd: number
  maxSignalScore: number
  autoSellTakeProfitPct: number
  autoSellStopLossPct: number
}

export interface AutoTradeSignal {
  mint: string
  symbol?: string
  name?: string
  reason: string
  bondingCurvePercent: number
  marketCap: number
  signalScore: number
  evScore?: number
  positionSizeSol?: number
  timestamp: string
}

export interface TradeExecution {
  id: string
  mint: string
  side: 'buy' | 'sell'
  amountSol: number
  signature?: string
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: string
  error?: string
}

export interface SmartWallet {
  address: string
  label: string
  pnl24h: number
  pnl7d: number
  roi30d: number
  winRate: number
  recentBuys: number
  recentSells: number
  followers: number
  tier: 'elite' | 'pro' | 'rising'
}

export interface Alert {
  id: string
  type: 'price' | 'whale' | 'trade' | 'wallet' | 'token'
  title: string
  message: string
  triggeredAt: string
  read: boolean
}

export type IntelligenceAlertType =
  | 'pump_probability'
  | 'smart_money_in'
  | 'volume_spike'
  | 'migration'

export interface IntelligenceAlert {
  type: IntelligenceAlertType
  mint: string
  score: number
  pumpProbabilityScore: number
  smartMoneyFlow: SmartMoneyFlow
  pumpSignal: PumpDetectionLabel
  at: number
}

export interface PortfolioPosition {
  mint: string
  symbol: string
  name: string
  image: string
  amount: number
  avgEntry: number
  currentPrice: number
  pnl: number
  pnlPercent: number
}

export interface AutoStrategy {
  id: string
  name: string
  description: string
  status: 'active' | 'paused'
  rules?: Partial<AutoTradeRules>
  pnl: number
  trades: number
  winRate: number
}
