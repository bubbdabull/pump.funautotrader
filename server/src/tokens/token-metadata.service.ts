import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import {
  isLikelyMetadataUri,
  normalizeIpfsUrl,
  resolveDisplayImage,
  resolveTokenImageCandidates,
  parseTokenMetadataJson,
  isDirectImageUrl,
  isPlaceholderTokenImage,
  type ParsedTokenMetadata,
} from '@phronis/trading'

export interface TokenMediaEnrichment {
  image: string
  metadataUri?: string
  twitter?: string
  telegram?: string
  website?: string
}

@Injectable()
export class TokenMetadataService {
  private readonly logger = new Logger(TokenMetadataService.name)
  private readonly imageCache = new Map<string, string>()
  private readonly metaCache = new Map<string, TokenMediaEnrichment>()

  getCached(mint: string): string | undefined {
    return this.imageCache.get(mint)
  }

  getEnrichment(mint: string): TokenMediaEnrichment | undefined {
    return this.metaCache.get(mint)
  }

  resolveSync(
    mint: string,
    fields?: { uri?: string; image?: string; metadataUri?: string },
  ): string {
    const cached = this.imageCache.get(mint)
    if (cached && !isPlaceholderTokenImage(cached)) return cached

    const metaUri = fields?.metadataUri ?? fields?.uri
    const direct = fields?.image
    if (direct && isDirectImageUrl(direct) && !isPlaceholderTokenImage(direct)) {
      const img = normalizeIpfsUrl(direct)
      this.imageCache.set(mint, img)
      return img
    }

    if (metaUri && isDirectImageUrl(metaUri)) {
      const img = normalizeIpfsUrl(metaUri)
      this.imageCache.set(mint, img)
      return img
    }

    const img = resolveDisplayImage(mint, { uri: metaUri, image: direct })
    if (img) this.imageCache.set(mint, img)
    return img
  }

  /** Fetch metadata JSON (image + socials) and resolve a display image URL. */
  async enrichToken(
    mint: string,
    fields?: {
      uri?: string
      image?: string
      metadataUri?: string
      twitter?: string
      telegram?: string
      website?: string
    },
  ): Promise<TokenMediaEnrichment> {
    const cached = this.metaCache.get(mint)
    if (cached?.image && !isPlaceholderTokenImage(cached.image)) return cached

    const metadataUri = fields?.metadataUri ?? fields?.uri
    let parsed: ParsedTokenMetadata = {
      twitter: fields?.twitter,
      telegram: fields?.telegram,
      website: fields?.website,
    }

    if (metadataUri && isLikelyMetadataUri(metadataUri)) {
      const fromMeta = await this.fetchMetadataJson(metadataUri)
      if (fromMeta) parsed = { ...parsed, ...fromMeta }
    }

    if (fields?.image && isDirectImageUrl(fields.image)) {
      parsed.image = normalizeIpfsUrl(fields.image)
    }

    if (!parsed.image) {
      for (const candidate of resolveTokenImageCandidates(mint, {
        uri: metadataUri,
        image: fields?.image,
      })) {
        if (isLikelyMetadataUri(candidate)) {
          const nested = await this.fetchMetadataJson(candidate)
          if (nested?.image && (await this.urlLooksLikeImage(nested.image))) {
            parsed = { ...parsed, ...nested }
            break
          }
          continue
        }
        if (await this.urlLooksLikeImage(candidate)) {
          parsed.image = candidate
          break
        }
      }
    }

    if (parsed.image && !(await this.urlLooksLikeImage(parsed.image))) {
      const nested = await this.fetchMetadataJson(parsed.image)
      if (nested?.image) parsed = { ...parsed, ...nested }
    }

    const image =
      (parsed.image && !isPlaceholderTokenImage(parsed.image) ? parsed.image : '') ||
      resolveDisplayImage(mint, { uri: metadataUri, image: fields?.image })
    const result: TokenMediaEnrichment = {
      image: image || '',
      metadataUri: metadataUri ?? undefined,
      twitter: parsed.twitter,
      telegram: parsed.telegram,
      website: parsed.website,
    }

    this.imageCache.set(mint, image)
    this.metaCache.set(mint, result)
    return result
  }

  /** @deprecated Use enrichToken */
  async enrichImage(
    mint: string,
    fields?: { uri?: string; image?: string },
  ): Promise<string> {
    const r = await this.enrichToken(mint, fields)
    return r.image
  }

  private async fetchMetadataJson(uri: string): Promise<ParsedTokenMetadata | null> {
    const gateways = [
      normalizeIpfsUrl(uri),
      uri.startsWith('ipfs://')
        ? `https://cloudflare-ipfs.com/ipfs/${uri.slice(7)}`
        : null,
    ].filter(Boolean) as string[]

    for (const url of gateways) {
      try {
        const { data } = await axios.get<Record<string, unknown>>(url, {
          timeout: 8000,
          headers: { Accept: 'application/json' },
        })
        return parseTokenMetadataJson(data)
      } catch {
        /* next gateway */
      }
    }
    this.logger.debug(`Metadata fetch failed for ${uri.slice(0, 48)}…`)
    return null
  }

  private async urlLooksLikeImage(url: string): Promise<boolean> {
    if (isDirectImageUrl(url)) return true
    try {
      const res = await axios.head(url, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
      })
      const ct = String(res.headers['content-type'] ?? '')
      if (ct.startsWith('image/') || ct.includes('octet-stream')) return true
    } catch {
      /* try GET below */
    }
    try {
      const res = await axios.get(url, {
        timeout: 6000,
        maxRedirects: 5,
        responseType: 'arraybuffer',
        maxContentLength: 4096,
        validateStatus: (s) => s < 400,
      })
      const buf = Buffer.from(res.data as ArrayBuffer)
      return buf.length > 8
    } catch {
      return false
    }
  }
}
