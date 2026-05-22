import { Controller, Get, Header, Inject, forwardRef } from '@nestjs/common'
import { DataHealthService } from './data-health.service'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'

@Controller('data')
export class DataHealthController {
  constructor(
    private health: DataHealthService,
    @Inject(forwardRef(() => PumpPortalDataGateway))
    private pumpportal: PumpPortalDataGateway,
  ) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  async report() {
    return this.health.getReport(this.pumpportal.getStatus())
  }
}
