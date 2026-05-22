import { Controller, Get, Header, Param, Query } from '@nestjs/common'
import { TokensService } from './tokens.service'
import type { ScannerLane } from '@phronis/trading'

@Controller('tokens')
export class TokensController {
  constructor(private tokens: TokensService) {}

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
  chart(@Param('mint') mint: string) {
    return this.tokens.getChartSeries(mint)
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
