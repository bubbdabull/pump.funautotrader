import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

export interface PumpCoin {
  mint: string
  name: string
  symbol: string
  image_uri?: string
  usd_market_cap?: number
  complete?: boolean
  created_timestamp?: number
  virtual_sol_reserves?: number
  virtual_token_reserves?: number
  usd_24h_volume?: number
  holder_count?: number
  price_change_24h?: number
  total_supply?: number
}

const API_PATHS = ['/coins/latest', '/coins/king-of-the-hill']

@Injectable()
export class PumpService {
  private readonly logger = new Logger(PumpService.name)
  private readonly baseUrls: string[]

  constructor(private config: ConfigService) {
    const primary = this.config.get('PUMP_FUN_API_URL') || 'https://frontend-api.pump.fun'
    this.baseUrls = [
      primary,
      'https://frontend-api.pump.fun',
      'https://advanced-api.pump.fun',
    ].filter((v, i, a) => a.indexOf(v) === i)
  }

  async fetchLatestCoins(limit = 50): Promise<PumpCoin[]> {
    for (const baseUrl of this.baseUrls) {
      for (const path of API_PATHS) {
        try {
          const { data } = await axios.get<PumpCoin[] | { coins?: PumpCoin[] }>(
            `${baseUrl}${path}`,
            {
              params: { limit, includeNsfw: false },
              timeout: 12000,
              headers: {
                Accept: 'application/json',
                'User-Agent': 'PhronisTrader/1.0',
              },
            },
          )
          const list = Array.isArray(data) ? data : (data?.coins ?? [])
          if (list.length > 0) {
            this.logger.log(`Pump.fun: ${list.length} coins from ${baseUrl}${path}`)
            return list
          }
        } catch (err) {
          this.logger.debug(
            `Pump.fun ${baseUrl}${path}: ${(err as Error).message}`,
          )
        }
      }
    }
    this.logger.warn('Pump.fun REST unavailable — feed relies on PumpPortal WebSocket')
    return []
  }

  async getCoin(mint: string): Promise<PumpCoin | null> {
    for (const baseUrl of this.baseUrls) {
      try {
        const { data } = await axios.get<PumpCoin>(`${baseUrl}/coins/${mint}`, {
          timeout: 10000,
          headers: { Accept: 'application/json', 'User-Agent': 'PhronisTrader/1.0' },
        })
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
    return Math.min(99, Math.round((sol / target) * 100))
  }

  solReservesToLiquidity(solLamports: number): number {
    return solLamports / 1e9
  }
}
