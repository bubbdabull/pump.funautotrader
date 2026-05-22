import {
  isGraduatingSoon,
  passesAlphaFilter,
  passesTradeableFilter,
  type FeedQualityFields,
} from '@phronis/trading'

export interface TradeSubRankInput extends FeedQualityFields {
  launchedAt: string
}

/** Higher score = keep trade stream for auto-trader EV engine. */
export function rankMintForTradeSubscription(
  token: TradeSubRankInput,
  pinnedMints: ReadonlySet<string>,
  now = Date.now(),
): number {
  let score = 0
  if (pinnedMints.has(token.mint)) score += 10_000
  if (passesTradeableFilter(token)) score += 8_000
  if (isGraduatingSoon(token)) score += 2_500
  if (passesAlphaFilter(token)) score += 1_200
  score += token.momentumScore ?? 0
  score += Math.min(300, Math.round((token.volume24h ?? 0) * 120))
  score += Math.min(150, token.holders ?? 0)

  const ageMin = (now - new Date(token.launchedAt).getTime()) / 60_000
  if (ageMin < 60) score += Math.max(0, 120 - ageMin * 2)

  return score
}

export function pickMintsForTradeSubscription(
  tokens: TradeSubRankInput[],
  pinnedMints: ReadonlySet<string>,
  limit: number,
  alreadySubscribed: ReadonlySet<string>,
  mandatoryMints: readonly string[] = [],
): string[] {
  const picked: string[] = []
  const seen = new Set<string>()

  for (const mint of mandatoryMints) {
    if (picked.length >= limit) break
    if (alreadySubscribed.has(mint) || seen.has(mint)) continue
    seen.add(mint)
    picked.push(mint)
  }

  const ranked = tokens
    .map((t) => ({
      mint: t.mint,
      score: rankMintForTradeSubscription(t, pinnedMints),
    }))
    .sort((a, b) => b.score - a.score)

  for (const { mint } of ranked) {
    if (picked.length >= limit) break
    if (alreadySubscribed.has(mint) || seen.has(mint)) continue
    seen.add(mint)
    picked.push(mint)
  }
  return picked
}
