import { Controller, Get } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SupabaseDbService } from './supabase/supabase-db.service'

@Controller()
export class HealthController {
  constructor(
    private config: ConfigService,
    private supabase: SupabaseDbService,
  ) {}

  @Get('health')
  health() {
    const keyConfigured = Boolean(
      this.config.get('SUPABASE_URL')?.trim() &&
        this.config.get('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
    )
    return {
      ok: true,
      service: 'phronis-api',
      at: new Date().toISOString(),
      supabase: this.supabase.enabled,
      supabaseKeyConfigured: keyConfigured,
      pumpportalKey: Boolean(this.config.get('PUMPPORTAL_API_KEY')?.trim()),
      supabaseRest: process.env.USE_SUPABASE_REST_DB === 'true',
      redisDisabled: process.env.REDIS_DISABLED === 'true',
    }
  }
}
