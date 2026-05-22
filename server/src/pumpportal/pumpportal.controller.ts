import { Body, Controller, Get, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { PumpPortalService } from './pumpportal.service'
import { PumpPortalDataGateway } from './pumpportal-data.gateway'
import { PumpFeedSyncService } from '../tokens/pump-feed-sync.service'
import type { PumpPortalTradeRequest } from './pumpportal.types'

@Controller('pumpportal')
export class PumpPortalController {
  constructor(
    private pumpportal: PumpPortalService,
    private dataGateway: PumpPortalDataGateway,
    private pumpSync: PumpFeedSyncService,
  ) {}

  @Get('status')
  status() {
    return {
      ...this.dataGateway.getStatus(),
      pumpFunSync: this.pumpSync.getStatus(),
    }
  }

  @Post('trade-local')
  async tradeLocal(@Body() body: PumpPortalTradeRequest, @Res() res: Response) {
    const tx = await this.pumpportal.buildTradeTransaction(body)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(tx)
  }
}
