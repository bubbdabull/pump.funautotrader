import { Body, Controller, Post } from '@nestjs/common'
import { HeliusService } from './helius.service'
import { HeliusIngestSource } from '../ingestion/sources/helius-ingest.source'

@Controller('helius')
export class HeliusController {
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
