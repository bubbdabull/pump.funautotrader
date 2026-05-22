export interface ChartPoint {
  t: number
  price: number
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
}

export interface TokenChartSeries {
  mint: string
  intervalMs: number
  candles: OhlcvCandle[]
  points: ChartPoint[]
  tradeCount: number
  lastTradeAt?: number
  tradeStreamSubscribed?: boolean
  pumpportalKeyConfigured?: boolean
}

export const CHART_INTERVAL_OPTIONS = [
  { label: '1s', ms: 1_000 },
  { label: '5s', ms: 5_000 },
  { label: '15s', ms: 15_000 },
  { label: '1m', ms: 60_000 },
] as const
