/** Count unique holders from bonding-curve trade stream state. */
export function countUniqueHolders(state: {
  walletBalances: Map<string, number>
  trades: { wallet: string }[]
}): number {
  let withBalance = 0
  for (const bal of state.walletBalances.values()) {
    if (bal > 0) withBalance++
  }
  if (withBalance > 0) return withBalance

  const wallets = new Set(
    state.trades.map((t) => t.wallet).filter((w) => w && w !== 'unknown'),
  )
  return Math.max(1, wallets.size)
}
