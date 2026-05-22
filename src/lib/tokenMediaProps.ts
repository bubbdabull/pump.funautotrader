import type { PumpToken } from '@/types'

/** Consistent props for TokenImage across the app. */
export function tokenMediaProps(
  token: Pick<PumpToken, 'mint' | 'symbol' | 'image' | 'metadataUri'>,
) {
  return {
    mint: token.mint,
    symbol: token.symbol,
    image: token.image,
    uri: token.metadataUri,
  }
}
