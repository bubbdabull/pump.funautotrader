import { SMART_MONEY_ROI_THRESHOLD, SMART_MONEY_MIN_TRADES } from '../constants'
import type { TokenMarketState } from '../types'
import { clamp01 } from '../utils/math'

export interface WalletPerformance {
  wallet: string
  totalTrades: number
  wins: number
  totalPnlSol: number
  roi: number
  lastSeen: number
}

/** Global wallet history cache (streaming, in-memory). */
export class WalletTracker {
  private readonly cache = new Map<string, WalletPerformance>()

  recordTrade(wallet: string, pnlSol: number, won: boolean) {
    const prev = this.cache.get(wallet) ?? {
      wallet,
      totalTrades: 0,
      wins: 0,
      totalPnlSol: 0,
      roi: 1,
      lastSeen: Date.now(),
    }
    prev.totalTrades += 1
    if (won) prev.wins += 1
    prev.totalPnlSol += pnlSol
    prev.roi = prev.totalPnlSol > 0 ? 1 + prev.totalPnlSol / Math.max(0.5, prev.totalTrades * 0.1) : 0.5
    prev.lastSeen = Date.now()
    this.cache.set(wallet, prev)
  }

  getPerformance(wallet: string): WalletPerformance | undefined {
    return this.cache.get(wallet)
  }

  isSmartMoney(wallet: string): boolean {
    const p = this.cache.get(wallet)
    if (!p || p.totalTrades < SMART_MONEY_MIN_TRADES) return false
    return p.roi >= SMART_MONEY_ROI_THRESHOLD
  }
}

export interface SmartMoneyResult {
  sms: number
  profitableEntries: number
  consistency: number
  divergence: number
}

export function computeSMS(
  state: TokenMarketState,
  tracker: WalletTracker,
): SmartMoneyResult {
  const recent = state.trades.slice(-25)
  const entering = recent.filter((t) => t.side === 'buy')
  const exiting = recent.filter((t) => t.side === 'sell')

  let profitableEntries = 0
  let weighted = 0
  for (const t of entering) {
    const perf = tracker.getPerformance(t.wallet)
    if (perf && perf.roi >= SMART_MONEY_ROI_THRESHOLD) {
      profitableEntries += 1
      weighted += Math.min(2, perf.roi / SMART_MONEY_ROI_THRESHOLD)
    } else if (tracker.isSmartMoney(t.wallet)) {
      profitableEntries += 1
      weighted += 1
    }
  }

  const consistency =
    entering.length > 0
      ? clamp01(weighted / Math.max(1, entering.length))
      : 0

  let smartExits = 0
  for (const t of exiting) {
    if (tracker.isSmartMoney(t.wallet)) smartExits += 1
  }
  const divergence = exiting.length > 0 ? clamp01(smartExits / exiting.length) : 0

  const sms = clamp01(profitableEntries * 0.12 + consistency * 0.55 - divergence * 0.35)

  return { sms, profitableEntries, consistency, divergence }
}

/** Singleton for process-wide smart money memory */
export const globalWalletTracker = new WalletTracker()
