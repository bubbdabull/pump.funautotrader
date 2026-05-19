import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import {
  isLikelyMetadataUri,
  normalizeIpfsUrl,
  resolveTokenImage,
  resolveTokenImageCandidates,
} from '@phronis/trading'

@Injectable()
export class TokenMetadataService {
  private readonly logger = new Logger(TokenMetadataService.name)
  private readonly imageCache = new Map<string, string>()

  getCached(mint: string): string | undefined {
    return this.imageCache.get(mint)
  }

  resolveSync(mint: string, fields?: { uri?: string; image?: string }): string {
    const cached = this.imageCache.get(mint)
    if (cached) return cached
    const img = resolveTokenImage(mint, fields)
    this.imageCache.set(mint, img)
    return img
  }

  /** Fetch image URL from IPFS metadata JSON when uri points to metadata. */
  async enrichImage(
    mint: string,
    fields?: { uri?: string; image?: string },
  ): Promise<string> {
    const cached = this.imageCache.get(mint)
    if (cached) return cached

    if (fields?.uri && isLikelyMetadataUri(fields.uri)) {
      const fromMeta = await this.fetchImageFromMetadata(fields.uri)
      if (fromMeta) {
        this.imageCache.set(mint, fromMeta)
        return fromMeta
      }
    }

    if (fields?.uri && !isLikelyMetadataUri(fields.uri)) {
      const direct = normalizeIpfsUrl(fields.uri)
      if (await this.urlLooksLikeImage(direct)) {
        this.imageCache.set(mint, direct)
        return direct
      }
    }

    for (const candidate of resolveTokenImageCandidates(mint, fields)) {
      if (isLikelyMetadataUri(candidate)) continue
      if (await this.urlLooksLikeImage(candidate)) {
        this.imageCache.set(mint, candidate)
        return candidate
      }
    }

    const fallback = resolveTokenImage(mint, fields)
    this.imageCache.set(mint, fallback)
    return fallback
  }

  private async fetchImageFromMetadata(uri: string): Promise<string | null> {
    try {
      const url = normalizeIpfsUrl(uri)
      const { data } = await axios.get<Record<string, unknown>>(url, { timeout: 8000 })
      const image =
        (data.image as string) ||
        (data.image_uri as string) ||
        (data.imageUri as string) ||
        null
      if (!image) return null
      const resolved = normalizeIpfsUrl(image)
      return (await this.urlLooksLikeImage(resolved)) ? resolved : null
    } catch (err) {
      this.logger.debug(`Metadata fetch failed: ${(err as Error).message}`)
      return null
    }
  }

  private async urlLooksLikeImage(url: string): Promise<boolean> {
    try {
      const res = await axios.head(url, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
      })
      const ct = String(res.headers['content-type'] ?? '')
      return ct.startsWith('image/') || ct.includes('octet-stream')
    } catch {
      return false
    }
  }
}
