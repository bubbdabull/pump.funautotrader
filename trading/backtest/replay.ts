import { globalMarketState } from '../market/stateManager'
import { evaluateAllStrategies } from '../strategies/engine'
import { computeBacktestMetrics, type BacktestTrade } from './metrics'
import type { NewTokenEvent, TradeStreamEvent } from '../types'

export interface ReplayEvent {
  type: 'new_token' | 'trade'
  at: number
  payload: NewTokenEvent | TradeStreamEvent
}

export interface ReplayOptions {
  latencyMs?: number
  slippagePct?: number
  holdMs?: number
  portfolioSol?: number
}

const DEFAULT_OPTS: Required<ReplayOptions> = {
  latencyMs: 80,
  slippagePct: 2,
  holdMs: 45_000,
  portfolioSol: 10,
}

/**
 * Deterministic replay: feed historical events in time order, simulate entries/exits.
 */
export function replayStrategyBacktest(
  events: ReplayEvent[],
  options: ReplayOptions = {},
): { trades: BacktestTrade[]; metrics: ReturnType<typeof computeBacktestMetrics> } {
  const opts = { ...DEFAULT_OPTS, ...options }
  const sorted = [...events].sort((a, b) => a.at - b.at)
  const simTrades: BacktestTrade[] = []
  const open = new Map<string, { entryMs: number; strategyId: string; entrySol: number }>()

  for (const ev of sorted) {
    if (ev.type === 'new_token') {
      globalMarketState.ingestNewToken(ev.payload as NewTokenEvent)
    } else {
      const trade = ev.payload as TradeStreamEvent
      globalMarketState.ingestTrade(trade)
      const state = globalMarketState.getState(trade.mint)
      if (!state) continue

      const signals = evaluateAllStrategies(state)
      const best = signals[0]

      if (!open.has(trade.mint) && best) {
        const slip = opts.slippagePct / 100
        const entrySol = 0.1 * (1 + slip)
        open.set(trade.mint, {
          entryMs: ev.at + opts.latencyMs,
          strategyId: best.strategyId,
          entrySol,
        })
      }

      const pos = open.get(trade.mint)
      if (pos && ev.at - pos.entryMs >= opts.holdMs) {
        const slip = opts.slippagePct / 100
        const exitSol = pos.entrySol * (0.95 - slip)
        const pnl = exitSol - pos.entrySol
        simTrades.push({
          mint: trade.mint,
          entryMs: pos.entryMs,
          exitMs: ev.at,
          pnlSol: pnl,
          strategyId: pos.strategyId,
        })
        open.delete(trade.mint)
        globalMarketState.clearPosition(trade.mint)
      }
    }
  }

  return { trades: simTrades, metrics: computeBacktestMetrics(simTrades) }
}
