import { globalMarketState } from '@trading'
import { tokenApi } from '@/services/api'

/** Replay server trade history into client EV state (required when using Fly relay, not direct PumpPortal). */
export async function hydrateMarketStateFromApi(mint: string): Promise<number> {
  const [trades, token] = await Promise.all([
    tokenApi.trades(mint).catch(() => []),
    tokenApi.get(mint).catch(() => null),
  ])

  if (token && !globalMarketState.getState(mint)) {
    globalMarketState.ingestNewToken({
      mint,
      symbol: token.symbol,
      name: token.name,
      vSolInBondingCurve: token.liquidity,
      marketCapSol: token.marketCap / 200,
    })
  }

  const existing = new Set(
    globalMarketState.getState(mint)?.trades.map((t) => t.signature) ?? [],
  )

  let added = 0
  const ordered = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
  for (const t of ordered) {
    if (t.signature && existing.has(t.signature)) continue
    globalMarketState.ingestTrade({
      mint,
      txType: t.side === 'sell' ? 'sell' : 'buy',
      solAmount: t.solAmount,
      tokenAmount: t.tokenAmount ?? 0,
      traderPublicKey: t.wallet,
      signature: t.signature,
      timestamp: new Date(t.timestamp).getTime(),
    })
    added++
  }
  return added
}
