import { Injectable, Logger } from '@nestjs/common'
import {
  marketCapUsdFromSol,
  bondingCurvePercentFromSol,
  type DynamicsAnalytics,
  type DynamicsTradeInput,
} from '@phronis/trading'
import type { IngestionEvent } from '../ingestion/ingestion.types'
import { WalletBehaviorAnalyzerService } from './wallet-behavior-analyzer.service'
import { MarketDynamicsService } from './market-dynamics.service'

@Injectable()
export class StreamIntelligenceService {
  private readonly logger = new Logger(StreamIntelligenceService.name)

  constructor(
    private walletAnalyzer: WalletBehaviorAnalyzerService,
    private dynamics: MarketDynamicsService,
  ) {}

  processEvent(
    mint: string,
    event: IngestionEvent,
  ): { accepted: boolean; analytics?: DynamicsAnalytics; reason?: string } {
    try {
      return this.processEventUnsafe(mint, event)
    } catch (err) {
      this.logger.debug(`processEvent ${mint.slice(0, 8)}: ${(err as Error).message}`)
      return { accepted: false, reason: 'processor_error' }
    }
  }

  private processEventUnsafe(
    mint: string,
    event: IngestionEvent,
  ): { accepted: boolean; analytics?: DynamicsAnalytics; reason?: string } {
    if (event.type === 'token.migration') {
      this.dynamics.setBondingCurve(mint, 100)
      const analytics = this.dynamics.getAnalytics(mint)
      return { accepted: true, analytics: analytics ?? undefined }
    }

    if (event.type === 'token.launch') {
      const p = event.payload
      const vSol = Number(p.vSolInBondingCurve ?? 0)
      if (vSol > 0) {
        this.dynamics.setBondingCurve(mint, bondingCurvePercentFromSol(vSol))
      }
      return { accepted: true, analytics: this.dynamics.getAnalytics(mint) ?? undefined }
    }

    if (event.type !== 'token.trade') {
      return { accepted: true }
    }

    const trade = this.toDynamicsTrade(event)
    if (!trade) return { accepted: false, reason: 'invalid_trade' }

    const coordination = this.walletAnalyzer.observe(mint, trade)
    const analytics = this.dynamics.ingestTrade(
      mint,
      trade,
      coordination.penalty,
      coordination.flags,
    )
    return { accepted: true, analytics }
  }

  private toDynamicsTrade(event: IngestionEvent): DynamicsTradeInput | null {
    const p = event.payload
    const rawTs = Number(p.timestamp ?? p.timestampMs ?? event.receivedAt)
    const timestampMs = rawTs > 0 ? (rawTs < 1e12 ? rawTs * 1000 : rawTs) : event.receivedAt
    const solAmount = Number(p.solAmount ?? p.sol_amount ?? 0)
    const tokenAmount = Number(p.tokenAmount ?? p.token_amount ?? 0)
    if (solAmount <= 0 && tokenAmount <= 0) return null

    const vSol = Number(
      p.vSolInBondingCurve ?? p.virtualSolReserves ?? p.virtual_sol_reserves ?? 0,
    )
    const mcapSol = Number(p.marketCapSol ?? p.market_cap_sol ?? 0)

    return {
      signature: String(p.signature ?? event.id),
      wallet: String(
        p.traderPublicKey ?? p.trader ?? p.user ?? p.owner ?? 'unknown',
      ),
      side: p.txType === 'sell' ? 'sell' : 'buy',
      solAmount,
      tokenAmount,
      timestampMs,
      slot: p.slot != null ? Number(p.slot) : undefined,
      sequenceId: Number(event.payload.sequenceId ?? 0),
      marketCapUsd: mcapSol > 0 ? marketCapUsdFromSol(mcapSol) : undefined,
      liquiditySol: vSol > 0 ? vSol : undefined,
      bondingCurvePercent: vSol > 0 ? bondingCurvePercentFromSol(vSol) : undefined,
    }
  }
}
