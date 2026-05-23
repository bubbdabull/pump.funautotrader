export interface ChartPoint {
  t: number
  /** Market cap USD */
  price: number
  /** Estimated USD per token */
  priceUsd: number
  volume: number
  curve: number
}

export interface OhlcvCandle {
  t: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  buys: number
  sells: number
  curve?: number
  priceUsd?: number
}

export interface ProgressionPoint {
  t: number
  mcap: number
  curve: number
  volume: number
  holders: number
  score: number
  momentum: number
  migrationProbability: number
  burstIgnition: number
  buyPressure: number
  volumeVelocity: number
  walletVelocity: number
}

export interface TokenChartSeries {
  mint: string
  intervalMs: number
  candles: OhlcvCandle[]
  points: ChartPoint[]
  progression?: ProgressionPoint[]
  tradeCount: number
  lastTradeAt?: number
  currentMcap?: number
  currentPriceUsd?: number
  currentCurve?: number
  changePct?: number
  tradeStreamSubscribed?: boolean
  pumpportalKeyConfigured?: boolean
}

export type ChartMetric = 'mcap' | 'price' | 'curve'

export const CHART_INTERVAL_OPTIONS = [
  { label: '1s', ms: 1_000 },
  { label: '5s', ms: 5_000 },
  { label: '15s', ms: 15_000 },
  { label: '1m', ms: 60_000 },
] as const

export const CHART_METRIC_OPTIONS: { id: ChartMetric; label: string; unit: string }[] = [
  { id: 'mcap', label: 'MCap', unit: 'USD' },
  { id: 'price', label: 'Price', unit: 'USD' },
  { id: 'curve', label: 'Curve', unit: '%' },
]
