import { Body, Controller, Get, Put } from '@nestjs/common'
import { AutoTraderService, type AutoTradeRules } from './autotrader.service'

@Controller('autotrader')
export class AutoTraderController {
  constructor(private autoTrader: AutoTraderService) {}

  @Get('rules')
  getRules() {
    return this.autoTrader.getRules()
  }

  @Put('rules')
  setRules(@Body() body: Partial<AutoTradeRules>) {
    return this.autoTrader.setRules(body)
  }

  @Get('signals')
  getSignals() {
    return this.autoTrader.getSignals()
  }

  @Get('diagnostics')
  diagnostics() {
    return this.autoTrader.getDiagnostics()
  }
}
