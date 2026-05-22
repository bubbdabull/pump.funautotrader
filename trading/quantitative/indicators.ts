import type { TokenMarketState, TradeTick } from '../types'
import { clamp, clamp01, ema } from '../utils/math'

/** VWAP = Σ(P_i × V_i) / Σ V_i — price proxy = sol/token per tick */
export function computeVwap(trades: TradeTick[]): number {
  let pv = 0
  let v = 0
  for (const t of trades) {
    const vol = t.solAmount
    if (vol <= 0) continue
    const price = t.tokenAmount > 0 ? t.solAmount / t.tokenAmount : 0
    if (price <= 0) continue
    pv += price * vol
    v += vol
  }
  return v > 0 ? pv / v : 0
}

/** EMA_t = P_t·k + EMA_{t-1}·(1-k), k = 2/(n+1) */
export function computeEmaLast(prices: number[], period = 12): number {
  if (prices.length === 0) return 0
  const alpha = 2 / (period + 1)
  const series = ema(prices, alpha)
  return series[series.length - 1] ?? prices[prices.length - 1]
}

export function volumeDelta(trades: TradeTick[], windowMs = 60_000, now = Date.now()): number {
  const cutoff = now - windowMs
  let buy = 0
  let sell = 0
  for (const t of trades) {
    if (t.timestamp < cutoff) continue
    if (t.side === 'buy') buy += t.solAmount
    else sell += t.solAmount
  }
  return buy - sell
}

/** OFI = (BuyVol - SellVol) / (BuyVol + SellVol) ∈ [-1, 1] */
export function orderFlowImbalance(trades: TradeTick[], windowMs = 60_000, now = Date.now()): number {
  const cutoff = now - windowMs
  let buy = 0
  let sell = 0
  for (const t of trades) {
    if (t.timestamp < cutoff) continue
    if (t.side === 'buy') buy += t.solAmount
    else sell += t.solAmount
  }
  const total = buy + sell
  if (total <= 0) return 0
  return clamp((buy - sell) / total, -1, 1)
}

/** Price velocity = (P_t - P_{t-n}) / n */
export function priceVelocity(trades: TradeTick[], n = 5): number {
  const prices = trades
    .filter((t) => t.tokenAmount > 0)
    .map((t) => t.solAmount / t.tokenAmount)
  if (prices.length < 2) return 0
  const slice = prices.slice(-Math.max(n, 2))
  return (slice[slice.length - 1] - slice[0]) / slice.length
}

/** LG = (L_t - L_{t-n}) / L_{t-n} */
export function liquidityGrowth(state: TokenMarketState, windowMs = 90_000): number {
  const hist = state.liquidityHistory
  if (hist.length < 2) return 0
  const now = hist[hist.length - 1].timestamp
  const past = hist.find((h) => h.timestamp <= now - windowMs) ?? hist[0]
  const lt = hist[hist.length - 1].virtualSolReserves
  const ln = past.virtualSolReserves
  if (ln <= 0) return 0
  return (lt - ln) / ln
}

export function realizedVolatility(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Sharpe-like S = (E[R] - R_f) / σ */
export function sharpeLikeScore(returns: number[], riskFree = 0): number {
  if (returns.length < 2) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const sigma = realizedVolatility(returns)
  if (sigma < 1e-9) return mean > riskFree ? 2 : 0
  return (mean - riskFree) / sigma
}

export function tradeReturnsFromTicks(trades: TradeTick[]): number[] {
  const prices = trades
    .filter((t) => t.tokenAmount > 0)
    .map((t) => t.solAmount / t.tokenAmount)
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
  }
  return returns
}

export function buyPressurePct(trades: TradeTick[], windowMs = 60_000, now = Date.now()): number {
  const ofi = orderFlowImbalance(trades, windowMs, now)
  return clamp01((ofi + 1) / 2)
}

export function tradeVelocity(trades: TradeTick[], windowMs = 60_000, now = Date.now()): number {
  const cutoff = now - windowMs
  const count = trades.filter((t) => t.timestamp >= cutoff).length
  return count / (windowMs / 1000)
}

export function marketCapAcceleration(state: TokenMarketState): number {
  const hist = state.liquidityHistory
  if (hist.length < 3) return 0
  const mcaps = hist.slice(-8).map((h) => h.marketCapSol)
  const v1 = mcaps[mcaps.length - 1] - mcaps[mcaps.length - 2]
  const v0 = mcaps[mcaps.length - 2] - mcaps[mcaps.length - 3]
  return v1 - v0
}

export function uniqueBuyerGrowth(state: TokenMarketState, windowMs = 120_000, now = Date.now()): number {
  const cutoff = now - windowMs
  const buyers = new Set(
    state.trades.filter((t) => t.side === 'buy' && t.timestamp >= cutoff).map((t) => t.wallet),
  )
  const older = new Set(
    state.trades.filter((t) => t.side === 'buy' && t.timestamp < cutoff).map((t) => t.wallet),
  )
  if (older.size === 0) return buyers.size
  return (buyers.size - older.size) / older.size
}
