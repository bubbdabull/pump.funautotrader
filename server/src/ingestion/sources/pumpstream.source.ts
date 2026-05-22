import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import WebSocket from 'ws'
import { IngestionOrchestratorService } from '../ingestion-orchestrator.service'
import type { IngestionEvent } from '../ingestion.types'

/** Optional PumpStream-compatible feed (configure PUMPSTREAM_WS_URL). */
@Injectable()
export class PumpStreamSource implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PumpStreamSource.name)
  private ws: WebSocket | null = null
  private reconnectTimer?: NodeJS.Timeout
  private enabled = false

  constructor(
    private config: ConfigService,
    private ingestion: IngestionOrchestratorService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('PUMPSTREAM_WS_URL')?.trim()
    if (!url) return
    this.enabled = true
    this.connect(url)
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }

  getStatus() {
    return { enabled: this.enabled, connected: this.ws?.readyState === WebSocket.OPEN }
  }

  private connect(url: string) {
    this.ws = new WebSocket(url)
    this.ws.on('open', () => this.logger.log('PumpStream WS connected'))
    this.ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as Record<string, unknown>
        void this.handle(data)
      } catch {
        /* ignore */
      }
    })
    this.ws.on('close', () => {
      this.reconnectTimer = setTimeout(() => this.connect(url), 8000)
    })
  }

  private async handle(data: Record<string, unknown>) {
    const mint = (data.mint ?? data.tokenMint) as string | undefined
    if (!mint || mint.length < 32) return

    const txType = String(data.txType ?? data.type ?? '').toLowerCase()
    let type: IngestionEvent['type'] = 'token.trade'
    if (txType === 'create' || txType === 'new') type = 'token.launch'
    if (txType === 'migrate' || txType === 'migration') type = 'token.migration'

    await this.ingestion.ingest({
      id: (data.signature as string) ?? `${mint}-${Date.now()}`,
      source: 'pumpstream',
      type,
      mint,
      payload: data,
      receivedAt: Date.now(),
    })
  }
}
