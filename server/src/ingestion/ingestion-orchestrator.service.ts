import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common'
import { DedupService } from './dedup.service'
import { EventBusService } from './event-bus.service'
import type { IngestionEvent } from './ingestion.types'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { EventSequencerService } from '../intelligence/event-sequencer.service'
import { IngestionHealthService } from './ingestion-health.service'
import { PostUpdateQueueService } from './post-update-queue.service'

@Injectable()
export class IngestionOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(IngestionOrchestratorService.name)
  private processed = 0
  private rejected = 0
  private handleErrors = 0

  constructor(
    private bus: EventBusService,
    private dedup: DedupService,
    private trading: TradingBridgeService,
    private sequencer: EventSequencerService,
    private postUpdateQueue: PostUpdateQueueService,
    @Optional() private ingestionHealth?: IngestionHealthService,
  ) {}

  onPostUpdate(handler: (mint: string, event: IngestionEvent) => void | Promise<void>) {
    this.postUpdateQueue.register(handler)
  }

  notifyPostUpdate(mint: string, event: IngestionEvent) {
    this.postUpdateQueue.schedule(mint, event)
  }

  onModuleInit() {
    this.logger.log('Ingestion orchestrator ready (trading state via ProcessingWorker)')
  }

  /** @deprecated Use IngestionWorkerService.emit */
  async processImmediate(event: IngestionEvent) {
    const key = `${event.source}:${event.type}:${event.id}`
    if (this.dedup.isDuplicate(key)) return
    this.bus.publishIngestion(event)
  }

  /** Secondary sources — Helius, pumpstream relay. */
  ingest(event: IngestionEvent) {
    const key = `${event.source}:${event.type}:${event.id}`
    if (this.dedup.isDuplicate(key)) return
    this.bus.publishIngestion(event)
    void this.bus.publishRemote(event).catch(() => undefined)
  }

  /** Trading-bridge state only — called from ProcessingWorker before scoring. */
  applyTradingState(event: IngestionEvent) {
    this.processed++
    const p = event.payload

    switch (event.type) {
      case 'token.launch':
        try {
          this.trading.ingestNewToken({
            mint: event.mint,
            symbol: p.symbol as string | undefined,
            name: p.name as string | undefined,
            vSolInBondingCurve: Number(p.vSolInBondingCurve ?? 0) || undefined,
            marketCapSol: Number(p.marketCapSol ?? 0) || undefined,
            traderPublicKey: p.traderPublicKey as string | undefined,
          })
        } catch (err) {
          this.logger.debug(`ingestNewToken: ${(err as Error).message}`)
        }
        break
      case 'token.trade': {
        const ts = Number(p.timestamp ?? p.timestampMs ?? 0)
        const timestampMs = ts > 0 ? (ts < 1e12 ? ts * 1000 : ts) : Date.now()
        const seq = this.sequencer.accept(event.mint, {
          slot: p.slot != null ? Number(p.slot) : undefined,
          timestampMs,
          signature: (p.signature as string) ?? undefined,
          sequenceId: this.sequencer.nextSequenceId(),
        })
        if (!seq.accept) {
          this.rejected++
          return
        }
        p.sequenceId = seq.sequenceId
        try {
          this.trading.ingestTrade({
            mint: event.mint,
            signature: p.signature as string | undefined,
            txType: (p.txType as 'buy' | 'sell') ?? undefined,
            solAmount: Number(p.solAmount ?? p.sol_amount ?? 0),
            tokenAmount: Number(p.tokenAmount ?? p.token_amount ?? 0),
            newTokenBalance:
              p.newTokenBalance != null ? Number(p.newTokenBalance) : undefined,
            traderPublicKey: (p.traderPublicKey ??
              p.trader ??
              p.user ??
              p.owner) as string | undefined,
            vSolInBondingCurve:
              Number(
                p.vSolInBondingCurve ?? p.virtualSolReserves ?? p.virtual_sol_reserves ?? 0,
              ) || undefined,
            marketCapSol: Number(p.marketCapSol ?? p.market_cap_sol ?? 0) || undefined,
            slot: p.slot as number | undefined,
            timestamp: timestampMs,
          })
        } catch (err) {
          this.logger.debug(`ingestTrade: ${(err as Error).message}`)
        }
        break
      }
      case 'token.migration':
        try {
          this.trading.ingestTrade({
            mint: event.mint,
            vSolInBondingCurve: Number(p.vSolInBondingCurve ?? 0) || undefined,
          })
        } catch (err) {
          this.logger.debug(`ingestMigration: ${(err as Error).message}`)
        }
        break
      default:
        break
    }
  }

  getStats() {
    return {
      processed: this.processed,
      rejected: this.rejected,
      handleErrors: this.handleErrors,
      postUpdate: this.postUpdateQueue.getStats(),
      bus: this.bus.getStats(),
    }
  }
}
