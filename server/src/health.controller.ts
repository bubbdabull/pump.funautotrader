import { Controller, Get, Optional } from '@nestjs/common'
import { resolveBootRole } from './process-role'
import { IngestionLeaderService } from './ingestion/ingestion-leader.service'

/**
 * Fly liveness probe — must stay sub-10ms and never block on PumpPortal/Redis/scoring.
 * Use GET /api/pumpportal/ingestion-health for pipeline diagnostics.
 */
@Controller()
export class HealthController {
  constructor(@Optional() private ingestionLeader?: IngestionLeaderService) {}

  @Get('health')
  health() {
    return {
      ok: true,
      service: 'phronis-api',
      at: new Date().toISOString(),
      processRole: resolveBootRole(),
      flyProcessGroup: process.env.FLY_PROCESS_GROUP,
      leader: this.ingestionLeader?.isIngestionLeader() ?? null,
    }
  }
}
