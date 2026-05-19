import { Body, Controller, Get, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { PumpPortalService } from './pumpportal.service'
import { PumpPortalDataGateway } from './pumpportal-data.gateway'
import type { PumpPortalTradeRequest } from './pumpportal.types'

@Controller('pumpportal')
export class PumpPortalController {
  constructor(
    private pumpportal: PumpPortalService,
    private dataGateway: PumpPortalDataGateway,
  ) {}

  @Get('status')
  status() {
    return this.dataGateway.getStatus()
  }

  @Post('trade-local')
  async tradeLocal(@Body() body: PumpPortalTradeRequest, @Res() res: Response) {
    const tx = await this.pumpportal.buildTradeTransaction(body)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(tx)
  }
}
