/** OHLCV candles from live trade ticks (PumpPortal / ingestion). */

export interface TradeTickLike {
  timestamp: number
  solAmount: number
  side: 'buy' | 'sell'
  marketCapUsd?: number
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

export const CHART_INTERVALS_MS = [1_000, 5_000, 15_000, 60_000] as const
export type ChartIntervalMs = (typeof CHART_INTERVALS_MS)[number]

export function buildOhlcvFromTrades(
  trades: TradeTickLike[],
  intervalMs: number,
  fallbackMcap = 0,
  maxCandles = 240,
): OhlcvCandle[] {
  if (!trades.length) return []

  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  const buckets = new Map<number, OhlcvCandle>()

  for (const tr of sorted) {
    const mcap = tr.marketCapUsd && tr.marketCapUsd > 0 ? tr.marketCapUsd : fallbackMcap
    if (mcap <= 0 && tr.solAmount <= 0) continue

    const bucket = Math.floor(tr.timestamp / intervalMs) * intervalMs
    let c = buckets.get(bucket)
    if (!c) {
      c = {
        t: bucket,
        open: mcap,
        high: mcap,
        low: mcap,
        close: mcap,
        volume: 0,
        buys: 0,
        sells: 0,
      }
      buckets.set(bucket, c)
    } else {
      if (mcap > 0) {
        c.high = Math.max(c.high, mcap)
        c.low = Math.min(c.low, mcap)
        c.close = mcap
      }
    }
    c.volume += tr.solAmount
    if (tr.side === 'buy') c.buys += 1
    else c.sells += 1
  }

  const out = [...buckets.values()].sort((a, b) => a.t - b.t)
  return out.slice(-maxCandles)
}
