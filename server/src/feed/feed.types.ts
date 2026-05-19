/** Token shape returned by feed API (matches frontend PumpToken). */
export interface FeedToken {
  mint: string
  name: string
  symbol: string
  image: string
  marketCap: number
  bondingCurvePercent: number
  holders: number
  volume24h: number
  signalScore: number
  momentumScore: number
  whaleActivity: 'low' | 'medium' | 'high'
  launchedAt: string
  priceUsd: number
  priceChange24h: number
  liquidity: number
}

export interface FeedTrade {
  signature: string
  wallet: string
  side: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  timestamp: string
}

export interface FeedStats {
  activeTokens: number
  totalVolume24h: number
  totalMarketCap: number
  newTokensLastHour: number
  avgSignalScore: number
}
