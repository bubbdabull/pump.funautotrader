import { Controller, Get, Param } from '@nestjs/common'
import { TokensService } from './tokens.service'

@Controller('tokens')
export class TokensController {
  constructor(private tokens: TokensService) {}

  @Get('feed')
  feed() {
    return this.tokens.getFeed()
  }

  @Get('stats')
  stats() {
    return this.tokens.getStats()
  }

  @Get()
  list() {
    return this.tokens.getFeed()
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
