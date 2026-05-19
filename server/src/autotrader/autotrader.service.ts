import { Injectable, Logger } from '@nestjs/common'
import type { PumpPortalNewTokenEvent } from '../pumpportal/pumpportal.types'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import type { EntryDecision } from '@phronis/trading'

export interface AutoTradeRules {
  enabled: boolean
  buyAmountSol: number
  slippage: number
  priorityFee: number
  pool: string
  snipeNewTokens: boolean
  minBondingCurve: number
  maxBondingCurve: number
  maxMarketCapUsd: number
  maxSignalScore: number
  autoSellTakeProfitPct?: number
  autoSellStopLossPct?: number
}

export interface AutoTradeSignal {
  mint: string
  symbol?: string
  name?: string
  reason: string
  bondingCurvePercent: number
  marketCap: number
  signalScore: number
  evScore: number
  positionSizeSol: number
  timestamp: string
}

@Injectable()
export class AutoTraderService {
  private readonly logger = new Logger(AutoTraderService.name)
  private rules: AutoTradeRules = {
    enabled: false,
    buyAmountSol: 0.1,
    slippage: 10,
    priorityFee: 0.0001,
    pool: 'auto',
    snipeNewTokens: true,
    minBondingCurve: 5,
    maxBondingCurve: 35,
    maxMarketCapUsd: 150_000,
    maxSignalScore: 28,
  }

  private recentSignals: AutoTradeSignal[] = []
  private signaledMints = new Set<string>()

  constructor(private trading: TradingBridgeService) {
    this.trading.onEntrySignal((mint, decision) => {
      if (!this.rules.enabled) return
      const state = this.trading.getState(mint)
      const signal = this.buildSignalFromDecision(mint, decision, {
        mint,
        symbol: state?.symbol,
        name: state?.name,
        vSolInBondingCurve: state?.liquidity,
        marketCapSol: (state?.marketCapUsd ?? 0) / 200,
      } as PumpPortalNewTokenEvent)
      if (signal && this.passesLegacyRules(signal)) {
        this.emitSignal(signal)
      }
    })
  }

  getRules(): AutoTradeRules {
    return { ...this.rules }
  }

  setRules(rules: Partial<AutoTradeRules>): AutoTradeRules {
    this.rules = { ...this.rules, ...rules }
    return this.getRules()
  }

  getSignals(limit = 50): AutoTradeSignal[] {
    return this.recentSignals.slice(0, limit)
  }

  /** Seed market state; entry fires on subsequent trade ticks via EV engine. */
  evaluateNewToken(
    event: PumpPortalNewTokenEvent,
    _legacyScores?: { signalScore: number; momentumScore: number },
  ): AutoTradeSignal | null {
    if (!this.rules.enabled || !this.rules.snipeNewTokens) return null

    this.trading.ingestNewToken({
      mint: event.mint,
      symbol: event.symbol,
      name: event.name,
      vSolInBondingCurve: event.vSolInBondingCurve,
      vTokensInBondingCurve: event.vTokensInBondingCurve,
      marketCapSol: event.marketCapSol,
      traderPublicKey: event.traderPublicKey,
    })

    const decision = this.trading.evaluateMint(event.mint)
    if (!decision?.allowed) return null

    const signal = this.buildSignalFromDecision(event.mint, decision, event)
    if (!signal || !this.passesLegacyRules(signal)) return null
    return this.emitSignal(signal)
  }

  ingestTradeEvent(event: {
    mint: string
    txType?: string
    solAmount?: number
    tokenAmount?: number
    traderPublicKey?: string
    signature?: string
    vSolInBondingCurve?: number
    marketCapSol?: number
  }) {
    this.trading.ingestTrade({
      mint: event.mint,
      txType: event.txType === 'sell' ? 'sell' : 'buy',
      solAmount: event.solAmount,
      tokenAmount: event.tokenAmount,
      traderPublicKey: event.traderPublicKey,
      signature: event.signature,
      vSolInBondingCurve: event.vSolInBondingCurve,
      marketCapSol: event.marketCapSol,
    })
  }

  private buildSignalFromDecision(
    mint: string,
    decision: EntryDecision,
    event?: PumpPortalNewTokenEvent,
  ): AutoTradeSignal | null {
    const legacy = this.trading.toLegacyScores(decision.metrics)
    const sol = event?.vSolInBondingCurve ?? event?.marketCapSol ?? 0
    const curve = Math.min(99, Math.round((Number(sol) / 85) * 100))
    const { mqi, lsi, rrm, sis } = decision.metrics.components

    return {
      mint,
      symbol: event?.symbol,
      name: event?.name,
      reason: `EV=${decision.metrics.evScore.toFixed(2)} MQI=${mqi.toFixed(2)} LSI=${lsi.toFixed(2)} RRM=${rrm.toFixed(2)} SIS=${sis.toFixed(2)}`,
      bondingCurvePercent: curve,
      marketCap: (Number(event?.marketCapSol) ?? 0) * 200,
      signalScore: legacy.signalScore,
      evScore: decision.metrics.evScore,
      positionSizeSol: decision.positionSizeSol || this.rules.buyAmountSol,
      timestamp: new Date().toISOString(),
    }
  }

  private passesLegacyRules(signal: AutoTradeSignal): boolean {
    if (signal.bondingCurvePercent < this.rules.minBondingCurve) return false
    if (signal.bondingCurvePercent > this.rules.maxBondingCurve) return false
    if (signal.marketCap > this.rules.maxMarketCapUsd) return false
    if (signal.signalScore > this.rules.maxSignalScore) return false
    return true
  }

  private emitSignal(signal: AutoTradeSignal): AutoTradeSignal {
    if (this.signaledMints.has(signal.mint)) return signal
    this.signaledMints.add(signal.mint)
    this.recentSignals.unshift(signal)
    this.recentSignals = this.recentSignals.slice(0, 100)
    this.logger.log(
      `EV entry signal: ${signal.mint} EV=${signal.evScore.toFixed(2)} size=${signal.positionSizeSol} SOL`,
    )
    return signal
  }
}
