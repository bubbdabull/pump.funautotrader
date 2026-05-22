/** Count unique holders from bonding-curve trade stream + optional pump.fun REST count. */

export interface HolderCountInput {
  walletBalances: Map<string, number>
  trades: { wallet: string; side: 'buy' | 'sell' }[]
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

/**
 * Best-effort holder count: max of on-chain stream estimates and pump.fun API.
 * Stream under-counts until enough trades; API may lag on brand-new launches.
 */
export function resolveHolderCount(
  state: HolderCountInput,
  pumpFunHolderCount?: number | null,
): number {
  const withBalance = countWalletsWithBalance(state)
  const buyers = countUniqueBuyers(state)
  const traders = countUniqueTraders(state)
  const fromStream = Math.max(withBalance, buyers, traders, 1)
  const fromApi = pumpFunHolderCount != null && pumpFunHolderCount > 0 ? pumpFunHolderCount : 0
  return Math.max(fromStream, fromApi)
}

/** @deprecated Use resolveHolderCount */
export function countUniqueHolders(state: HolderCountInput): number {
  return resolveHolderCount(state)
}
