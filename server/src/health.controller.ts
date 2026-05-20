import { Controller, Get } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Controller()
export class HealthController {
  constructor(private config: ConfigService) {}

  @Get('health')
  health() {
    return {
      ok: true,
      service: 'phronis-api',
      at: new Date().toISOString(),
      supabase: Boolean(
        this.config.get('SUPABASE_URL')?.trim() &&
          this.config.get('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
      ),
      pumpportalKey: Boolean(this.config.get('PUMPPORTAL_API_KEY')?.trim()),
      supabaseRest: process.env.USE_SUPABASE_REST_DB === 'true',
      redisDisabled: process.env.REDIS_DISABLED === 'true',
    }
  }
}
