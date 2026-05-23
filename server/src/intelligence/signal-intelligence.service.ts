import { Injectable } from '@nestjs/common'
import {
  computeTokenIntelligence,
  evaluateIntelligenceAlerts,
  shouldEmitAlert,
  type IntelligenceInput,
  type TokenIntelligence,
  globalWalletTracker,
} from '@phronis/trading'
import type { DynamicsAnalytics } from '@phronis/trading'
import { TradingBridgeService } from '../trading/trading-bridge.service'
import type { FeedToken } from '../feed/feed.types'

const MAX_SCORE_HISTORY = 32

@Injectable()
export class SignalIntelligenceService {
  private readonly priorScores = new Map<string, number>()
  private readonly scoreHistory = new Map<string, number[]>()

  constructor(private trading: TradingBridgeService) {}

  enrichFeedToken(
    token: FeedToken,
    analytics?: DynamicsAnalytics | null,
  ): FeedToken & TokenIntelligence {
    const priorScore = this.priorScores.get(token.mint)
    const state = this.trading.getState(token.mint)
    const input: IntelligenceInput = {
      ...token,
      analytics: analytics ?? undefined,
      priorScore,
      launchedAt: token.launchedAt,
    }

    if (state?.trades?.length) {
      for (const t of state.trades.slice(-12)) {
        if (!t.wallet) continue
        const won = t.side === 'buy'
        globalWalletTracker.recordTrade(t.wallet, won ? 0.04 : -0.02, won)
      }
    }

    const intel = computeTokenIntelligence(input, {
      marketState: state ?? undefined,
      walletTracker: globalWalletTracker,
    })

    this.priorScores.set(token.mint, intel.score)
    const hist = this.scoreHistory.get(token.mint) ?? []
    hist.push(intel.score)
    if (hist.length > MAX_SCORE_HISTORY) hist.shift()
    this.scoreHistory.set(token.mint, hist)

    return {
      ...token,
      ...intel,
      signalScore: intel.score,
      momentumScore: token.momentumScore ?? Math.round(intel.score * 0.85),
    }
  }

  getScoreHistory(mint: string): number[] {
    return this.scoreHistory.get(mint) ?? []
  }

  evaluateAlerts(
    mint: string,
    intel: TokenIntelligence,
    tier: 'free' | 'pro' = 'pro',
  ) {
    return evaluateIntelligenceAlerts(mint, intel).filter((a) => shouldEmitAlert(a.type, tier))
  }
}
