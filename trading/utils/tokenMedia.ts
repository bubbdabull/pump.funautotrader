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

  const uri = fields?.uri
  if (uri) {
    push(normalizeIpfsUrl(uri))
  }

  if (fields?.image && !isPlaceholderTokenImage(fields.image)) {
    push(fields.image)
  }
  if (fields?.imageUri && !isPlaceholderTokenImage(fields.imageUri)) {
    push(fields.imageUri)
  }

  push(`https://pump.fun/coin/${mint}/image`)
  push(`https://assets.pump.fun/coins/${mint}.png`)
  push(`https://pump.fun/coin/${mint}.png`)

  if (uri?.startsWith('ipfs://')) {
    const cid = uri.slice(7).split('/')[0]
    push(`https://cloudflare-ipfs.com/ipfs/${cid}`)
    push(`https://gateway.pinata.cloud/ipfs/${cid}`)
  }

  // Last-resort CDNs (often 404 on fresh mints — do not use as primary `image` field)
  push(`https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`)
  push(`https://imagedelivery.net/WL1JOIJiM_NAChp6rtB6Q/coin-image/${mint}/600x600`)

  return out
}

/** Best URL to store on feed rows — never a known placeholder CDN. */
export function resolveDisplayImage(
  mint: string,
  fields?: { uri?: string; image?: string; imageUri?: string },
): string {
  for (const u of resolveTokenImageCandidates(mint, fields)) {
    if (!isPlaceholderTokenImage(u) && !isLikelyMetadataUri(u)) return u
  }
  return ''
}

/** Generic CDN fallbacks — not a real token image until metadata resolves. */
export function isPlaceholderTokenImage(url?: string): boolean {
  if (!url?.trim()) return true
  const u = url.toLowerCase()
  return (
    u.includes('dexscreener.com/ds-data') ||
    u.includes('imagedelivery.net/wl1joijim_na') ||
    (u.includes('pump.fun/coin/') && u.endsWith('.png'))
  )
}

export function resolveTokenImage(
  mint: string,
  fields?: { uri?: string; image?: string; imageUri?: string },
): string {
  return resolveDisplayImage(mint, fields)
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
