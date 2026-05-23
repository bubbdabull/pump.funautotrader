import type { DynamicsTradeInput } from './types'

const BUCKET_MS = 5_000
const BUCKET_COUNT = 12

export interface TradeBucket {
  startMs: number
  volumeSol: number
  buyVol: number
  sellVol: number
  buys: number
  sells: number
  tradeCount: number
  wallets: Set<string>
  liquidityEnd: number
  mcapEnd: number
}

export class TimeBucketRing {
  private readonly buckets: TradeBucket[] = []
  private cursor = 0

  constructor() {
    const now = Date.now()
    for (let i = 0; i < BUCKET_COUNT; i++) {
      this.buckets.push(this.emptyBucket(now - (BUCKET_COUNT - 1 - i) * BUCKET_MS))
    }
  }

  private emptyBucket(startMs: number): TradeBucket {
    return {
      startMs,
      volumeSol: 0,
      buyVol: 0,
      sellVol: 0,
      buys: 0,
      sells: 0,
      tradeCount: 0,
      wallets: new Set(),
      liquidityEnd: 0,
      mcapEnd: 0,
    }
  }

  private bucketIndex(ts: number): number {
    const now = Date.now()
    const ageMs = now - ts
    if (ageMs < 0 || ageMs >= BUCKET_COUNT * BUCKET_MS) return -1
    const slotsAgo = Math.floor(ageMs / BUCKET_MS)
    return (this.cursor - slotsAgo + BUCKET_COUNT) % BUCKET_COUNT
  }

  private advanceTo(now: number) {
    const latest = this.buckets[this.cursor]
    let t = latest.startMs + BUCKET_MS
    while (t + BUCKET_MS <= now) {
      this.cursor = (this.cursor + 1) % BUCKET_COUNT
      const b = this.buckets[this.cursor]
      b.startMs = t
      b.volumeSol = 0
      b.buyVol = 0
      b.sellVol = 0
      b.buys = 0
      b.sells = 0
      b.tradeCount = 0
      b.wallets.clear()
      b.liquidityEnd = latest.liquidityEnd
      b.mcapEnd = latest.mcapEnd
      t += BUCKET_MS
    }
  }

  ingest(trade: DynamicsTradeInput) {
    this.advanceTo(trade.timestampMs)
    let idx = this.bucketIndex(trade.timestampMs)
    if (idx < 0) {
      this.advanceTo(trade.timestampMs)
      idx = this.cursor
    }
    const b = this.buckets[idx]
    const sol = trade.solAmount
    b.volumeSol += sol
    b.tradeCount++
    if (trade.side === 'buy') {
      b.buyVol += sol
      b.buys++
    } else {
      b.sellVol += sol
      b.sells++
    }
    if (trade.wallet && trade.wallet !== 'unknown') b.wallets.add(trade.wallet)
    if (trade.liquiditySol != null && trade.liquiditySol > 0) b.liquidityEnd = trade.liquiditySol
    if (trade.marketCapUsd != null && trade.marketCapUsd > 0) b.mcapEnd = trade.marketCapUsd
  }

  /** Sum last `windowMs` using 5s buckets (no array scan of trades). */
  aggregate(windowMs: number, now = Date.now()): {
    volumeSol: number
    buyVol: number
    sellVol: number
    buys: number
    sells: number
    tradeCount: number
    uniqueWallets: number
    liquidityStart: number
    liquidityEnd: number
    mcapStart: number
    mcapEnd: number
  } {
    this.advanceTo(now)
    const slots = Math.min(BUCKET_COUNT, Math.max(1, Math.ceil(windowMs / BUCKET_MS)))
    const wallets = new Set<string>()
    let volumeSol = 0
    let buyVol = 0
    let sellVol = 0
    let buys = 0
    let sells = 0
    let tradeCount = 0
    let liquidityStart = 0
    let liquidityEnd = 0
    let mcapStart = 0
    let mcapEnd = 0

    for (let i = slots - 1; i >= 0; i--) {
      const idx = (this.cursor - i + BUCKET_COUNT) % BUCKET_COUNT
      const b = this.buckets[idx]
      if (now - b.startMs > windowMs + BUCKET_MS) continue
      volumeSol += b.volumeSol
      buyVol += b.buyVol
      sellVol += b.sellVol
      buys += b.buys
      sells += b.sells
      tradeCount += b.tradeCount
      for (const w of b.wallets) wallets.add(w)
      if (i === slots - 1) {
        liquidityStart = b.liquidityEnd || liquidityStart
        mcapStart = b.mcapEnd || mcapStart
      }
      if (i === 0) {
        liquidityEnd = b.liquidityEnd || liquidityEnd
        mcapEnd = b.mcapEnd || mcapEnd
      }
    }

    return {
      volumeSol,
      buyVol,
      sellVol,
      buys,
      sells,
      tradeCount,
      uniqueWallets: wallets.size,
      liquidityStart,
      liquidityEnd,
      mcapStart,
      mcapEnd,
    }
  }

  exportBuckets(): SerializedBucket[] {
    return this.buckets.map((b) => ({
      startMs: b.startMs,
      volumeSol: b.volumeSol,
      buyVol: b.buyVol,
      sellVol: b.sellVol,
      buys: b.buys,
      sells: b.sells,
      tradeCount: b.tradeCount,
      wallets: [...b.wallets],
      liquidityEnd: b.liquidityEnd,
      mcapEnd: b.mcapEnd,
    }))
  }

  getCursor(): number {
    return this.cursor
  }

  static fromSerialized(buckets: SerializedBucket[], cursor: number): TimeBucketRing {
    const ring = new TimeBucketRing()
    const internal = ring as unknown as {
      buckets: TradeBucket[]
      cursor: number
    }
    internal.cursor = cursor % Math.max(1, buckets.length || BUCKET_COUNT)
    internal.buckets = buckets.map((b) => ({
      startMs: b.startMs,
      volumeSol: b.volumeSol,
      buyVol: b.buyVol,
      sellVol: b.sellVol,
      buys: b.buys,
      sells: b.sells,
      tradeCount: b.tradeCount,
      wallets: new Set(b.wallets),
      liquidityEnd: b.liquidityEnd,
      mcapEnd: b.mcapEnd,
    }))
    return ring
  }
}

export interface SerializedBucket {
  startMs: number
  volumeSol: number
  buyVol: number
  sellVol: number
  buys: number
  sells: number
  tradeCount: number
  wallets: string[]
  liquidityEnd: number
  mcapEnd: number
}
