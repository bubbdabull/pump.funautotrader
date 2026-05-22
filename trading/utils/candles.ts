/** OHLCV candles from live trade ticks + bonding-curve liquidity snapshots. */

import { bondingCurvePercentFromSol, marketCapUsdFromSol, normalizeVirtualSol } from './tokenMedia'

export interface TradeTickLike {
  timestamp: number
  solAmount: number
  side: 'buy' | 'sell'
  marketCapUsd?: number
}

export interface LiquiditySnapshotLike {
  timestamp: number
  marketCapSol: number
  virtualSolReserves?: number
  virtualTokenReserves?: number
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
  /** Bonding curve % at candle close */
  curve?: number
  /** Estimated USD price per token (mcap / 1B supply convention) */
  priceUsd?: number
}

export interface ChartPointLike {
  t: number
  price: number
  priceUsd: number
  volume: number
  curve: number
}

export const CHART_INTERVALS_MS = [1_000, 5_000, 15_000, 60_000] as const
export type ChartIntervalMs = (typeof CHART_INTERVALS_MS)[number]

const PUMP_SUPPLY_ESTIMATE = 1_000_000_000

export function mcapToPriceUsd(mcapUsd: number): number {
  if (!mcapUsd || mcapUsd <= 0) return 0
  return mcapUsd / PUMP_SUPPLY_ESTIMATE
}

export function mcapFromLiquiditySnapshot(h: LiquiditySnapshotLike): number {
  const mcSol = Number(h.marketCapSol ?? 0)
  if (mcSol > 0) return marketCapUsdFromSol(mcSol)
  const vSol = normalizeVirtualSol(Number(h.virtualSolReserves ?? 0))
  if (vSol > 0) return marketCapUsdFromSol(vSol)
  return 0
}

export function curveFromLiquiditySnapshot(h: LiquiditySnapshotLike): number {
  const vSol = normalizeVirtualSol(Number(h.virtualSolReserves ?? h.marketCapSol ?? 0))
  return bondingCurvePercentFromSol(vSol)
}

function snapshotAtOrBefore(
  hist: LiquiditySnapshotLike[],
  ts: number,
): LiquiditySnapshotLike | undefined {
  let best: LiquiditySnapshotLike | undefined
  for (const h of hist) {
    if (h.timestamp <= ts) best = h
    else break
  }
  return best
}

/** Assign market cap USD to each trade using history + buy/sell impact model. */
export function enrichTradesWithMcap(
  trades: TradeTickLike[],
  liquidityHistory: LiquiditySnapshotLike[],
  fallbackMcap: number,
): TradeTickLike[] {
  if (!trades.length) return []

  const hist = [...liquidityHistory].sort((a, b) => a.timestamp - b.timestamp)
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  let lastMcap =
    fallbackMcap > 0
      ? fallbackMcap
      : hist.length
        ? mcapFromLiquiditySnapshot(hist[hist.length - 1])
        : 0

  return sorted.map((tr) => {
    if (tr.marketCapUsd && tr.marketCapUsd > 0) {
      lastMcap = tr.marketCapUsd
      return tr
    }

    const snap = snapshotAtOrBefore(hist, tr.timestamp)
    if (snap) {
      const mc = mcapFromLiquiditySnapshot(snap)
      if (mc > 0) lastMcap = mc
    }

    if (lastMcap > 0 && tr.solAmount > 0) {
      const liqSol = Math.max(lastMcap / 200, 0.25)
      const impact = Math.min(0.12, tr.solAmount / liqSol)
      lastMcap =
        tr.side === 'buy'
          ? lastMcap * (1 + impact * 0.65)
          : lastMcap * (1 - impact * 0.55)
    }

    return { ...tr, marketCapUsd: lastMcap > 0 ? lastMcap : undefined }
  })
}

export function buildOhlcvFromTrades(
  trades: TradeTickLike[],
  intervalMs: number,
  fallbackMcap = 0,
  maxCandles = 240,
  liquidityHistory: LiquiditySnapshotLike[] = [],
): OhlcvCandle[] {
  const enriched = enrichTradesWithMcap(trades, liquidityHistory, fallbackMcap)
  if (!enriched.length && liquidityHistory.length) {
    return buildOhlcvFromLiquidityHistory(liquidityHistory, intervalMs, fallbackMcap, maxCandles)
  }
  if (!enriched.length) return []

  const hist = [...liquidityHistory].sort((a, b) => a.timestamp - b.timestamp)
  const sorted = enriched
  const buckets = new Map<number, OhlcvCandle>()

  for (const tr of sorted) {
    const mcap = tr.marketCapUsd && tr.marketCapUsd > 0 ? tr.marketCapUsd : fallbackMcap
    if (mcap <= 0 && tr.solAmount <= 0) continue

    const bucket = Math.floor(tr.timestamp / intervalMs) * intervalMs
    const snap = snapshotAtOrBefore(hist, tr.timestamp)
    const curve = snap ? curveFromLiquiditySnapshot(snap) : undefined

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
        curve,
        priceUsd: mcapToPriceUsd(mcap),
      }
      buckets.set(bucket, c)
    } else {
      if (mcap > 0) {
        c.high = Math.max(c.high, mcap)
        c.low = Math.min(c.low, mcap)
        c.close = mcap
        c.priceUsd = mcapToPriceUsd(mcap)
      }
      if (curve != null) c.curve = curve
    }
    c.volume += tr.solAmount
    if (tr.side === 'buy') c.buys += 1
    else c.sells += 1
  }

  const out = [...buckets.values()].sort((a, b) => a.t - b.t)
  return out.slice(-maxCandles)
}

/** Line/candle series from bonding-curve reserve updates when trades are sparse. */
export function buildOhlcvFromLiquidityHistory(
  liquidityHistory: LiquiditySnapshotLike[],
  intervalMs: number,
  fallbackMcap = 0,
  maxCandles = 240,
): OhlcvCandle[] {
  if (!liquidityHistory.length) return []

  const hist = [...liquidityHistory].sort((a, b) => a.timestamp - b.timestamp)
  const buckets = new Map<number, OhlcvCandle>()

  for (const h of hist) {
    const mcap = mcapFromLiquiditySnapshot(h) || fallbackMcap
    if (mcap <= 0) continue
    const bucket = Math.floor(h.timestamp / intervalMs) * intervalMs
    const curve = curveFromLiquiditySnapshot(h)
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
        curve,
        priceUsd: mcapToPriceUsd(mcap),
      }
      buckets.set(bucket, c)
    } else {
      c.high = Math.max(c.high, mcap)
      c.low = Math.min(c.low, mcap)
      c.close = mcap
      c.curve = curve
      c.priceUsd = mcapToPriceUsd(mcap)
    }
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t).slice(-maxCandles)
}

export function buildChartPointsFromCandles(
  candles: OhlcvCandle[],
  defaultCurve = 0,
): ChartPointLike[] {
  return candles.map((c) => ({
    t: c.t,
    price: c.close,
    priceUsd: c.priceUsd ?? mcapToPriceUsd(c.close),
    volume: c.volume,
    curve: c.curve ?? defaultCurve,
  }))
}

export function candleChangePct(candles: OhlcvCandle[]): number {
  if (candles.length < 2) return 0
  const first = candles[0].open
  const last = candles[candles.length - 1].close
  if (!first || first <= 0) return 0
  return ((last - first) / first) * 100
}
