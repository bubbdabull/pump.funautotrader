import { Controller, Get, Param, Query } from '@nestjs/common'
import { TokensService } from './tokens.service'
import type { ScannerLane } from '@phronis/trading'

@Controller('tokens')
export class TokensController {
  constructor(private tokens: TokensService) {}

  @Get('feed')
  feed(@Query('lane') lane?: ScannerLane) {
    return this.tokens.getFeed(lane ?? 'alpha')
  }

  @Get('graduating')
  graduating() {
    return this.tokens.getGraduatingFeed()
  }

  @Get('stats')
  stats() {
    return this.tokens.getStats()
  }

  @Get()
  list(@Query('lane') lane?: ScannerLane) {
    return this.tokens.getFeed(lane ?? 'alpha')
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
