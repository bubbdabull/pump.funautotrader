import { Controller, Get } from '@nestjs/common'

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { ok: true, service: 'phronis-api', at: new Date().toISOString() }
  }
}
