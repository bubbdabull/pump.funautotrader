import { isUsableTokenImageUrl } from '@trading'
import type { PumpToken } from '@/types'

/** Light touch only — keep server image/uri; fix false verified flags. */
export function normalizePumpToken(raw: PumpToken): PumpToken {
  const t = { ...raw }
  const holders = Math.max(0, Math.round(t.holders ?? 0))
  t.holders = holders
  t.holdersVerified = Boolean(t.holdersVerified) && holders >= 2
  if (t.image && !isUsableTokenImageUrl(t.image)) {
    t.image = ''
  }
  return t
}

export function normalizePumpTokens(list: PumpToken[] | unknown): PumpToken[] {
  if (!Array.isArray(list)) return []
  return list.map((x) => normalizePumpToken(x as PumpToken))
}

export function mergePumpTokens(prev: PumpToken, next: PumpToken): PumpToken {
  const image = next.image || prev.image
  const metadataUri = next.metadataUri || prev.metadataUri
  return normalizePumpToken({
    ...prev,
    ...next,
    image,
    metadataUri,
    holders: Math.max(prev.holders ?? 0, next.holders ?? 0),
    holdersVerified:
      (prev.holdersVerified && (prev.holders ?? 0) >= 2) ||
      (next.holdersVerified && (next.holders ?? 0) >= 2),
    lastTradeAt: next.lastTradeAt ?? prev.lastTradeAt,
    trades1m: Math.max(prev.trades1m ?? 0, next.trades1m ?? 0),
    volume5mSol: Math.max(prev.volume5mSol ?? 0, next.volume5mSol ?? 0),
    isActive: next.isActive ?? prev.isActive,
  })
}
