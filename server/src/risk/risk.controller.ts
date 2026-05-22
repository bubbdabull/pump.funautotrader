import { Body, Controller, Get, Put } from '@nestjs/common'
import { globalRiskManager, type GlobalRiskConfig } from '@phronis/trading'

@Controller('risk')
export class RiskController {
  @Get('state')
  state() {
    return {
      config: globalRiskManager.getConfig(),
      state: globalRiskManager.getState(),
    }
  }

  @Put('config')
  config(@Body() body: Partial<GlobalRiskConfig>) {
    globalRiskManager.updateConfig(body)
    return globalRiskManager.getConfig()
  }
}
