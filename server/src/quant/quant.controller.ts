import { Controller, Get, Param } from '@nestjs/common'
import { QuantEngineService } from './quant-engine.service'

@Controller('quant')
export class QuantController {
  constructor(private quant: QuantEngineService) {}

  @Get('rankings')
  rankings() {
    return this.quant.getRankings(100)
  }

  @Get('analyze/:mint')
  analyze(@Param('mint') mint: string) {
    return this.quant.analyzeMint(mint) ?? { error: 'no_market_state' }
  }
}
