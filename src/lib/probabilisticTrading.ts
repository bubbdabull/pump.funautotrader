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
  normalizePumpPortalTrade,
  resolveHolderCount,
} from '@trading'

export function ingestPumpPortalPayload(data: Record<string, unknown>): PumpToken | null {
  if (!data.mint || typeof data.mint !== 'string') return null

  const mint = data.mint
  const normalized = normalizePumpPortalTrade(data)
  const isTrade = Boolean(normalized)

  if (isTrade && normalized) {
    globalMarketState.ingestTrade({
      mint,
      txType: normalized.side,
      solAmount: normalized.solAmount,
      tokenAmount: normalized.tokenAmount,
      newTokenBalance: normalized.newTokenBalance,
      traderPublicKey: normalized.traderPublicKey,
      signature: normalized.signature,
      vSolInBondingCurve: normalized.vSolInBondingCurve,
      marketCapSol: normalized.marketCapSol,
      timestamp:
        Number(data.timestamp) > 0
          ? Number(data.timestamp)
          : normalized.timestampMs,
      slot: normalized.slot,
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
  const holders = state
    ? resolveHolderCount({
        walletBalances: state.walletBalances,
        trades: state.trades,
      })
    : 0
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
    holders: state ? Math.max(1, holders) : 0,
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
