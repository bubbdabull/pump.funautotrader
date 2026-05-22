import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PumpPortalNewTokenEvent } from '../pumpportal/pumpportal.types'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import { EventsGateway } from '../events/events.gateway'
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
  /** Mints that must keep PumpPortal trade streams (signals + open interest). */
  private readonly pinnedTradeMints = new Set<string>()

  constructor(
    private trading: TradingBridgeService,
    config: ConfigService,
    @Inject(forwardRef(() => EventsGateway))
    private events: EventsGateway,
  ) {
    const enabled = config.get('AUTOTRADER_ENABLED')
    if (enabled === 'true' || enabled === '1') {
      this.rules.enabled = true
      this.logger.log('Autotrader enabled via AUTOTRADER_ENABLED')
    }
  }

  /** Called on every trade tick — primary signal path (needs ≥3 trades for EV). */
  onTradeTick(mint: string) {
    if (!this.rules.enabled) return
    const state = this.trading.getState(mint)
    if (!state || state.trades.length < 3) return

    const decision = this.trading.evaluateMint(mint, 'snipe')
    if (!decision?.allowed) return

    const signal = this.buildSignalFromDecision(mint, decision, {
      mint,
      symbol: state.symbol,
      name: state.name,
      vSolInBondingCurve: state.liquidity,
      marketCapSol: state.marketCapUsd / 200,
      vTokensInBondingCurve: undefined,
    } as PumpPortalNewTokenEvent)
    if (!signal || !this.passesLegacyRules(signal)) return
    this.pinTradeStream(mint)
    this.emitSignal(signal)
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

  getDiagnostics() {
    const states = [...this.pinnedTradeMints].map((mint) => {
      const s = this.trading.getState(mint)
      const decision = s ? this.trading.evaluateMint(mint, 'snipe') : null
      return {
        mint,
        tradeCount: s?.trades.length ?? 0,
        evScore: decision?.metrics.evScore,
        allowed: decision?.allowed,
        blockReasons: decision?.blockReasons,
      }
    })
    return {
      enabled: this.rules.enabled,
      pinnedMints: this.pinnedTradeMints.size,
      recentSignals: this.recentSignals.length,
      sample: states.slice(0, 15),
    }
  }

  /** Mints to prioritize for PumpPortal `subscribeTokenTrade`. */
  getPriorityMints(): string[] {
    return [...this.pinnedTradeMints]
  }

  pinTradeStream(mint: string) {
    this.pinnedTradeMints.add(mint)
    if (this.pinnedTradeMints.size > 80) {
      const drop = [...this.pinnedTradeMints].slice(0, this.pinnedTradeMints.size - 80)
      for (const m of drop) this.pinnedTradeMints.delete(m)
    }
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

    const decision = this.trading.evaluateMint(event.mint, 'snipe')
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
    const state = this.trading.getState(mint)
    const sol = event?.vSolInBondingCurve ?? event?.marketCapSol ?? state?.liquidity ?? 0
    const curve =
      state?.bondingCurvePercent ??
      Math.min(99, Math.round((Number(sol) / 85) * 100))
    const marketCap =
      state?.marketCapUsd ?? (Number(event?.marketCapSol) ?? 0) * 200
    const { mqi, lsi, rrm, sis } = decision.metrics.components

    return {
      mint,
      symbol: event?.symbol ?? state?.symbol,
      name: event?.name ?? state?.name,
      reason: `EV=${decision.metrics.evScore.toFixed(2)} MQI=${mqi.toFixed(2)} LSI=${lsi.toFixed(2)} RRM=${rrm.toFixed(2)} SIS=${sis.toFixed(2)}`,
      bondingCurvePercent: curve,
      marketCap,
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
    this.pinTradeStream(signal.mint)
    this.recentSignals.unshift(signal)
    this.recentSignals = this.recentSignals.slice(0, 100)
    this.logger.log(
      `EV entry signal: ${signal.mint} EV=${signal.evScore.toFixed(2)} size=${signal.positionSizeSol} SOL`,
    )
    this.events.server?.emit('autotrader:signal', signal)
    return signal
  }
}
