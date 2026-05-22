import { normalizeIpfsUrl, isLikelyMetadataUri } from './tokenMedia'

export interface ParsedTokenMetadata {
  image?: string
  twitter?: string
  telegram?: string
  website?: string
  description?: string
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i

/** URL is probably a direct image, not a metadata JSON document. */
export function isDirectImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u) return false
  if (isLikelyMetadataUri(u)) return false
  if (IMAGE_EXT.test(u)) return true
  if (
    /(arweave\.net|digitaloceanspaces|assets\.pump\.fun|mypinata|cloudflare-ipfs|ipfs\.io)/i.test(
      u,
    )
  ) {
    return !u.endsWith('.json')
  }
  if (u.includes('/ipfs/') && !u.endsWith('.json') && !u.includes('metadata')) {
    const path = u.split('/ipfs/')[1] ?? ''
    if (path.length < 60 && !path.includes('/')) return true
  }
  return false
}

/** Extract display image + socials from pump.fun / Metaplex metadata JSON. */
export function parseTokenMetadataJson(data: Record<string, unknown>): ParsedTokenMetadata {
  const out: ParsedTokenMetadata = {}

  const image =
    (data.image as string) ||
    (data.image_uri as string) ||
    (data.imageUri as string) ||
    null

  const props = data.properties as Record<string, unknown> | undefined
  const files = props?.files as Array<{ uri?: string; type?: string }> | undefined
  const fileImg = files?.find((f) => f.type?.startsWith('image/') || f.uri)?.uri

  const ext = (data.extensions ?? data.external_url) as Record<string, unknown> | string | undefined
  const extObj = typeof ext === 'object' && ext ? ext : {}

  const resolvedImage = image || fileImg
  if (resolvedImage) out.image = normalizeIpfsUrl(resolvedImage)

  out.twitter =
    (data.twitter as string) ||
    (extObj.twitter as string) ||
    (extObj.x as string) ||
    undefined
  out.telegram = (data.telegram as string) || (extObj.telegram as string) || undefined
  out.website =
    (data.website as string) ||
    (typeof ext === 'string' ? ext : undefined) ||
    (extObj.website as string) ||
    (data.external_url as string) ||
    undefined
  out.description = (data.description as string) || undefined

  return out
}
