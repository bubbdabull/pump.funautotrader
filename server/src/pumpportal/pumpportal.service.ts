import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import type { PumpPortalTradeRequest } from './pumpportal.types'
import { TradingBridgeService } from '../trading/trading-bridge.service'

@Injectable()
export class PumpPortalService {
  private readonly logger = new Logger(PumpPortalService.name)
  private readonly tradeUrl: string

  constructor(
    private config: ConfigService,
    private trading: TradingBridgeService,
  ) {
    this.tradeUrl =
      this.config.get('PUMPPORTAL_TRADE_URL') || 'https://pumpportal.fun/api/trade-local'
  }

  async buildTradeTransaction(req: PumpPortalTradeRequest): Promise<Buffer> {
    try {
      const { data, status } = await axios.post<ArrayBuffer>(this.tradeUrl, req, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      })

      if (status !== 200) {
        const text = Buffer.from(data).toString('utf8')
        this.logger.warn(`PumpPortal trade-local ${status}: ${text}`)
        throw new HttpException(
          text || `PumpPortal returned ${status}`,
          status >= 400 ? status : HttpStatus.BAD_GATEWAY,
        )
      }

      return Buffer.from(data)
    } catch (err) {
      if (err instanceof HttpException) throw err
      this.logger.error(`PumpPortal request failed: ${(err as Error).message}`)
      throw new HttpException('PumpPortal trade build failed', HttpStatus.BAD_GATEWAY)
    }
  }

  /** Probabilistic edge model scores (replaces ruleBasedSignal). */
  ruleBasedSignal(token: {
    mint?: string
    bondingCurvePercent: number
    marketCap: number
    volume24h: number
    holders: number
  }): { signalScore: number; momentumScore: number } {
    const mint = token.mint ?? 'static'
    const live = this.trading.evaluateMint(mint)
    if (live) {
      return this.trading.toLegacyScores(live.metrics)
    }
    return this.trading.scoreStatic({
      mint,
      bondingCurvePercent: token.bondingCurvePercent,
      marketCap: token.marketCap,
      volume24h: token.volume24h,
      holders: token.holders,
    })
  }
}
