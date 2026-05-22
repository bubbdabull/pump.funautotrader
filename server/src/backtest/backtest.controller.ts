import { Body, Controller, Post } from '@nestjs/common'
import { BacktestService } from './backtest.service'
import type { ReplayEvent } from '@phronis/trading'

@Controller('backtest')
export class BacktestController {
  constructor(private backtest: BacktestService) {}

  @Post('replay')
  replay(@Body() body: { events: ReplayEvent[]; latencyMs?: number; slippagePct?: number }) {
    return this.backtest.run(body.events ?? [], {
      latencyMs: body.latencyMs,
      slippagePct: body.slippagePct,
    })
  }
}
