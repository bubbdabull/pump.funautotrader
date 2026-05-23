import {
  applyTradeToOhlcvSeries,
  buildChartPointsFromCandles,
  candleChangePct,
  mcapToPriceUsd,
  type TradeTickLike,
} from '@trading'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import type {
  ChartUpdatePayload,
  OhlcvCandle,
  ProgressionPoint,
  TokenChartSeries,
} from '@/lib/chartTypes'

const MAX_CANDLES = 300
const MAX_PROGRESSION = 120

export function isChartUpdatePayload(payload: unknown): payload is ChartUpdatePayload {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    (payload as ChartUpdatePayload).v === 2 &&
    typeof (payload as ChartUpdatePayload).mint === 'string'
  )
}

function mergeCandles(prev: OhlcvCandle[], delta: OhlcvCandle, closed?: OhlcvCandle): OhlcvCandle[] {
  let out = [...prev]
  if (closed) {
    const ci = out.findIndex((c) => c.t === closed.t)
    if (ci >= 0) out[ci] = closed
    else out.push(closed)
  }
  const idx = out.findIndex((c) => c.t === delta.t)
  if (idx >= 0) out[idx] = delta
  else out.push(delta)
  return out.sort((a, b) => a.t - b.t).slice(-MAX_CANDLES)
}

function seriesFromCandles(
  mint: string,
  intervalMs: number,
  candles: OhlcvCandle[],
  meta: Partial<TokenChartSeries>,
  progression?: ProgressionPoint[],
): TokenChartSeries {
  const fallbackCurve = meta.currentCurve ?? candles[candles.length - 1]?.curve ?? 0
  const points = buildChartPointsFromCandles(candles, fallbackCurve).map((p: { t: number; price: number; priceUsd: number; volume: number; curve: number }) => ({
    t: p.t,
    price: p.price,
    priceUsd: p.priceUsd,
    volume: p.volume,
    curve: p.curve,
  }))
  const last = candles[candles.length - 1]
  const currentMcap = meta.currentMcap ?? last?.close ?? 0
  return {
    mint,
    intervalMs,
    candles,
    points,
    progression: progression?.slice(-MAX_PROGRESSION),
    tradeCount: meta.tradeCount ?? 0,
    lastTradeAt: meta.lastTradeAt,
    currentMcap,
    currentPriceUsd: meta.currentPriceUsd ?? mcapToPriceUsd(currentMcap),
    currentCurve: meta.currentCurve ?? last?.curve ?? fallbackCurve,
    changePct: meta.changePct ?? candleChangePct(candles),
    tradeStreamSubscribed: meta.tradeStreamSubscribed,
    pumpportalKeyConfigured: meta.pumpportalKeyConfigured,
  }
}

/** Merge incremental chart:update (v2) into existing series for one timeframe. */
export function mergeChartUpdate(
  prev: TokenChartSeries | undefined,
  patch: ChartUpdatePayload,
  intervalMs: number,
): TokenChartSeries {
  const lane = patch.intervals[intervalMs]
  if (!lane?.candle) {
    return (
      prev ??
      seriesFromCandles(patch.mint, intervalMs, [], {
        currentMcap: patch.currentMcap,
        currentPriceUsd: patch.currentPriceUsd,
        currentCurve: patch.currentCurve,
        changePct: patch.changePct,
        tradeCount: patch.tradeCount,
        lastTradeAt: patch.lastTradeAt,
      })
    )
  }

  const candles = mergeCandles(prev?.candles ?? [], lane.candle, lane.closed)
  let progression = prev?.progression ?? []
  if (patch.progressionPoint) {
    const p = patch.progressionPoint
    const last = progression[progression.length - 1]
    if (last && last.t === p.t) progression = [...progression.slice(0, -1), p]
    else progression = [...progression, p]
    if (progression.length > MAX_PROGRESSION) progression = progression.slice(-MAX_PROGRESSION)
  }

  return seriesFromCandles(patch.mint, intervalMs, candles, {
    currentMcap: patch.currentMcap,
    currentPriceUsd: patch.currentPriceUsd,
    currentCurve: patch.currentCurve,
    changePct: patch.changePct,
    tradeCount: patch.tradeCount,
    lastTradeAt: patch.lastTradeAt,
    tradeStreamSubscribed: patch.tradeStreamSubscribed ?? prev?.tradeStreamSubscribed,
    pumpportalKeyConfigured:
      patch.pumpportalKeyConfigured ?? prev?.pumpportalKeyConfigured,
  }, progression)
}

/** Client-side candle tick between server chart:update frames. */
export function patchChartFromTradeTick(
  series: TokenChartSeries | undefined,
  tick: TradeTickPayload,
  intervalMs: number,
): TokenChartSeries | undefined {
  if (!tick.mint) return series
  const trade: TradeTickLike = {
    timestamp: tick.timestampMs,
    solAmount: tick.solAmount,
    side: tick.side,
    marketCapUsd: tick.marketCapUsd,
  }
  const result = applyTradeToOhlcvSeries(
    series?.candles ?? [],
    trade,
    intervalMs,
    MAX_CANDLES,
    [],
    tick.marketCapUsd ?? series?.currentMcap ?? 0,
  )
  if (!result) return series
  return seriesFromCandles(
    tick.mint,
    intervalMs,
    result.candles,
    {
      currentMcap: result.updated.close,
      currentPriceUsd: result.updated.priceUsd ?? mcapToPriceUsd(result.updated.close),
      currentCurve: result.updated.curve ?? series?.currentCurve,
      tradeCount: (series?.tradeCount ?? 0) + 1,
      lastTradeAt: tick.timestampMs,
      tradeStreamSubscribed: series?.tradeStreamSubscribed,
      pumpportalKeyConfigured: series?.pumpportalKeyConfigured,
    },
    series?.progression,
  )
}
