import { Injectable } from '@nestjs/common'
import { WalletBehaviorModel, type DynamicsTradeInput } from '@phronis/trading'

@Injectable()
export class WalletBehaviorAnalyzerService {
  private readonly model = new WalletBehaviorModel()

  observe(mint: string, trade: DynamicsTradeInput) {
    return this.model.observe(mint, trade)
  }

  releaseMint(mint: string) {
    this.model.pruneMint(mint)
  }
}
