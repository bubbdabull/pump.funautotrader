/** Shared Pump.fun token media + unit normalization */

const SOL_USD_ESTIMATE = 200
const BONDING_TARGET_SOL = 85

export function normalizeVirtualSol(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  // Pump.fun on-chain reserves are lamports; PumpPortal often sends SOL
  if (value > 1_000_000) return value / 1e9
  return value
}

export function bondingCurvePercentFromSol(virtualSol: number): number {
  const sol = normalizeVirtualSol(virtualSol)
  if (sol <= 0) return 0
  return Math.min(99, Math.round((sol / BONDING_TARGET_SOL) * 100))
}

export function marketCapUsdFromSol(marketCapSol: number): number {
  const sol = normalizeVirtualSol(marketCapSol)
  return sol * SOL_USD_ESTIMATE
}

export function resolveTokenImageCandidates(
  mint: string,
  fields?: { uri?: string; image?: string; imageUri?: string },
): string[] {
  const out: string[] = []
  const push = (u?: string) => {
    if (!u || out.includes(u)) return
    out.push(u)
  }

  push(fields?.image)
  push(fields?.imageUri)

  const uri = fields?.uri
  if (uri) {
    push(normalizeIpfsUrl(uri))
    // metadata JSON — resolved async on server; keep URI for fetch
  }

  push(`https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`)
  push(`https://imagedelivery.net/WL1JOIJiM_NAChp6rtB6Q/coin-image/${mint}/600x600`)
  push(`https://pump.fun/coin/${mint}.png`)
  push(`https://pump.fun/coin/${mint}/image`)
  push(`https://assets.pump.fun/coins/${mint}.png`)

  if (uri?.startsWith('ipfs://')) {
    const cid = uri.slice(7).split('/')[0]
    push(`https://cloudflare-ipfs.com/ipfs/${cid}`)
    push(`https://gateway.pinata.cloud/ipfs/${cid}`)
  }

  return out
}

export function resolveTokenImage(
  mint: string,
  fields?: { uri?: string; image?: string; imageUri?: string },
): string {
  return resolveTokenImageCandidates(mint, fields)[0]
}

export function normalizeIpfsUrl(uri: string): string {
  const trimmed = uri.trim()
  if (trimmed.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${trimmed.slice(7)}`
  }
  if (trimmed.startsWith('Qm') || trimmed.startsWith('bafy')) {
    return `https://ipfs.io/ipfs/${trimmed}`
  }
  return trimmed
}

export function isLikelyMetadataUri(url: string): boolean {
  return /\.(json)(\?|$)/i.test(url) || url.includes('metadata')
}
