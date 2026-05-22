import type {
  TokenMarketState,
  NewTokenEvent,
  TradeStreamEvent,
  EntryDecision,
  PositionContext,
} from '../types'
import type { OnChainHolderSnapshot } from '../types/onChainHolders'
import {
  evaluateEntry,
  evScoreToSignalScore,
  momentumScoreFromMetrics,
} from '../decision/evEngine'
import { computeQuantitativeScores } from '../quantitative/scores'
import { bestStrategySignal } from '../strategies/engine'
import { finalizeEntryDecision } from '../execution/positionSizer'
import { evaluateExit } from '../execution/exitEngine'
import {
  bondingCurvePercentFromSol,
  marketCapUsdFromSol,
  normalizeVirtualSol,
} from '../utils/tokenMedia'

type EntryListener = (mint: string, decision: EntryDecision) => void
type ExitListener = (mint: string, decision: ReturnType<typeof evaluateExit>) => void
type UpdateListener = (mint: string, state: TokenMarketState) => void
type StrategyListener = (mint: string, signal: NonNullable<ReturnType<typeof bestStrategySignal>>) => void

export class MarketStateManager {
  private readonly states = new Map<string, TokenMarketState>()
  private readonly positions = new Map<string, PositionContext>()
  private entryListeners = new Set<EntryListener>()
  private exitListeners = new Set<ExitListener>()
  private updateListeners = new Set<UpdateListener>()
  private strategyListeners = new Set<StrategyListener>()

  getState(mint: string): TokenMarketState | undefined {
    return this.states.get(mint)
  }

  patchOnChainHolders(mint: string, snapshot: OnChainHolderSnapshot) {
    const state = this.states.get(mint)
    if (!state) return
    state.onChainHolders = snapshot
    state.lastUpdated = Date.now()
    this.states.set(mint, state)
    this.recompute(mint)
  }

  addExcludeWallets(mint: string, wallets: string[]) {
    const state = this.states.get(mint)
    if (!state) return
    const set = new Set(state.excludeWallets ?? [])
    for (const w of wallets) if (w) set.add(w)
    state.excludeWallets = [...set]
    this.states.set(mint, state)
  }

  onEntry(listener: EntryListener) {
    this.entryListeners.add(listener)
    return () => this.entryListeners.delete(listener)
  }

  onExit(listener: ExitListener) {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  onUpdate(listener: UpdateListener) {
    this.updateListeners.add(listener)
    return () => this.updateListeners.delete(listener)
  }

  onStrategySignal(listener: StrategyListener) {
    this.strategyListeners.add(listener)
    return () => this.strategyListeners.delete(listener)
  }

  getQuantScores(mint: string) {
    const state = this.states.get(mint)
    if (!state) return null
    return computeQuantitativeScores(state)
  }

  ingestNewToken(event: NewTokenEvent): TokenMarketState {
    const now = Date.now()
    const vSol = normalizeVirtualSol(
      Number(event.vSolInBondingCurve ?? event.marketCapSol ?? 0),
    )
    const mcSol = normalizeVirtualSol(Number(event.marketCapSol ?? 0))
    const curve = bondingCurvePercentFromSol(vSol || mcSol)

    const state: TokenMarketState = {
      mint: event.mint,
      symbol: event.symbol,
      name: event.name,
      createdAt: now,
      bondingCurvePercent: curve,
      marketCapUsd: marketCapUsdFromSol(mcSol || vSol),
      liquidity: vSol,
      liquidityHistory: [
        {
          virtualSolReserves: vSol,
          virtualTokenReserves: Number(event.vTokensInBondingCurve ?? 0),
          marketCapSol: mcSol,
          timestamp: now,
        },
      ],
      trades: [],
      walletBalances: new Map(),
      walletBuySol: new Map(),
      deployerWallet: event.traderPublicKey,
      lastUpdated: now,
    }

    this.states.set(event.mint, state)
    this.recompute(event.mint)
    return state
  }

  ingestTrade(event: TradeStreamEvent): TokenMarketState | null {
    let state = this.states.get(event.mint)
    if (!state) {
      state = this.ingestNewToken({
        mint: event.mint,
        vSolInBondingCurve: event.vSolInBondingCurve,
        marketCapSol: event.marketCapSol,
      })
    }

    const now = Date.now()
    const side = event.txType === 'sell' ? 'sell' : 'buy'
    const sol = Number(event.solAmount ?? 0)
    const tokens = Number(event.tokenAmount ?? 0)
    const wallet = event.traderPublicKey ?? 'unknown'

    if (sol > 0 || tokens > 0) {
      state.trades.push({
        signature: event.signature ?? `${now}-${state.trades.length}`,
        wallet,
        side,
        solAmount: sol,
        tokenAmount: tokens,
        timestamp: now,
        slot: event.slot,
      })
      if (state.trades.length > 500) state.trades.shift()

      const bal = state.walletBalances.get(wallet) ?? 0
      const delta = side === 'buy' ? tokens : -tokens
      state.walletBalances.set(wallet, Math.max(0, bal + delta))

      if (side === 'buy' && sol > 0) {
        state.walletBuySol.set(wallet, (state.walletBuySol.get(wallet) ?? 0) + sol)
      }
    }

    if (event.vSolInBondingCurve != null) {
      const vSol = normalizeVirtualSol(Number(event.vSolInBondingCurve))
      state.liquidity = vSol
      state.liquidityHistory.push({
        virtualSolReserves: vSol,
        virtualTokenReserves: 0,
        marketCapSol: normalizeVirtualSol(Number(event.marketCapSol ?? 0)),
        timestamp: now,
      })
      if (state.liquidityHistory.length > 120) state.liquidityHistory.shift()
      state.bondingCurvePercent = bondingCurvePercentFromSol(vSol)
    }

    if (event.marketCapSol != null) {
      state.marketCapUsd = marketCapUsdFromSol(Number(event.marketCapSol))
    }

    state.lastUpdated = now
    this.states.set(event.mint, state)
    this.recompute(event.mint)
    return state
  }

  registerPosition(mint: string, entrySol: number, entryEvScore: number) {
    this.positions.set(mint, {
      mint,
      entrySol,
      entryEvScore,
      entryTimestamp: Date.now(),
      peakEvScore: entryEvScore,
    })
  }

  clearPosition(mint: string) {
    this.positions.delete(mint)
  }

  private recompute(mint: string) {
    const state = this.states.get(mint)
    if (!state) return

    for (const fn of this.updateListeners) fn(mint, state)

    const entry = finalizeEntryDecision(evaluateEntry(state))
    if (entry.allowed) {
      for (const fn of this.entryListeners) fn(mint, entry)
    }

    const strat = bestStrategySignal(state)
    if (strat) {
      for (const fn of this.strategyListeners) fn(mint, strat)
    }

    const pos = this.positions.get(mint)
    if (pos) {
      const metrics = entry.metrics
      pos.peakEvScore = Math.max(pos.peakEvScore, metrics.evScore)
      const exit = evaluateExit(state, pos)
      if (exit.shouldExit) {
        for (const fn of this.exitListeners) fn(mint, exit)
      }
    }
  }

  /** Scores for API / feed compatibility */
  scoreToken(mint: string): { signalScore: number; momentumScore: number } | null {
    const state = this.states.get(mint)
    if (!state) return null
    const metrics = evaluateEntry(state).metrics
    return {
      signalScore: evScoreToSignalScore(metrics),
      momentumScore: momentumScoreFromMetrics(metrics),
    }
  }
}

export const globalMarketState = new MarketStateManager()
