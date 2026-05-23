import { Injectable, Logger } from '@nestjs/common'
import {
  CHART_INTERVALS_MS,
  CHART_STREAM_EMIT_MS,
  applyTradeToOhlcvSeries,
  buildChartPointsFromCandles,
  buildOhlcvFromTrades,
  candleChangePct,
  curveFromLiquiditySnapshot,
  mcapToPriceUsd,
  type TradeTickLike,
} from '@phronis/trading'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import type { ChartPoint, OhlcvCandle, TokenChartSeries } from '../tokens/chart.types'
import type { ProgressionPoint } from '../events/terminal-payloads'
import type { ChartIntervalDelta, ChartUpdatePayload } from './chart-update.types'

const MAX_CANDLES = 300

@Injectable()
export class ChartAggregationService {
  private readonly logger = new Logger(ChartAggregationService.name)
  /** mint → intervalMs → rolling candles */
  private readonly lanes = new Map<string, Map<number, OhlcvCandle[]>>()
  private readonly seq = new Map<string, number>()
  private readonly lastEmitMs = new Map<string, number>()

  constructor(private trading: TradingBridgeService) {}

  /** Throttle Socket.IO chart pushes — candles still update on every trade. */
  markEmittedIfDue(mint: string): boolean {
    const now = Date.now()
    const last = this.lastEmitMs.get(mint) ?? 0
    if (now - last < CHART_STREAM_EMIT_MS) return false
    this.lastEmitMs.set(mint, now)
    return true
  }

  /** Apply latest trade tick to all timeframe lanes (incremental). */
  onTrade(
    mint: string,
    options?: {
      progressionPoint?: ProgressionPoint
      buyPressure?: number
      volumeVelocity?: number
      priceVelocity?: number
    },
  ): ChartUpdatePayload | null {
    try {
      return this.onTradeUnsafe(mint, options)
    } catch (err) {
      this.logger.debug(`onTrade ${mint.slice(0, 8)}: ${(err as Error).message}`)
      return null
    }
  }

  private onTradeUnsafe(
    mint: string,
    options?: {
      progressionPoint?: ProgressionPoint
      buyPressure?: number
      volumeVelocity?: number
      priceVelocity?: number
    },
  ): ChartUpdatePayload | null {
    const state = this.trading.getState(mint)
    if (!state?.trades.length) return null

    const last = state.trades[state.trades.length - 1]!
    const trade: TradeTickLike = {
      timestamp: last.timestamp,
      solAmount: last.solAmount,
      side: last.side,
      marketCapUsd: last.marketCapUsd ?? state.marketCapUsd,
    }

    this.ensureLanes(mint)

    const laneMap = this.lanes.get(mint)!
    const intervals: Record<number, ChartIntervalDelta> = {}

    for (const intervalMs of CHART_INTERVALS_MS) {
      const prev = laneMap.get(intervalMs) ?? []
      const result = applyTradeToOhlcvSeries(
        prev,
        trade,
        intervalMs,
        MAX_CANDLES,
        state.liquidityHistory,
        state.marketCapUsd,
      )
      if (!result) continue
      laneMap.set(intervalMs, result.candles)
      intervals[intervalMs] = {
        candle: result.updated,
        closed: result.closed,
        isNewBucket: result.isNewBucket,
      }
    }

    if (Object.keys(intervals).length === 0) return null

    const primary = laneMap.get(5_000) ?? laneMap.get(1_000) ?? []
    const lastCandle = primary[primary.length - 1]
    const curve =
      lastCandle?.curve ??
      (state.liquidityHistory.length
        ? curveFromLiquiditySnapshot(state.liquidityHistory[state.liquidityHistory.length - 1]!)
        : state.bondingCurvePercent)

    const seq = (this.seq.get(mint) ?? 0) + 1
    this.seq.set(mint, seq)

    const currentMcap = lastCandle?.close ?? state.marketCapUsd
    return {
      v: 2,
      mint,
      seq,
      emittedAt: Date.now(),
      intervals,
      currentMcap,
      currentPriceUsd: mcapToPriceUsd(currentMcap),
      currentCurve: curve,
      changePct: candleChangePct(primary),
      tradeCount: state.trades.length,
      lastTradeAt: last.timestamp,
      buyPressure: options?.buyPressure,
      volumeVelocity: options?.volumeVelocity,
      priceVelocity: options?.priceVelocity,
      progressionPoint: options?.progressionPoint,
    }
  }

  getSeries(
    mint: string,
    intervalMs = 5_000,
    progression?: ProgressionPoint[],
  ): TokenChartSeries {
    this.ensureLanes(mint)
    const state = this.trading.getState(mint)
    const tokenFallbackMcap = state?.marketCapUsd ?? 0
    const bucketMs = Math.max(1_000, Math.min(60_000, intervalMs))

    const laneMap = this.lanes.get(mint)
    let candles =
      laneMap?.get(bucketMs) ??
      (state
        ? buildOhlcvFromTrades(
            state.trades,
            bucketMs,
            tokenFallbackMcap,
            MAX_CANDLES,
            state.liquidityHistory,
          )
        : [])

    if (laneMap && !laneMap.has(bucketMs)) {
      laneMap.set(bucketMs, candles)
    }

    const fallbackCurve = state?.bondingCurvePercent ?? 0
    const points: ChartPoint[] = buildChartPointsFromCandles(candles, fallbackCurve).map((p) => ({
      t: p.t,
      price: p.price,
      priceUsd: p.priceUsd,
      volume: p.volume,
      curve: p.curve,
    }))

    const lastCandle = candles[candles.length - 1]
    const lastTrade = state?.trades[state.trades.length - 1]

    return {
      mint,
      intervalMs: bucketMs,
      candles,
      points: points.slice(-MAX_CANDLES),
      progression: progression?.slice(-120),
      tradeCount: state?.trades.length ?? 0,
      lastTradeAt: lastTrade?.timestamp,
      currentMcap: lastCandle?.close ?? tokenFallbackMcap,
      currentPriceUsd: mcapToPriceUsd(lastCandle?.close ?? tokenFallbackMcap),
      currentCurve: lastCandle?.curve ?? fallbackCurve,
      changePct: candleChangePct(candles),
    }
  }

  private ensureLanes(mint: string) {
    if (this.lanes.has(mint) && (this.lanes.get(mint)?.size ?? 0) > 0) return

    const state = this.trading.getState(mint)
    if (!state?.trades.length) {
      this.lanes.set(mint, new Map())
      return
    }

    const map = new Map<number, OhlcvCandle[]>()
    for (const intervalMs of CHART_INTERVALS_MS) {
      map.set(
        intervalMs,
        buildOhlcvFromTrades(
          state.trades,
          intervalMs,
          state.marketCapUsd,
          MAX_CANDLES,
          state.liquidityHistory,
        ),
      )
    }
    this.lanes.set(mint, map)
  }
}
