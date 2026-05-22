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

export interface TokenChartSeries {
  mint: string
  intervalMs: number
  candles: OhlcvCandle[]
  points: ChartPoint[]
  tradeCount: number
  lastTradeAt?: number
  currentMcap?: number
  currentPriceUsd?: number
  currentCurve?: number
  changePct?: number
  tradeStreamSubscribed?: boolean
  pumpportalKeyConfigured?: boolean
}
