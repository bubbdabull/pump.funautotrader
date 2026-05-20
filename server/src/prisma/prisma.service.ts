import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  /** False when DATABASE_OPTIONAL=true and connection failed */
  enabled = true

  async onModuleInit() {
    if (process.env.USE_SUPABASE_REST_DB === 'true') {
      this.enabled = false
      this.logger.log('Prisma skipped — using Supabase REST (service role)')
      return
    }

    const dbUrl = process.env.DATABASE_URL?.trim()
    if (!dbUrl || dbUrl.includes('@127.0.0.1:5432/noop')) {
      this.enabled = false
      this.logger.warn('DATABASE_URL not configured — Prisma disabled (set USE_SUPABASE_REST_DB=true or DATABASE_URL)')
      return
    }

    try {
      await this.$connect()
      this.logger.log('Database connected (Prisma)')
    } catch (err) {
      const message = (err as Error).message
      const optional =
        process.env.DATABASE_OPTIONAL === 'true' || process.env.NODE_ENV === 'production'
      if (optional) {
        this.enabled = false
        this.logger.warn(
          `Database offline — live feed works; alerts/history persistence disabled. ${message}`,
        )
        return
      }
      throw err
    }
  }

  async onModuleDestroy() {
    if (this.enabled) await this.$disconnect()
  }
}
