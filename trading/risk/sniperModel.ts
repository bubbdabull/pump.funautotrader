import { SNIPER_WINDOW_MS, SAME_BLOCK_DENSITY_THRESHOLD, ENTRY_SIS_MAX } from '../constants'
import type { TokenMarketState } from '../types'
import { clamp01 } from '../utils/math'

export interface SniperModelResult {
  sis: number
  sniperWalletCountWeight: number
  sameBlockEntryDensity: number
  earlyConcentrationRatio: number
  invalidated: boolean
}

export function computeSIS(state: TokenMarketState): SniperModelResult {
  const t0 = state.createdAt
  const earlyTrades = state.trades.filter((t) => t.timestamp - t0 <= SNIPER_WINDOW_MS)

  if (earlyTrades.length === 0) {
    return {
      sis: 0.15,
      sniperWalletCountWeight: 0,
      sameBlockEntryDensity: 0,
      earlyConcentrationRatio: 0.1,
      invalidated: false,
    }
  }

  const earlyBuyers = new Set(
    earlyTrades.filter((t) => t.side === 'buy').map((t) => t.wallet),
  )
  const sniperWalletCountWeight = clamp01(earlyBuyers.size / 12)

  const slotBuckets = new Map<number, number>()
  for (const t of earlyTrades) {
    const slot = t.slot ?? Math.floor(t.timestamp / 400)
    slotBuckets.set(slot, (slotBuckets.get(slot) ?? 0) + 1)
  }
  const maxSlotDensity = Math.max(0, ...slotBuckets.values())
  const sameBlockEntryDensity = clamp01(maxSlotDensity / SAME_BLOCK_DENSITY_THRESHOLD)

  const earlyBuySol = earlyTrades
    .filter((t) => t.side === 'buy')
    .reduce((a, t) => a + t.solAmount, 0)
  const totalBuySol = state.trades
    .filter((t) => t.side === 'buy')
    .reduce((a, t) => a + t.solAmount, 0)
  const earlyConcentrationRatio =
    totalBuySol > 0 ? clamp01(earlyBuySol / totalBuySol) : clamp01(earlyBuySol > 0 ? 1 : 0)

  let sis = clamp01(
    sniperWalletCountWeight * 0.4 +
      sameBlockEntryDensity * 0.35 +
      earlyConcentrationRatio * 0.25,
  )

  const invalidated = sis > ENTRY_SIS_MAX

  return {
    sis,
    sniperWalletCountWeight,
    sameBlockEntryDensity,
    earlyConcentrationRatio,
    invalidated,
  }
}

/** Apply EV multiplier: EV *= (1 - SIS) */
export function applySisEvMultiplier(ev: number, sis: number): number {
  return ev * (1 - clamp01(sis))
}
