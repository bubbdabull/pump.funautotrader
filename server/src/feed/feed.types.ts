/** Token shape returned by feed API (matches frontend PumpToken). */
export interface FeedToken {
  mint: string
  name: string
  symbol: string
  image: string
  /** IPFS / metadata URI from PumpPortal (for image resolution) */
  metadataUri?: string
  twitter?: string
  telegram?: string
  website?: string
  marketCap: number
  bondingCurvePercent: number
  holders: number
  /** True after Helius/Bubblemaps holder snapshot */
  holdersVerified?: boolean
  volume24h: number
  signalScore: number
  momentumScore: number
  whaleActivity: 'low' | 'medium' | 'high'
  launchedAt: string
  priceUsd: number
  priceChange24h: number
  liquidity: number
  /** Ms since epoch — last trade tick in memory */
  lastTradeAt?: number
  trades1m?: number
  volume5mSol?: number
  /** 0–100 buy share in last 60s */
  buyPressure1m?: number
  /** Market cap % change over ~5m from live ticks */
  mcapChange5m?: number
  /** Trade in the last 60s */
  isActive?: boolean
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
