import type { TokenMarketState } from '../types'
import {
  evaluateEntry,
  evScoreToSignalScore,
  momentumScoreFromMetrics,
} from '../decision/evEngine'

/** Score tokens from REST/aggregate fields when no live stream state exists yet. */
export function scoreFromStaticFields(fields: {
  mint: string
  bondingCurvePercent: number
  marketCap: number
  volume24h: number
  holders: number
  symbol?: string
  name?: string
}): { signalScore: number; momentumScore: number; metrics: ReturnType<typeof evaluateEntry>['metrics'] } {
  const now = Date.now()
  const vSol = (fields.bondingCurvePercent / 100) * 85

  const syntheticTrades = []
  const n = Math.min(8, Math.max(2, Math.floor(fields.holders / 50)))
  for (let i = 0; i < n; i++) {
    syntheticTrades.push({
      signature: `syn-${i}`,
      wallet: `syn-w-${i}`,
      side: 'buy' as const,
      solAmount: fields.volume24h / n / 200,
      tokenAmount: 1,
      timestamp: now - (n - i) * 2000,
    })
  }

  const state: TokenMarketState = {
    mint: fields.mint,
    symbol: fields.symbol,
    name: fields.name,
    createdAt: now - 60_000,
    bondingCurvePercent: fields.bondingCurvePercent,
    marketCapUsd: fields.marketCap,
    liquidity: vSol,
    liquidityHistory: [
      { virtualSolReserves: vSol * 0.9, virtualTokenReserves: 1, marketCapSol: fields.marketCap / 200, timestamp: now - 30000 },
      { virtualSolReserves: vSol, virtualTokenReserves: 1, marketCapSol: fields.marketCap / 200, timestamp: now },
    ],
    trades: syntheticTrades,
    walletBalances: new Map(syntheticTrades.map((_, i) => [`w${i}`, 1])),
    walletBuySol: new Map(syntheticTrades.map((t) => [t.wallet, t.solAmount])),
    lastUpdated: now,
  }

  const metrics = evaluateEntry(state).metrics
  return {
    signalScore: evScoreToSignalScore(metrics),
    momentumScore: momentumScoreFromMetrics(metrics),
    metrics,
  }
}
