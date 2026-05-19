import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  globalMarketState,
  evaluateEntry,
  finalizeEntryDecision,
  evScoreToSignalScore,
  momentumScoreFromMetrics,
  scoreFromStaticFields,
} from '@phronis/trading'
import type { NewTokenEvent, TradeStreamEvent, EntryDecision } from '@phronis/trading'

@Injectable()
export class TradingBridgeService implements OnModuleInit {
  private entryCallbacks: Array<(mint: string, decision: EntryDecision) => void> = []

  onModuleInit() {
    globalMarketState.onEntry((mint, decision) => {
      for (const cb of this.entryCallbacks) cb(mint, decision)
    })
  }

  onEntrySignal(cb: (mint: string, decision: EntryDecision) => void) {
    this.entryCallbacks.push(cb)
  }

  ingestNewToken(event: NewTokenEvent) {
    return globalMarketState.ingestNewToken(event)
  }

  ingestTrade(event: TradeStreamEvent) {
    return globalMarketState.ingestTrade(event)
  }

  scoreStatic(fields: Parameters<typeof scoreFromStaticFields>[0]) {
    return scoreFromStaticFields(fields)
  }

  getState(mint: string) {
    return globalMarketState.getState(mint)
  }

  evaluateMint(mint: string) {
    const state = globalMarketState.getState(mint)
    if (!state) return null
    return finalizeEntryDecision(evaluateEntry(state))
  }

  toLegacyScores(metrics: EntryDecision['metrics']) {
    return {
      signalScore: evScoreToSignalScore(metrics),
      momentumScore: momentumScoreFromMetrics(metrics),
    }
  }
}
