import { isPlaceholderTokenImage, resolveDisplayImage } from '@trading'
import type { PumpToken } from '@/types'

function toMs(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n) && n > 1e9) return n < 1e12 ? n * 1000 : n
    const d = Date.parse(value)
    if (Number.isFinite(d)) return d
  }
  return undefined
}

function pickMetadataUri(raw: Record<string, unknown>): string | undefined {
  const u =
    (raw.metadataUri as string | undefined) ||
    (raw.uri as string | undefined) ||
    (raw.imageUri as string | undefined)
  return typeof u === 'string' && u.trim() ? u.trim() : undefined
}

function pickImage(mint: string, raw: Record<string, unknown>, metadataUri?: string): string {
  const direct = (raw.image as string | undefined)?.trim()
  if (direct && !isPlaceholderTokenImage(direct)) return direct
  return resolveDisplayImage(mint, {
    uri: metadataUri,
    image: direct,
    imageUri: raw.imageUri as string | undefined,
  })
}

/** Sanitize API + Socket.IO payloads so the UI never shows broken placeholders or false verified flags. */
export function normalizePumpToken(raw: PumpToken | Record<string, unknown>): PumpToken {
  const r = raw as Record<string, unknown>
  const mint = String(r.mint ?? '')
  const metadataUri = pickMetadataUri(r)
  const image = pickImage(mint, r, metadataUri)
  const holders = Math.max(0, Math.round(Number(r.holders ?? 0) || 0))
  const holdersVerified =
    Boolean(r.holdersVerified) && holders >= 2
  const lastTradeAt = toMs(r.lastTradeAt)
  const launchedAtRaw = r.launchedAt
  const launchedAt =
    typeof launchedAtRaw === 'string' && launchedAtRaw
      ? launchedAtRaw
      : lastTradeAt
        ? new Date(lastTradeAt).toISOString()
        : new Date().toISOString()

  const trades1m = Number(r.trades1m ?? 0) || 0
  const volume5mSol = Number(r.volume5mSol ?? 0) || 0
  const isActive =
    Boolean(r.isActive) ||
    (lastTradeAt != null && Date.now() - lastTradeAt < 120_000) ||
    trades1m > 0 ||
    volume5mSol > 0

  return {
    mint,
    name: String(r.name ?? 'Unknown'),
    symbol: String(r.symbol ?? mint.slice(0, 6)),
    image,
    metadataUri,
    twitter: r.twitter as string | undefined,
    telegram: r.telegram as string | undefined,
    website: r.website as string | undefined,
    marketCap: Number(r.marketCap ?? 0) || 0,
    bondingCurvePercent: Number(r.bondingCurvePercent ?? 0) || 0,
    holders,
    holdersVerified,
    volume24h: Number(r.volume24h ?? 0) || 0,
    signalScore: r.signalScore as number | undefined,
    aiRiskScore: r.aiRiskScore as number | undefined,
    momentumScore: Number(r.momentumScore ?? 0) || 0,
    whaleActivity: (r.whaleActivity as PumpToken['whaleActivity']) ?? 'low',
    launchedAt,
    priceUsd: Number(r.priceUsd ?? 0) || 0,
    priceChange24h: Number(r.priceChange24h ?? 0) || 0,
    liquidity: Number(r.liquidity ?? 0) || 0,
    lastTradeAt,
    trades1m,
    volume5mSol,
    buyPressure1m: r.buyPressure1m as number | undefined,
    mcapChange5m: r.mcapChange5m as number | undefined,
    isActive,
    isWatchlisted: Boolean(r.isWatchlisted),
  }
}

export function normalizePumpTokens(
  list: PumpToken[] | unknown,
): PumpToken[] {
  if (!Array.isArray(list)) return []
  return list.map((t) => normalizePumpToken(t as PumpToken))
}

export function mergePumpTokens(prev: PumpToken, next: PumpToken): PumpToken {
  const a = normalizePumpToken(prev)
  const b = normalizePumpToken(next)
  const image = b.image || a.image
  const metadataUri = b.metadataUri || a.metadataUri
  const holders = b.holdersVerified
    ? Math.max(a.holders, b.holders)
    : Math.max(a.holders, b.holders)
  const holdersVerified =
    (a.holdersVerified && a.holders >= 2) || (b.holdersVerified && b.holders >= 2)
  return normalizePumpToken({
    ...a,
    ...b,
    image,
    metadataUri,
    holders,
    holdersVerified,
    lastTradeAt: b.lastTradeAt ?? a.lastTradeAt,
    trades1m: Math.max(a.trades1m ?? 0, b.trades1m ?? 0),
    volume5mSol: Math.max(a.volume5mSol ?? 0, b.volume5mSol ?? 0),
    isActive: b.isActive || a.isActive,
  })
}
