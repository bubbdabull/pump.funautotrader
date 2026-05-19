import { Body, Controller, Post } from '@nestjs/common'
import { TradeService } from './trade.service'
import type { PumpPortalPool } from '../pumpportal/pumpportal.types'

@Controller('trade')
export class TradeController {
  constructor(private trade: TradeService) {}

  @Post('build')
  build(
    @Body()
    body: {
      publicKey: string
      action: 'buy' | 'sell'
      mint: string
      amountSol: number
      slippage: number
      priorityFee: number
      pool?: PumpPortalPool
      sellPercent?: string
    },
  ) {
    return this.trade.buildTransaction(body)
  }

  @Post('record')
  record(
    @Body()
    body: {
      mint: string
      side: 'buy' | 'sell'
      amountSol: number
      wallet: string
      txSig?: string
    },
  ) {
    return this.trade.recordTrade(body)
  }
}
