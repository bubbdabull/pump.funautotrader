import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

export interface PumpCoin {
  mint: string
  name: string
  symbol: string
  image_uri?: string
  metadata_uri?: string
  twitter?: string
  telegram?: string
  website?: string
  usd_market_cap?: number
  market_cap?: number
  complete?: boolean
  created_timestamp?: number
  last_trade_timestamp?: number
  last_trade_timestamp_ms?: number
  virtual_sol_reserves?: number
  virtual_token_reserves?: number
  usd_24h_volume?: number
  holder_count?: number
  reply_count?: number
  price_change_24h?: number
  total_supply?: number
  bonding_curve?: string
  associated_bonding_curve?: string
  creator?: string
}

import {
  PUMP_FUN_SCAN_PAGE_SIZE,
  PUMP_FUN_SCAN_PAGES_PER_SORT,
  PUMP_FUN_SCAN_TARGET,
  PUMP_FEATURED_FETCH_LIMIT,
  PUMP_NEAR_GRAD_LIMIT,
} from '@phronis/trading'

const V3_BASE = 'https://frontend-api-v3.pump.fun'

@Injectable()
export class PumpService {
  private readonly logger = new Logger(PumpService.name)
  private readonly baseUrls: string[]

  constructor(private config: ConfigService) {
    const primary = this.config.get('PUMP_FUN_API_URL') || V3_BASE
    this.baseUrls = [primary, V3_BASE, 'https://frontend-api.pump.fun'].filter(
      (v, i, a) => a.indexOf(v) === i,
    )
  }

  private headers() {
    return {
      Accept: 'application/json',
      Origin: 'https://pump.fun',
      Referer: 'https://pump.fun/',
      'User-Agent': 'PhronisTrader/1.0',
    }
  }

  async fetchCoins(options?: {
    limit?: number
    sort?: string
    order?: 'ASC' | 'DESC'
    offset?: number
  }): Promise<PumpCoin[]> {
    const limit = options?.limit ?? 50
    const sort = options?.sort ?? 'created_timestamp'
    const order = options?.order ?? 'DESC'
    const offset = options?.offset ?? 0

    for (const baseUrl of this.baseUrls) {
      try {
        const { data } = await axios.get<PumpCoin[] | { coins?: PumpCoin[] }>(
          `${baseUrl.replace(/\/$/, '')}/coins`,
          {
            params: { limit, offset, sort, order, includeNsfw: false },
            timeout: 20000,
            headers: this.headers(),
          },
        )
        const list = Array.isArray(data) ? data : (data?.coins ?? [])
        if (list.length > 0) {
          this.logger.log(
            `Pump.fun: ${list.length} coins (${sort} offset ${options?.offset ?? 0}) from ${baseUrl}`,
          )
          return list
        }
      } catch (err) {
        this.logger.debug(`Pump.fun ${baseUrl}/coins: ${(err as Error).message}`)
      }
    }
    return []
  }

  /** Tokens with recent on-chain trades (best bootstrap for live scanner). */
  async fetchActiveTradingCoins(limit = 80): Promise<PumpCoin[]> {
    const broad = await this.fetchBroadMarketScan(limit)
    if (broad.length > 0) return broad.slice(0, limit)
    const batch = await this.fetchCoins({
      limit: Math.min(150, limit * 2),
      sort: 'last_trade_timestamp',
      order: 'DESC',
    })
    const active = batch.filter((c) => !c.complete)
    if (active.length > 0) {
      this.logger.log(`Pump.fun: ${active.length} recently traded coins`)
      return active.slice(0, limit)
    }
    return []
  }

  private mergePumpCoin(prev: PumpCoin, next: PumpCoin): PumpCoin {
    return {
      ...prev,
      ...next,
      name: next.name || prev.name,
      symbol: next.symbol || prev.symbol,
      image_uri: next.image_uri || prev.image_uri,
      metadata_uri: next.metadata_uri || prev.metadata_uri,
      twitter: next.twitter || prev.twitter,
      telegram: next.telegram || prev.telegram,
      website: next.website || prev.website,
      usd_market_cap: Math.max(prev.usd_market_cap ?? 0, next.usd_market_cap ?? 0),
      market_cap: Math.max(prev.market_cap ?? 0, next.market_cap ?? 0),
      usd_24h_volume: Math.max(prev.usd_24h_volume ?? 0, next.usd_24h_volume ?? 0),
      holder_count: Math.max(prev.holder_count ?? 0, next.holder_count ?? 0),
      reply_count: Math.max(prev.reply_count ?? 0, next.reply_count ?? 0),
      virtual_sol_reserves: Math.max(
        prev.virtual_sol_reserves ?? 0,
        next.virtual_sol_reserves ?? 0,
      ),
      last_trade_timestamp: Math.max(
        prev.last_trade_timestamp ?? 0,
        next.last_trade_timestamp ?? 0,
      ),
      last_trade_timestamp_ms: Math.max(
        prev.last_trade_timestamp_ms ?? 0,
        next.last_trade_timestamp_ms ?? 0,
      ),
    }
  }

  /**
   * Paginated multi-sort scan — thousands of active pump.fun coins per cycle.
   */
  async fetchBroadMarketScan(target = PUMP_FUN_SCAN_TARGET): Promise<PumpCoin[]> {
    const goal = Math.max(100, target)
    const pageSize = PUMP_FUN_SCAN_PAGE_SIZE
    const byMint = new Map<string, PumpCoin>()

    const add = (list: PumpCoin[]): boolean => {
      for (const c of list) {
        if (!c?.mint || c.mint.length < 32) continue
        if (c.complete) continue
        const prev = byMint.get(c.mint)
        byMint.set(c.mint, prev ? this.mergePumpCoin(prev, c) : c)
        if (byMint.size >= goal) return true
      }
      return byMint.size >= goal
    }

    const sorts = [
      'last_trade_timestamp',
      'created_timestamp',
      'market_cap',
      'reply_count',
    ] as const

    for (const sort of sorts) {
      let emptyStreak = 0
      for (let page = 0; page < PUMP_FUN_SCAN_PAGES_PER_SORT && byMint.size < goal; page++) {
        const batch = await this.fetchCoins({
          limit: pageSize,
          offset: page * pageSize,
          sort,
          order: 'DESC',
        })
        if (!batch.length) {
          emptyStreak++
          if (emptyStreak >= 2) break
          continue
        }
        emptyStreak = 0
        if (add(batch.filter((c) => !c.complete))) break
        await this.delay(60)
      }
      if (byMint.size >= goal) break
    }

    for (const path of ['/coins/latest', '/coins/king-of-the-hill']) {
      if (byMint.size >= goal) break
      for (const baseUrl of this.baseUrls) {
        try {
          const { data } = await axios.get<PumpCoin[] | { coins?: PumpCoin[] }>(
            `${baseUrl.replace(/\/$/, '')}${path}`,
            {
              params: { limit: PUMP_FEATURED_FETCH_LIMIT, includeNsfw: false },
              timeout: 15000,
              headers: this.headers(),
            },
          )
          const list = Array.isArray(data) ? data : (data?.coins ?? [])
          add(list.filter((c) => !c.complete))
          if (list.length > 0) break
        } catch {
          /* next */
        }
      }
    }

    const out = [...byMint.values()]
    this.logger.log(
      `Pump.fun broad scan: ${out.length} unique active coins (target ${goal})`,
    )
    return out
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  async fetchLatestCoins(limit = 50): Promise<PumpCoin[]> {
    const active = await this.fetchActiveTradingCoins(limit)
    if (active.length >= 10) return active

    const fresh = await this.fetchCoins({ limit, sort: 'created_timestamp', order: 'DESC' })
    if (fresh.length > 0) return fresh

    for (const baseUrl of this.baseUrls) {
      for (const path of ['/coins/latest', '/coins/king-of-the-hill']) {
        try {
          const { data } = await axios.get<PumpCoin[] | { coins?: PumpCoin[] }>(
            `${baseUrl.replace(/\/$/, '')}${path}`,
            {
              params: { limit, includeNsfw: false },
              timeout: 12000,
              headers: this.headers(),
            },
          )
          const list = Array.isArray(data) ? data : (data?.coins ?? [])
          if (list.length > 0) {
            this.logger.log(`Pump.fun: ${list.length} coins from ${baseUrl}${path}`)
            return list
          }
        } catch (err) {
          this.logger.debug(`Pump.fun ${baseUrl}${path}: ${(err as Error).message}`)
        }
      }
    }

    this.logger.warn('Pump.fun REST unavailable — feed relies on PumpPortal WebSocket')
    return []
  }

  /** Active bonding-curve tokens sorted by fill % (highest first). */
  async fetchNearGraduation(limit = PUMP_NEAR_GRAD_LIMIT): Promise<PumpCoin[]> {
    const batch = await this.fetchCoins({
      limit: Math.max(limit * 2, 150),
      sort: 'last_trade_timestamp',
      order: 'DESC',
    })
    const active = batch.filter((c) => !c.complete)
    active.sort(
      (a, b) => this.calculateBondingPercent(b) - this.calculateBondingPercent(a),
    )
    return active.slice(0, limit)
  }

  async getCoin(mint: string): Promise<PumpCoin | null> {
    for (const baseUrl of this.baseUrls) {
      try {
        const { data } = await axios.get<PumpCoin>(
          `${baseUrl.replace(/\/$/, '')}/coins/${mint}`,
          {
            timeout: 10000,
            headers: this.headers(),
          },
        )
        if (data?.mint) return data
      } catch {
        /* try next */
      }
    }
    return null
  }

  calculateBondingPercent(coin: PumpCoin): number {
    if (coin.complete) return 100
    const sol = coin.virtual_sol_reserves ?? 0
    const target = 85 * 1e9
    if (target <= 0) return 0
    return Math.min(100, Math.round((sol / target) * 100))
  }

  solReservesToLiquidity(solLamports: number): number {
    return solLamports / 1e9
  }

  lastTradeMs(coin: PumpCoin): number | undefined {
    const raw = coin.last_trade_timestamp_ms ?? coin.last_trade_timestamp
    if (raw == null || !Number.isFinite(Number(raw))) return undefined
    const n = Number(raw)
    return n < 1e12 ? n * 1000 : n
  }
}
