/** Parse PumpPortal WS trade payloads into normalized stream fields. */

export type PumpPortalTradeSide = 'buy' | 'sell'

export interface NormalizedPumpTrade {
  side: PumpPortalTradeSide
  solAmount: number
  tokenAmount: number
  traderPublicKey?: string
  signature?: string
  timestampMs: number
  slot?: number
  vSolInBondingCurve?: number
  marketCapSol?: number
  /** Post-trade wallet token balance when PumpPortal sends it */
  newTokenBalance?: number
}

/** Unix seconds from PumpPortal → ms since epoch. */
export function parsePumpPortalTradeTimestampMs(data: Record<string, unknown>): number {
  const raw =
    data.timestamp ??
    data.blockTime ??
    data.block_time ??
    data.time ??
    data.ts ??
    data.receivedAt

  if (raw == null) return Date.now()
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return Date.now()
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n)
}

export function parsePumpPortalTradeSide(
  data: Record<string, unknown>,
): PumpPortalTradeSide | null {
  const raw = String(
    data.txType ?? data.type ?? data.side ?? data.tradeType ?? data.event ?? '',
  ).toLowerCase()
  if (raw === 'buy' || raw === 'purchase') return 'buy'
  if (raw === 'sell' || raw === 'sale') return 'sell'
  if (data.isBuy === true) return 'buy'
  if (data.isBuy === false) return 'sell'
  return null
}

function extractSolAmount(data: Record<string, unknown>): number {
  const direct = Number(
    data.solAmount ?? data.sol_amount ?? data.sol ?? data.amount ?? data.nativeAmount ?? 0,
  )
  if (direct > 0) return direct

  const tokenAmt = Number(data.tokenAmount ?? data.token_amount ?? 0)
  const mcapSol = Number(data.marketCapSol ?? data.market_cap_sol ?? 0)
  if (tokenAmt > 0 && mcapSol > 1) {
    return Math.max(0.002, (tokenAmt / 1_000_000_000) * mcapSol * 0.015)
  }
  return 0
}

export function normalizePumpPortalTrade(
  data: Record<string, unknown>,
): NormalizedPumpTrade | null {
  const side = parsePumpPortalTradeSide(data)
  if (!side) return null

  const solAmount = extractSolAmount(data)
  const tokenAmount = Number(data.tokenAmount ?? data.token_amount ?? 0)
  const traderPublicKey = (data.traderPublicKey ??
    data.trader ??
    data.user ??
    data.owner) as string | undefined

  const hasTradeProof =
    solAmount > 0 ||
    tokenAmount > 0 ||
    Boolean(data.signature) ||
    Boolean(traderPublicKey)

  if (!hasTradeProof) return null

  const newBal = data.newTokenBalance ?? data.new_token_balance
  const newTokenBalance =
    newBal != null && Number.isFinite(Number(newBal)) ? Number(newBal) : undefined

  return {
    side,
    solAmount: solAmount > 0 ? solAmount : 0.005,
    tokenAmount: Math.abs(tokenAmount),
    traderPublicKey,
    signature: data.signature as string | undefined,
    timestampMs: parsePumpPortalTradeTimestampMs(data),
    slot: data.slot != null ? Number(data.slot) : undefined,
    vSolInBondingCurve:
      Number(data.vSolInBondingCurve ?? data.v_sol_in_bonding_curve ?? 0) || undefined,
    marketCapSol: Number(data.marketCapSol ?? data.market_cap_sol ?? 0) || undefined,
    newTokenBalance,
  }
}
