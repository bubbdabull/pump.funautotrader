/** Never show raw mint as ticker/name in the scanner UI. */

export function looksLikeMintAddress(value?: string): boolean {
  if (!value?.trim()) return false
  const s = value.trim()
  return s.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s)
}

export function isValidTicker(symbol?: string, mint?: string): boolean {
  if (!symbol?.trim()) return false
  const s = symbol.trim()
  if (mint && s === mint) return false
  if (looksLikeMintAddress(s)) return false
  if (s.length > 14) return false
  if (/^unknown$/i.test(s)) return false
  return true
}

export function pickTokenSymbol(mint: string, ...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    if (isValidTicker(c, mint)) return c!.trim()
  }
  return '···'
}

export function pickTokenName(
  mint: string,
  symbol: string,
  ...candidates: (string | undefined)[]
): string {
  for (const c of candidates) {
    const n = c?.trim()
    if (!n || /^unknown$/i.test(n)) continue
    if (looksLikeMintAddress(n)) continue
    if (mint && n === mint) continue
    if (n === symbol) continue
    return n
  }
  return symbol && symbol !== '···' ? symbol : 'Token'
}

export function normalizeFeedTokenLabels(
  mint: string,
  fields?: { symbol?: string; name?: string },
): { symbol: string; name: string } {
  const symbol = pickTokenSymbol(mint, fields?.symbol)
  const name = pickTokenName(mint, symbol, fields?.name)
  return { symbol, name }
}
