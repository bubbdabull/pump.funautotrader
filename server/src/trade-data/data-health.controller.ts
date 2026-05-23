import { Controller, Get, Header } from '@nestjs/common'
import { DataHealthService } from './data-health.service'
import { PumpPortalStatusResolver } from './pumpportal-status.resolver'

@Controller('data')
export class DataHealthController {
  constructor(
    private health: DataHealthService,
    private pumpStatus: PumpPortalStatusResolver,
  ) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  async report() {
    return this.health.getReport(await this.pumpStatus.resolve())
  }
}
