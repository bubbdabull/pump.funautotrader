/** Count unique holders from bonding-curve trade stream + on-chain / Bubblemaps snapshots. */

import type { OnChainHolderSnapshot } from '../types/onChainHolders'

export interface HolderCountInput {
  walletBalances: Map<string, number>
  trades: { wallet: string; side: 'buy' | 'sell' }[]
  onChainHolders?: OnChainHolderSnapshot
}

/** Wallets still holding tokens (net balance > 0 from stream). */
export function countWalletsWithBalance(state: HolderCountInput): number {
  let n = 0
  for (const bal of state.walletBalances.values()) {
    if (bal > 0) n++
  }
  return n
}

/** Unique wallets that bought at least once. */
export function countUniqueBuyers(state: HolderCountInput): number {
  const buyers = new Set(
    state.trades
      .filter((t) => t.side === 'buy' && t.wallet && t.wallet !== 'unknown')
      .map((t) => t.wallet),
  )
  return buyers.size
}

/** Any wallet that traded (buy or sell). */
export function countUniqueTraders(state: HolderCountInput): number {
  const wallets = new Set(
    state.trades.map((t) => t.wallet).filter((w) => w && w !== 'unknown'),
  )
  return wallets.size
}

function countFromStream(state: HolderCountInput): number {
  const withBalance = countWalletsWithBalance(state)
  const buyers = countUniqueBuyers(state)
  const traders = countUniqueTraders(state)
  return Math.max(withBalance, buyers, traders, buyers > 0 ? 1 : 0)
}

/**
 * Best-effort holder count: on-chain/Bubblemaps > unique traders from stream.
 * Stream alone under-counts until trade subs cover the mint.
 */
export function resolveHolderCount(
  state: HolderCountInput,
  pumpFunHolderCount?: number | null,
): number {
  const onChain = state.onChainHolders?.holders ?? 0
  const fromStream = countFromStream(state)
  const fromApi = pumpFunHolderCount != null && pumpFunHolderCount > 0 ? pumpFunHolderCount : 0
  return Math.max(onChain, fromStream, fromApi, 1)
}

/** @deprecated Use resolveHolderCount */
export function countUniqueHolders(state: HolderCountInput): number {
  return resolveHolderCount(state)
}
