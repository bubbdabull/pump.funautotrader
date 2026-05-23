import { Controller, Get } from '@nestjs/common'

/**
 * Fly liveness probe — pure in-memory, never awaits Redis/PumpPortal/registry.
 * Pipeline diagnostics: GET /api/pumpportal/ingestion-health
 */
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      ok: true,
      uptime: process.uptime(),
      timestamp: Date.now(),
    }
  }
}
