import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common'
import { DedupService } from './dedup.service'
import { EventBusService } from './event-bus.service'
import type { IngestionEvent } from './ingestion.types'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { EventSequencerService } from '../intelligence/event-sequencer.service'
import { IngestionHealthService } from './ingestion-health.service'
import { INGESTION_HOT_QUEUE_MAX } from '@phronis/trading'
import { PostUpdateQueueService } from './post-update-queue.service'

@Injectable()
export class IngestionOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(IngestionOrchestratorService.name)
  private processed = 0
  private rejected = 0
  private queueOverflow = 0
  private handleErrors = 0
  private readonly hotQueue: IngestionEvent[] = []
  private hotDraining = false
  constructor(
    private bus: EventBusService,
    private dedup: DedupService,
    private trading: TradingBridgeService,
    private sequencer: EventSequencerService,
    private postUpdateQueue: PostUpdateQueueService,
    @Optional() private ingestionHealth?: IngestionHealthService,
  ) {}

  onModuleInit() {
    this.bus.subscribe((ev) => void this.safeHandle(ev, 'bus'))
    this.logger.log('Ingestion orchestrator ready')
  }

  onPostUpdate(handler: (mint: string, event: IngestionEvent) => void | Promise<void>) {
    this.postUpdateQueue.register(handler)
  }

  /** Hot path: bounded queue + microtask drain (PumpPortal gateway). */
  async processImmediate(event: IngestionEvent) {
    const key = `${event.source}:${event.type}:${event.id}`
    if (this.dedup.isDuplicate(key)) return

    if (this.hotQueue.length >= INGESTION_HOT_QUEUE_MAX) {
      this.hotQueue.shift()
      this.queueOverflow++
    }
    this.hotQueue.push(event)
    if (!this.hotDraining) void this.drainHotQueue()
  }

  private drainHotQueue() {
    this.hotDraining = true
    const batch = this.hotQueue.splice(0, 48)
    for (const ev of batch) {
      void this.safeHandle(ev, 'hot')
    }
    if (this.hotQueue.length > 0) {
      setImmediate(() => this.drainHotQueue())
    } else {
      this.hotDraining = false
    }
  }

  /** Secondary sources + fan-out: queue + optional Redis. */
  async ingest(event: IngestionEvent) {
    const key = `${event.source}:${event.type}:${event.id}`
    if (this.dedup.isDuplicate(key)) return
    await this.bus.publish(event)
  }

  private async safeHandle(event: IngestionEvent, lane: 'hot' | 'bus') {
    try {
      await this.handle(event)
    } catch (err) {
      this.handleErrors++
      this.ingestionHealth?.recordProcessError(err)
      this.logger.debug(
        `Ingestion handle error (${lane}/${event.type}/${event.mint?.slice(0, 8) ?? '?'}): ${(err as Error).message}`,
      )
    }
  }

  private async handle(event: IngestionEvent) {
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

    this.postUpdateQueue.schedule(event.mint, event)
  }

  getStats() {
    return {
      processed: this.processed,
      rejected: this.rejected,
      queueOverflow: this.queueOverflow,
      handleErrors: this.handleErrors,
      hotQueueDepth: this.hotQueue.length,
      hotDraining: this.hotDraining,
      postUpdate: this.postUpdateQueue.getStats(),
      bus: this.bus.getStats(),
    }
  }
}
