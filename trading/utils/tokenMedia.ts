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

/** pump.fun page URLs — not real image files (usually 404). */
export function isBrokenPumpFunImageUrl(url?: string): boolean {
  if (!url?.trim()) return false
  const u = url.toLowerCase()
  return (
    u.includes('pump.fun/coin/') &&
    (u.endsWith('/image') || u.endsWith('.png') || u.endsWith('.jpg'))
  )
}

/** Generic CDN fallbacks — not a real token image until metadata resolves. */
export function isPlaceholderTokenImage(url?: string): boolean {
  if (!url?.trim()) return true
  const u = url.toLowerCase()
  return (
    isBrokenPumpFunImageUrl(u) ||
    u.includes('dexscreener.com/ds-data') ||
    u.includes('imagedelivery.net/wl1joijim_na')
  )
}

/** Real display URL from pump.fun API / IPFS / Arweave / CDN — safe for <img src>. */
export function isUsableTokenImageUrl(url?: string): boolean {
  if (!url?.trim()) return false
  if (isPlaceholderTokenImage(url)) return false
  if (isLikelyMetadataUri(url)) return false
  const u = url.trim().toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(u)) return true
  if (
    /(arweave\.net|ipfs\.io|cloudflare-ipfs|pinata|mypinata|digitaloceanspaces|amazonaws\.com|assets\.pump\.fun|pbs\.twimg|blob:)/i.test(
      u,
    )
  ) {
    return true
  }
  if (u.includes('/ipfs/') && !u.endsWith('.json')) return true
  return false
}

/** Prefer pump.fun `image_uri` / PumpPortal `image` before broken page URLs. */
export function coalesceTokenImage(
  _mint: string,
  fields?: { uri?: string; image?: string; imageUri?: string },
): string {
  for (const raw of [fields?.image, fields?.imageUri]) {
    if (raw && isUsableTokenImageUrl(raw)) return normalizeIpfsUrl(raw)
  }
  return ''
}

export function resolveTokenImageCandidates(
  mint: string,
  fields?: { uri?: string; image?: string; imageUri?: string },
): string[] {
  const out: string[] = []
  const push = (u?: string) => {
    if (!u || out.includes(u)) return
    if (!isUsableTokenImageUrl(u)) return
    out.push(normalizeIpfsUrl(u))
  }

  push(coalesceTokenImage(mint, fields))

  const uri = fields?.uri
  if (uri?.startsWith('ipfs://')) {
    const cid = uri.slice(7).split('/')[0]
    push(`https://cloudflare-ipfs.com/ipfs/${cid}`)
    push(`https://gateway.pinata.cloud/ipfs/${cid}`)
  }

  push(`https://assets.pump.fun/coins/${mint}.png`)

  return out
}

/** Best URL to store on feed rows — real image_uri only, never broken pump.fun page URLs. */
export function resolveDisplayImage(
  mint: string,
  fields?: { uri?: string; image?: string; imageUri?: string },
): string {
  const direct = coalesceTokenImage(mint, fields)
  if (direct) return direct
  for (const u of resolveTokenImageCandidates(mint, fields)) {
    if (isUsableTokenImageUrl(u)) return u
  }
  return ''
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
