import type { PumpToken } from '@/types'
import type { SignalUpdatePayload } from '@/lib/terminalTypes'
import { isUsableTokenImageUrl } from '@trading'

export function preferImage(next?: string, prev?: string): string {
  if (next && isUsableTokenImageUrl(next)) return next
  if (prev && isUsableTokenImageUrl(prev)) return prev
  return next || prev || ''
}

/** Merge registry patch without dropping stream fields. */
export function patchToken(prev: PumpToken | undefined, next: PumpToken): PumpToken {
  if (!prev) return next
  const streamLive = Boolean(next.lastTradeAt && next.lastTradeAt >= Date.now() - 120_000)
  const holders = streamLive
    ? Math.max(1, next.holders ?? prev.holders ?? 0)
    : Math.max(prev.holders ?? 0, next.holders ?? 0)
  return {
    ...prev,
    ...next,
    image: preferImage(next.image, prev.image),
    metadataUri: next.metadataUri || prev.metadataUri,
    twitter: next.twitter || prev.twitter,
    telegram: next.telegram || prev.telegram,
    website: next.website || prev.website,
    holders,
    holdersVerified:
      (prev.holdersVerified && holders >= 2) || (next.holdersVerified && holders >= 2),
    signalScore: next.signalScore !== undefined ? next.signalScore : prev.signalScore,
    momentumScore:
      next.momentumScore !== undefined ? next.momentumScore : prev.momentumScore,
    lifecycle: next.lifecycle ?? prev.lifecycle,
    migrationProbability:
      next.migrationProbability !== undefined
        ? next.migrationProbability
        : prev.migrationProbability,
    burstIgnition:
      next.burstIgnition !== undefined ? next.burstIgnition : prev.burstIgnition,
    buyPressure1m:
      next.buyPressure1m !== undefined ? next.buyPressure1m : prev.buyPressure1m,
    mcapChange5m: next.mcapChange5m ?? prev.mcapChange5m,
    lastTradeAt: next.lastTradeAt ?? prev.lastTradeAt,
    isActive: next.isActive ?? prev.isActive,
    updatedAt: next.updatedAt ?? prev.updatedAt,
    top1Pct: next.top1Pct ?? prev.top1Pct,
    top5Pct: next.top5Pct ?? prev.top5Pct,
  }
}

function scaleScore(v: number): number {
  return v <= 1 ? Math.round(v * 100) : Math.round(v)
}

export function applySignalToToken(token: PumpToken, signal: SignalUpdatePayload): PumpToken {
  return {
    ...token,
    signalScore: scaleScore(signal.tradeConfidenceScore),
    momentumScore: scaleScore(signal.momentumScore),
    lifecycle: signal.lifecycle,
    migrationProbability: scaleScore(signal.migrationProbability),
    burstIgnition: signal.burstIgnition,
    coordinationPenalty: signal.coordinationPenalty,
    aiRiskScore: signal.rug.rugScore,
    updatedAt: Date.parse(signal.at) || Date.now(),
  }
}
