import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IngestionOrchestratorService } from '../ingestion-orchestrator.service'

/**
 * Helius webhook → ingestion bus.
 * Configure HELIUS_WEBHOOK_PATH; POST payloads from Helius enhanced transactions.
 */
@Injectable()
export class HeliusIngestSource implements OnModuleInit {
  private readonly logger = new Logger(HeliusIngestSource.name)

  constructor(
    private config: ConfigService,
    private ingestion: IngestionOrchestratorService,
  ) {}

  onModuleInit() {
    if (this.config.get('HELIUS_API_KEY')?.trim()) {
      this.logger.log('Helius ingest ready (webhook → /api/helius/webhook)')
    }
  }

  async ingestWebhookPayload(payload: unknown) {
    const items = Array.isArray(payload) ? payload : [payload]
    for (const item of items) {
      const row = item as Record<string, unknown>
      const events = (row.tokenTransfers ?? row.events) as unknown[] | undefined
      if (!Array.isArray(events)) continue

      for (const ev of events) {
        const e = ev as Record<string, unknown>
        const mint = (e.mint ?? e.tokenAddress) as string | undefined
        if (!mint || mint.length < 32) continue
        await this.ingestion.ingest({
          id: (e.signature as string) ?? `${mint}-${Date.now()}`,
          source: 'helius',
          type: 'token.trade',
          mint,
          payload: e,
          receivedAt: Date.now(),
        })
      }
    }
  }
}
