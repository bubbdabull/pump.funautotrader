import { clamp01 } from '../utils/math'

export interface BacktestTrade {
  mint: string
  entryMs: number
  exitMs: number
  pnlSol: number
  strategyId: string
}

export interface BacktestMetrics {
  trades: number
  wins: number
  losses: number
  winRate: number
  totalPnlSol: number
  avgWin: number
  avgLoss: number
  expectancy: number
  maxDrawdownSol: number
  sharpeRatio: number
}

export function computeBacktestMetrics(trades: BacktestTrade[]): BacktestMetrics {
  if (trades.length === 0) {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnlSol: 0,
      avgWin: 0,
      avgLoss: 0,
      expectancy: 0,
      maxDrawdownSol: 0,
      sharpeRatio: 0,
    }
  }

  const wins = trades.filter((t) => t.pnlSol > 0)
  const losses = trades.filter((t) => t.pnlSol <= 0)
  const winRate = wins.length / trades.length
  const avgWin =
    wins.length > 0 ? wins.reduce((a, t) => a + t.pnlSol, 0) / wins.length : 0
  const avgLoss =
    losses.length > 0
      ? Math.abs(losses.reduce((a, t) => a + t.pnlSol, 0) / losses.length)
      : 0
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss
  const totalPnlSol = trades.reduce((a, t) => a + t.pnlSol, 0)

  let peak = 0
  let equity = 0
  let maxDd = 0
  const returns: number[] = []
  for (const t of trades) {
    equity += t.pnlSol
    returns.push(t.pnlSol)
    peak = Math.max(peak, equity)
    maxDd = Math.max(maxDd, peak - equity)
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance =
    returns.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, returns.length - 1)
  const sigma = Math.sqrt(variance)
  const sharpeRatio = sigma > 1e-9 ? mean / sigma : 0

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: clamp01(winRate),
    totalPnlSol,
    avgWin,
    avgLoss,
    expectancy,
    maxDrawdownSol: maxDd,
    sharpeRatio,
  }
}
