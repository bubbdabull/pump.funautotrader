import {
  globalMarketState,
  evaluateEntry,
  finalizeEntryDecision,
  evScoreToSignalScore,
  momentumScoreFromMetrics,
  scoreFromStaticFields,
} from '@trading'
import type { EntryDecision } from '@trading'
import type { AutoTradeRules, PumpToken } from '@/types'
import {
  bondingCurvePercentFromSol,
  marketCapUsdFromSol,
  normalizeVirtualSol,
  resolveTokenImage,
} from '@trading'

export function ingestPumpPortalPayload(data: Record<string, unknown>): PumpToken | null {
  if (!data.mint || typeof data.mint !== 'string') return null

  const mint = data.mint
  const isTrade = data.txType === 'buy' || data.txType === 'sell'

  if (isTrade) {
    globalMarketState.ingestTrade({
      mint,
      txType: data.txType as 'buy' | 'sell',
      solAmount: Number(data.solAmount ?? data.sol_amount ?? 0),
      tokenAmount: Number(data.tokenAmount ?? data.token_amount ?? 0),
      traderPublicKey: (data.traderPublicKey ?? data.trader) as string | undefined,
      signature: data.signature as string | undefined,
      vSolInBondingCurve: Number(data.vSolInBondingCurve ?? 0) || undefined,
      marketCapSol: Number(data.marketCapSol ?? 0) || undefined,
    })
  } else {
    globalMarketState.ingestNewToken({
      mint,
      symbol: data.symbol as string | undefined,
      name: data.name as string | undefined,
      vSolInBondingCurve: Number(data.vSolInBondingCurve ?? 0) || undefined,
      vTokensInBondingCurve: Number(data.vTokensInBondingCurve ?? 0) || undefined,
      marketCapSol: Number(data.marketCapSol ?? 0) || undefined,
      traderPublicKey: (data.traderPublicKey ?? data.trader) as string | undefined,
    })
  }

  return pumpTokenFromMint(mint, data)
}

export function pumpTokenFromMint(
  mint: string,
  data?: Record<string, unknown>,
): PumpToken {
  const state = globalMarketState.getState(mint)
  const vSol = normalizeVirtualSol(
    state?.liquidity ??
      Number(data?.vSolInBondingCurve ?? data?.marketCapSol ?? 0),
  )
  const curve = state?.bondingCurvePercent ?? bondingCurvePercentFromSol(vSol)
  const marketCap =
    state?.marketCapUsd ??
    marketCapUsdFromSol(Number(data?.marketCapSol ?? 0) || vSol)

  let signalScore = curve <= 35 ? 25 : 55
  let momentumScore = 50

  if (state) {
    const metrics = evaluateEntry(state).metrics
    signalScore = evScoreToSignalScore(metrics)
    momentumScore = momentumScoreFromMetrics(metrics)
  } else if (data) {
    const scores = scoreFromStaticFields({
      mint,
      bondingCurvePercent: curve,
      marketCap,
      volume24h: 0,
      holders: 0,
      symbol: data.symbol as string | undefined,
      name: data.name as string | undefined,
    })
    signalScore = scores.signalScore
    momentumScore = scores.momentumScore
  }

  return {
    mint,
    name: (state?.name ?? data?.name ?? 'Unknown') as string,
    symbol:
      (state?.symbol ??
        data?.symbol ??
        mint.slice(0, 4).toUpperCase()) as string,
    image: resolveTokenImage(mint, {
      uri: data?.uri as string | undefined,
      image: data?.image as string | undefined,
    }),
    marketCap,
    bondingCurvePercent: curve,
    holders: state
      ? [...state.walletBalances.values()].filter((b) => b > 0).length ||
        Math.max(1, new Set(state.trades.map((t) => t.wallet)).size)
      : 0,
    volume24h: Array.isArray(state?.trades)
      ? state.trades.reduce((a, t) => a + t.solAmount, 0)
      : 0,
    signalScore,
    momentumScore,
    whaleActivity: 'low',
    launchedAt: new Date(state?.createdAt ?? Date.now()).toISOString(),
    priceUsd: 0,
    priceChange24h: 0,
    liquidity: vSol,
  }
}

export function evaluateProbabilisticEntry(
  mint: string,
  rules: AutoTradeRules,
  baseSizeSol = rules.buyAmountSol,
): EntryDecision | null {
  if (!rules.enabled) return null

  const state = globalMarketState.getState(mint)
  if (!state) return null

  const profile = rules.snipeNewTokens ? 'snipe' : 'default'
  const decision = finalizeEntryDecision(evaluateEntry(state, profile), baseSizeSol)
  if (!decision.allowed) return null

  if (state.bondingCurvePercent < rules.minBondingCurve) return null
  if (state.bondingCurvePercent > rules.maxBondingCurve) return null
  if (state.marketCapUsd > rules.maxMarketCapUsd) return null

  const legacyScore = evScoreToSignalScore(decision.metrics)
  if (legacyScore > rules.maxSignalScore) return null

  return decision
}
