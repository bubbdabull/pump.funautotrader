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

    try {
      await this.$connect()
      this.logger.log('Database connected (Prisma)')
    } catch (err) {
      const message = (err as Error).message
      if (process.env.DATABASE_OPTIONAL === 'true') {
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
