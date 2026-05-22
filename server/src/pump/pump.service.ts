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
            timeout: 12000,
            headers: this.headers(),
          },
        )
        const list = Array.isArray(data) ? data : (data?.coins ?? [])
        if (list.length > 0) {
          this.logger.log(`Pump.fun: ${list.length} coins (${sort}) from ${baseUrl}`)
          return list
        }
      } catch (err) {
        this.logger.debug(`Pump.fun ${baseUrl}/coins: ${(err as Error).message}`)
      }
    }
    return []
  }

  async fetchLatestCoins(limit = 50): Promise<PumpCoin[]> {
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
  async fetchNearGraduation(limit = 40): Promise<PumpCoin[]> {
    const batch = await this.fetchCoins({ limit: 120, sort: 'last_trade_timestamp', order: 'DESC' })
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
}
