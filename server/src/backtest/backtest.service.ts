import { Injectable } from '@nestjs/common'
import { replayStrategyBacktest, type ReplayEvent } from '@phronis/trading'

@Injectable()
export class BacktestService {
  run(events: ReplayEvent[], options?: { latencyMs?: number; slippagePct?: number }) {
    return replayStrategyBacktest(events, options)
  }
}
