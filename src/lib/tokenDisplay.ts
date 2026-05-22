export {
  looksLikeMintAddress,
  isValidTicker,
  pickTokenSymbol,
  pickTokenName,
  normalizeFeedTokenLabels,
} from '@trading'

import { pickTokenName, pickTokenSymbol } from '@trading'

export function displayTokenSymbol(
  token: { mint: string; symbol?: string; name?: string },
): string {
  return pickTokenSymbol(token.mint, token.symbol, token.name)
}

export function displayTokenName(
  token: { mint: string; symbol?: string; name?: string },
): string {
  const symbol = displayTokenSymbol(token)
  return pickTokenName(token.mint, symbol, token.name)
}
