import { Injectable } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'
import { REDIS_KEYS } from '../redis/redis-keys'
import { PumpPortalDataGateway } from '../pumpportal/pumpportal-data.gateway'
import type { PumpPortalStatusSnapshot } from './data-health.service'

type LeaderStatusCache = PumpPortalStatusSnapshot & {
  at?: string
}

@Injectable()
export class PumpPortalStatusResolver {
  constructor(
    private redis: RedisService,
    private pumpportal: PumpPortalDataGateway,
  ) {}

  async resolve(): Promise<PumpPortalStatusSnapshot> {
    const local = this.pumpportal.getHealth()
    const base: PumpPortalStatusSnapshot = {
      connected: local.connected,
      apiKeyConfigured: local.apiKeyConfigured,
      tradeSubscriptionsEnabled: local.tradeSubscriptionsEnabled,
      maxTradeSubscriptions: local.maxTradeSubscriptions,
      subscribedTradeMints: local.subscribedTradeMints,
      pendingTradeSubscriptions: local.pendingTradeSubscriptions,
      pinnedPriorityMints: local.pinnedPriorityMints,
      liveFeedCount: local.liveFeedCount,
      messagesReceived: local.messagesReceived,
      tradeMessagesReceived: local.tradeMessagesReceived,
      lastMessageAt: local.lastMessageAt,
      lastTradeSubRotationAt: local.lastTradeSubRotationAt,
      ingestionLeader: local.ingestionLeader,
      leaderId: local.leaderId ?? null,
      streamEpoch: local.streamEpoch,
    }

    if (local.ingestionLeader) return base

    const raw = await this.redis.get(REDIS_KEYS.pumpportalStatus)
    if (!raw) return base

    try {
      const leader = JSON.parse(raw) as LeaderStatusCache
      return {
        ...base,
        leaderConnected: leader.connected,
        leaderSubscribedTradeMints: leader.subscribedTradeMints,
        leaderId: leader.leaderId ?? base.leaderId,
        streamEpoch: leader.streamEpoch ?? base.streamEpoch,
        connected: leader.connected || base.connected,
        subscribedTradeMints: Math.max(
          base.subscribedTradeMints,
          leader.subscribedTradeMints ?? 0,
        ),
        tradeMessagesReceived: Math.max(
          base.tradeMessagesReceived ?? 0,
          leader.tradeMessagesReceived ?? 0,
        ),
        messagesReceived: Math.max(
          base.messagesReceived,
          leader.messagesReceived ?? 0,
        ),
        lastMessageAt: leader.lastMessageAt ?? base.lastMessageAt,
        lastTradeSubRotationAt:
          leader.lastTradeSubRotationAt ?? base.lastTradeSubRotationAt,
        pendingTradeSubscriptions: leader.pendingTradeSubscriptions,
        liveFeedCount: Math.max(base.liveFeedCount, leader.liveFeedCount ?? 0),
      }
    } catch {
      return base
    }
  }
}
