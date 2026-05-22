import { clamp, clamp01 } from '../utils/math'

export interface GlobalRiskConfig {
  maxDailyDrawdownPct: number
  maxConcurrentTrades: number
  maxPositionSizeSol: number
  riskPerTradeSol: number
  cooldownAfterLossMs: number
  circuitBreakerLosses: number
}

export interface GlobalRiskState {
  dayStartMs: number
  dayPnlSol: number
  openPositions: number
  consecutiveLosses: number
  circuitBreakerUntil?: number
  lastLossAt?: number
}

const DEFAULT_CONFIG: GlobalRiskConfig = {
  maxDailyDrawdownPct: 15,
  maxConcurrentTrades: 5,
  maxPositionSizeSol: 0.5,
  riskPerTradeSol: 0.05,
  cooldownAfterLossMs: 120_000,
  circuitBreakerLosses: 4,
}

export class GlobalRiskManager {
  private config: GlobalRiskConfig
  private state: GlobalRiskState

  constructor(config: Partial<GlobalRiskConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.state = {
      dayStartMs: Date.now(),
      dayPnlSol: 0,
      openPositions: 0,
      consecutiveLosses: 0,
    }
  }

  getConfig(): GlobalRiskConfig {
    return { ...this.config }
  }

  updateConfig(patch: Partial<GlobalRiskConfig>) {
    this.config = { ...this.config, ...patch }
  }

  getState(): GlobalRiskState {
    this.rollDay()
    return { ...this.state }
  }

  private rollDay() {
    const dayMs = 24 * 60 * 60 * 1000
    if (Date.now() - this.state.dayStartMs >= dayMs) {
      this.state.dayStartMs = Date.now()
      this.state.dayPnlSol = 0
    }
  }

  canOpenTrade(portfolioSol = 10): { allowed: boolean; reason?: string } {
    this.rollDay()
    const now = Date.now()

    if (this.state.circuitBreakerUntil && now < this.state.circuitBreakerUntil) {
      return { allowed: false, reason: 'circuit_breaker' }
    }

    if (this.state.lastLossAt && now - this.state.lastLossAt < this.config.cooldownAfterLossMs) {
      return { allowed: false, reason: 'loss_cooldown' }
    }

    const drawdownPct = portfolioSol > 0 ? (-this.state.dayPnlSol / portfolioSol) * 100 : 0
    if (drawdownPct >= this.config.maxDailyDrawdownPct) {
      return { allowed: false, reason: 'max_daily_drawdown' }
    }

    if (this.state.openPositions >= this.config.maxConcurrentTrades) {
      return { allowed: false, reason: 'max_concurrent_trades' }
    }

    return { allowed: true }
  }

  /** PositionSize = RiskPerTrade / StopLossDistance */
  positionSizeSol(stopLossDistancePct: number, evConfidence: number): number {
    const dist = Math.max(0.02, stopLossDistancePct / 100)
    let size = this.config.riskPerTradeSol / dist
    size *= clamp01(0.5 + evConfidence * 0.5)
    return clamp(size, 0.01, this.config.maxPositionSizeSol)
  }

  /** EV = (WinRate × AvgWin) - (LossRate × AvgLoss) */
  static expectedValue(winRate: number, avgWin: number, avgLoss: number): number {
    const p = clamp01(winRate)
    return p * avgWin - (1 - p) * avgLoss
  }

  registerOpen() {
    this.state.openPositions++
  }

  registerClose(pnlSol: number) {
    this.state.openPositions = Math.max(0, this.state.openPositions - 1)
    this.state.dayPnlSol += pnlSol
    if (pnlSol < 0) {
      this.state.consecutiveLosses++
      this.state.lastLossAt = Date.now()
      if (this.state.consecutiveLosses >= this.config.circuitBreakerLosses) {
        this.state.circuitBreakerUntil = Date.now() + 30 * 60_000
      }
    } else {
      this.state.consecutiveLosses = 0
    }
  }
}

export const globalRiskManager = new GlobalRiskManager()
