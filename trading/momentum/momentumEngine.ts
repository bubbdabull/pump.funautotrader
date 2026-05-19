import type { TokenMarketState } from '../types'
import { clamp01, linearRegressionSlope, coefficientOfVariation } from '../utils/math'

export interface MomentumModelResult {
  mqi: number
  uniqueBuyersVelocity: number
  volumeAcceleration: number
  priceSlopeConsistency: number
  penalties: string[]
}

export function computeMQI(state: TokenMarketState): MomentumModelResult {
  const penalties: string[] = []
  const trades = state.trades
  const now = state.lastUpdated
  const windowMs = 90_000

  const recent = trades.filter((t) => now - t.timestamp <= windowMs)
  const buys = recent.filter((t) => t.side === 'buy')

  const uniqueWallets = new Set(buys.map((t) => t.wallet)).size
  const ageSec = Math.max(1, (now - state.createdAt) / 1000)
  const uniqueBuyersVelocity = clamp01(uniqueWallets / Math.max(3, ageSec / 8))

  let volumeAcceleration = 0.45
  if (recent.length >= 6) {
    const mid = Math.floor(recent.length / 2)
    const firstHalf = recent.slice(0, mid).reduce((a, t) => a + t.solAmount, 0)
    const secondHalf = recent.slice(mid).reduce((a, t) => a + t.solAmount, 0)
    const accel = secondHalf / Math.max(0.01, firstHalf)
    volumeAcceleration = clamp01(0.35 + (accel - 1) * 0.35)
  }

  let priceSlopeConsistency = 0.5
  const history = state.liquidityHistory
  if (history.length >= 4) {
    const mcap = history.map((h, i) => ({ x: i, y: h.marketCapSol }))
    const slope = linearRegressionSlope(mcap)
    const values = history.map((h) => h.marketCapSol)
    const cv = coefficientOfVariation(values)
    const direction = slope >= 0 ? 1 : 0.3
    priceSlopeConsistency = clamp01(direction * (1 - Math.min(1, cv)))
  }

  let mqi =
    uniqueBuyersVelocity * 0.35 +
    volumeAcceleration * 0.35 +
    priceSlopeConsistency * 0.3

  const walletBuyCounts = new Map<string, number>()
  for (const t of buys) {
    walletBuyCounts.set(t.wallet, (walletBuyCounts.get(t.wallet) ?? 0) + 1)
  }
  const repeatBuys = [...walletBuyCounts.values()].filter((c) => c >= 4).length
  if (repeatBuys >= 2 && uniqueWallets > 0 && repeatBuys / uniqueWallets > 0.35) {
    mqi *= 0.5
    penalties.push('bot_like_buys')
  }

  const totalBuySol = buys.reduce((a, t) => a + t.solAmount, 0)
  if (totalBuySol > 0) {
    let maxWalletShare = 0
    for (const [, sol] of state.walletBuySol) {
      maxWalletShare = Math.max(maxWalletShare, sol / totalBuySol)
    }
    if (maxWalletShare > 0.35) {
      mqi *= 0.6
      penalties.push('single_wallet_dominance')
    }
  }

  if (history.length >= 3) {
    const mcaps = history.map((h) => h.marketCapSol)
    const lastJump = mcaps[mcaps.length - 1] / Math.max(0.001, mcaps[mcaps.length - 2])
    if (lastJump > 1.8) {
      mqi *= 0.7
      penalties.push('vertical_spike')
    }
  }

  return {
    mqi: clamp01(mqi),
    uniqueBuyersVelocity,
    volumeAcceleration,
    priceSlopeConsistency,
    penalties,
  }
}
