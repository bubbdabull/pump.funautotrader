import { Injectable } from '@nestjs/common'
import {
  computeDynamicsAnalytics,
  createMintDynamics,
  ingestDynamicsTrade,
  restoreMintDynamics,
  serializeMintDynamics,
  type DynamicsAnalytics,
  type DynamicsTradeInput,
  type MintDynamicsState,
  type SerializedMintDynamics,
} from '@phronis/trading'

@Injectable()
export class MarketDynamicsService {
  private readonly states = new Map<string, MintDynamicsState>()

  ensure(mint: string): MintDynamicsState {
    let s = this.states.get(mint)
    if (!s) {
      s = createMintDynamics(mint)
      this.states.set(mint, s)
    }
    return s
  }

  ingestTrade(
    mint: string,
    trade: DynamicsTradeInput,
    coordinationPenalty: number,
    coordinationFlags: string[],
  ): DynamicsAnalytics {
    const state = this.ensure(mint)
    return ingestDynamicsTrade(state, trade, coordinationPenalty, coordinationFlags)
  }

  getCoordinationFlags(mint: string): string[] {
    return this.states.get(mint)?.coordinationFlags ?? []
  }

  getAnalytics(mint: string, rugBlocked = false): DynamicsAnalytics | null {
    const state = this.states.get(mint)
    if (!state) return null
    return computeDynamicsAnalytics(state, rugBlocked)
  }

  setBondingCurve(mint: string, pct: number) {
    const state = this.ensure(mint)
    state.bondingCurvePercent = pct
  }

  getRankings(limit = 80): DynamicsAnalytics[] {
    const now = Date.now()
    const out: DynamicsAnalytics[] = []
    for (const state of this.states.values()) {
      const a = computeDynamicsAnalytics(state, false, now)
      if (a.tradeConfidenceScore > 0.05 && a.lifecycle !== 'DEAD' && a.lifecycle !== 'RUGGED') {
        out.push(a)
      }
    }
    return out.sort((a, b) => b.tradeConfidenceScore - a.tradeConfidenceScore).slice(0, limit)
  }

  get size(): number {
    return this.states.size
  }

  exportStates(limit = 400): SerializedMintDynamics[] {
    const ranked = [...this.states.values()]
      .sort((a, b) => b.lastTradeAt - a.lastTradeAt)
      .slice(0, limit)
    return ranked.map(serializeMintDynamics)
  }

  importStates(states: SerializedMintDynamics[]): number {
    let n = 0
    for (const row of states) {
      if (!row?.mint) continue
      this.states.set(row.mint, restoreMintDynamics(row))
      n++
    }
    return n
  }
}
