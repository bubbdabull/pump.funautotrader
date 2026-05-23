import { Body, Controller, Post } from '@nestjs/common'
import { HeliusService } from '../helius/helius.service'
import { HeliusIngestSource } from './sources/helius-ingest.source'

/** Lives in IngestionModule to avoid HeliusModule ↔ IngestionModule circular imports. */
@Controller('helius')
export class HeliusWebhookController {
  constructor(
    private helius: HeliusService,
    private heliusIngest: HeliusIngestSource,
  ) {}

  @Post('webhook')
  async webhook(@Body() body: unknown) {
    await this.heliusIngest.ingestWebhookPayload(body)
    return this.helius.handleWebhook(body)
  }
}
