import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { DedupService } from './dedup.service'
import { EventBusService } from './event-bus.service'
import type { IngestionEvent } from './ingestion.types'
import { TradingBridgeService } from '../trading/trading-bridge.service'

@Injectable()
export class IngestionOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(IngestionOrchestratorService.name)
  private processed = 0
  private readonly postUpdateHandlers: Array<(mint: string, event: IngestionEvent) => void | Promise<void>> =
    []

  constructor(
    private bus: EventBusService,
    private dedup: DedupService,
    private trading: TradingBridgeService,
  ) {}

  onModuleInit() {
    this.bus.subscribe((ev) => this.handle(ev))
    this.logger.log('Ingestion orchestrator ready')
  }

  onPostUpdate(handler: (mint: string, event: IngestionEvent) => void | Promise<void>) {
    this.postUpdateHandlers.push(handler)
  }

  /** Hot path: apply immediately (PumpPortal gateway). */
  async processImmediate(event: IngestionEvent) {
    const key = `${event.source}:${event.type}:${event.id}`
    if (this.dedup.isDuplicate(key)) return
    await this.handle(event)
  }

  /** Secondary sources + fan-out: queue + optional Redis. */
  async ingest(event: IngestionEvent) {
    const key = `${event.source}:${event.type}:${event.id}`
    if (this.dedup.isDuplicate(key)) return
    await this.bus.publish(event)
  }

  private async handle(event: IngestionEvent) {
    this.processed++
    const p = event.payload

    switch (event.type) {
      case 'token.launch':
        this.trading.ingestNewToken({
          mint: event.mint,
          symbol: p.symbol as string | undefined,
          name: p.name as string | undefined,
          vSolInBondingCurve: Number(p.vSolInBondingCurve ?? 0) || undefined,
          marketCapSol: Number(p.marketCapSol ?? 0) || undefined,
          traderPublicKey: p.traderPublicKey as string | undefined,
        })
        break
      case 'token.trade':
        this.trading.ingestTrade({
          mint: event.mint,
          signature: p.signature as string | undefined,
          txType: (p.txType as 'buy' | 'sell') ?? undefined,
          solAmount: Number(p.solAmount ?? 0),
          tokenAmount: Number(p.tokenAmount ?? 0),
          traderPublicKey: p.traderPublicKey as string | undefined,
          vSolInBondingCurve: Number(p.vSolInBondingCurve ?? 0) || undefined,
          marketCapSol: Number(p.marketCapSol ?? 0) || undefined,
          slot: p.slot as number | undefined,
        })
        break
      case 'token.migration':
        this.trading.ingestTrade({
          mint: event.mint,
          vSolInBondingCurve: Number(p.vSolInBondingCurve ?? 0) || undefined,
        })
        break
      default:
        break
    }

    for (const h of this.postUpdateHandlers) {
      try {
        await h(event.mint, event)
      } catch {
        /* non-fatal */
      }
    }
  }

  getStats() {
    return {
      processed: this.processed,
      bus: this.bus.getStats(),
    }
  }
}
