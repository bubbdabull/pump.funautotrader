import { normalizeFeedTokenLabels } from '@trading'
import type { PumpToken } from '@/types'
import type { StreamToken, TokenDisplayStatus } from './tokenTypes'

function deriveDisplayStatus(raw: PumpToken): TokenDisplayStatus {
  if (raw.signalState === 'INVALID_SIGNAL' || raw.dataState === 'invalid') return 'INVALID'
  const active =
    raw.isActive ||
    (raw.lastTradeAt != null && raw.lastTradeAt >= Date.now() - 120_000) ||
    (raw.trades1m ?? 0) > 0
  if (active || raw.signalState === 'MOMENTUM_SIGNAL') return 'LIVE'
  return 'EARLY'
}

function derivePrice(raw: PumpToken): number {
  if (raw.priceUsd > 0) return raw.priceUsd
  if (raw.marketCap > 0) return raw.marketCap / 1_000_000_000
  return 0
}

function parseLaunchedAt(launchedAt: string): number {
  const t = Date.parse(launchedAt)
  return Number.isFinite(t) ? t : Date.now()
}

/** Never drop tokens — fill gaps with safe defaults */
export function normalizeStreamToken(raw: Partial<PumpToken> & { mint: string }): StreamToken {
  const labels = normalizeFeedTokenLabels(raw.mint, {
    symbol: raw.symbol,
    name: raw.name,
  })
  const launchedAtMs = parseLaunchedAt(raw.launchedAt ?? new Date().toISOString())
  const base: PumpToken = {
    mint: raw.mint,
    name: labels.name || 'Unknown',
    symbol: labels.symbol || raw.mint.slice(0, 6),
    image: raw.image ?? '',
    metadataUri: raw.metadataUri,
    twitter: raw.twitter,
    telegram: raw.telegram,
    website: raw.website,
    marketCap: raw.marketCap ?? 0,
    bondingCurvePercent: raw.bondingCurvePercent ?? 0,
    holders: Math.max(0, raw.holders ?? 0),
    holdersVerified: raw.holdersVerified ?? false,
    volume24h: raw.volume24h ?? 0,
    signalScore: raw.signalScore ?? raw.score ?? 50,
    aiRiskScore: raw.aiRiskScore,
    momentumScore: raw.momentumScore ?? 0,
    whaleActivity: raw.whaleActivity ?? 'low',
    launchedAt: raw.launchedAt ?? new Date(launchedAtMs).toISOString(),
    priceUsd: derivePrice(raw as PumpToken),
    priceChange24h: raw.priceChange24h ?? 0,
    liquidity: raw.liquidity ?? 0,
    lastTradeAt: raw.lastTradeAt,
    trades1m: raw.trades1m,
    volume5mSol: raw.volume5mSol,
    buyPressure1m: raw.buyPressure1m,
    mcapChange5m: raw.mcapChange5m,
    isActive: raw.isActive,
    lifecycle: raw.lifecycle,
    migrationProbability: raw.migrationProbability,
    burstIgnition: raw.burstIgnition,
    updatedAt: raw.updatedAt,
    dataState: raw.dataState ?? 'raw',
    signalState: raw.signalState,
    score: raw.score,
    confidenceScore: raw.confidenceScore,
    dataCompletenessScore: raw.dataCompletenessScore,
    smartMoneyScore: raw.smartMoneyScore,
    smartMoneyFlow: raw.smartMoneyFlow,
    pumpProbabilityScore: raw.pumpProbabilityScore,
    pumpSignal: raw.pumpSignal,
    scoreVelocity: raw.scoreVelocity,
    subscriptionTier: raw.subscriptionTier,
    top1Pct: raw.top1Pct,
    top5Pct: raw.top5Pct,
  }

  const displayStatus = deriveDisplayStatus(base)
  const intelScore = base.score ?? base.signalScore ?? 50

  return {
    ...base,
    displayStatus,
    ageMs: Math.max(0, Date.now() - launchedAtMs),
    livePriceUsd: derivePrice(base),
    volumeSol5m: base.volume5mSol ?? 0,
    intelScore,
  }
}

export function mergeStreamTokens(prev: StreamToken, next: Partial<PumpToken>): StreamToken {
  return normalizeStreamToken({ ...prev, ...next, mint: next.mint ?? prev.mint })
}
