import { Controller, Get, Header, Param, Post, Query } from '@nestjs/common'
import { TokensService } from './tokens.service'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'
import type { ScannerLane } from '@phronis/trading'

function parseChartIntervalMs(raw?: string): number {
  if (!raw) return 5_000
  const presets: Record<string, number> = {
    '1s': 1_000,
    '5s': 5_000,
    '15s': 15_000,
    '1m': 60_000,
  }
  if (presets[raw]) return presets[raw]
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 1_000 && n <= 60_000) return Math.round(n)
  return 5_000
}

@Controller('tokens')
export class TokensController {
  constructor(
    private tokens: TokensService,
    private pumpportal: PumpPortalDataGateway,
  ) {}

  @Get('feed')
  @Header('Cache-Control', 'no-store')
  feed(@Query('lane') lane?: ScannerLane) {
    return this.tokens.getFeed(lane ?? 'tradeable')
  }

  @Get('graduating')
  @Header('Cache-Control', 'no-store')
  graduating() {
    return this.tokens.getGraduatingFeed()
  }

  @Get('stats')
  stats() {
    return this.tokens.getStats()
  }

  @Get()
  list(@Query('lane') lane?: ScannerLane) {
    return this.tokens.getFeed(lane ?? 'tradeable')
  }

  @Get(':mint/chart')
  @Header('Cache-Control', 'no-store')
  chart(@Param('mint') mint: string, @Query('interval') interval?: string) {
    this.pumpportal.ensureTradeSubscription(mint)
    const status = this.pumpportal.getStatus()
    return {
      ...this.tokens.getChartSeries(mint, parseChartIntervalMs(interval)),
      tradeStreamSubscribed: this.pumpportal.isTradeSubscribed(mint),
      pumpportalKeyConfigured: status.apiKeyConfigured,
    }
  }

  @Post(':mint/watch-trades')
  watchTrades(@Param('mint') mint: string) {
    const sub = this.pumpportal.ensureTradeSubscription(mint)
    return {
      mint,
      ...sub,
      tradeCount: this.tokens.getChartSeries(mint).tradeCount,
    }
  }

  @Get(':mint/trades')
  trades(@Param('mint') mint: string) {
    return this.tokens.getTrades(mint)
  }

  @Get(':mint')
  get(@Param('mint') mint: string) {
    return this.tokens.getToken(mint)
  }
}
