import { Injectable } from '@nestjs/common'
import type { TokenLifecycleState } from '@phronis/trading'
import { MarketDynamicsService } from './market-dynamics.service'

@Injectable()
export class TokenLifecycleService {
  constructor(private dynamics: MarketDynamicsService) {}

  getState(mint: string): TokenLifecycleState {
    return this.dynamics.getAnalytics(mint)?.lifecycle ?? 'NEW'
  }
}
