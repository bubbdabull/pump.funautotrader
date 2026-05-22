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
  /** PumpPortal trade stream queued/active for this mint */
  tradeStreamSubscribed?: boolean
  /** API key present on server */
  pumpportalKeyConfigured?: boolean
}
