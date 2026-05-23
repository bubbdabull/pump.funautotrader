import { realtimeGateway } from '@/services/realtime-gateway'
import { useStreamStore } from '@/core/streamStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useQuantStore } from '@/stores/quantStore'
import { isChartUpdatePayload } from '@/lib/chartUpdate'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { SignalUpdatePayload } from '@/lib/terminalTypes'
import { touchHeartbeat } from '@/core/heartbeat'

const INGESTION_FAILOVER_GRACE_MS = 45_000

function signalToQuantUpdate(signal: SignalUpdatePayload) {
  return {
    mint: signal.mint,
    scores: {
      tradeConfidenceScore: signal.tradeConfidenceScore,
      momentumScore: signal.momentumScore,
      liquidityScore: 0,
      buyPressureScore: 0,
      volatilityScore: 0,
      holderQualityScore: 0,
      whaleConfidenceScore: 0,
      rugProbabilityScore: signal.rug.rugScore,
      vwap: 0,
      ema: 0,
      volumeDelta: 0,
      orderFlowImbalance: 0,
      priceVelocity: signal.velocity.marketCapVelocity,
      liquidityGrowth: 0,
      tradeVelocity: signal.velocity.tradeVelocity,
      sharpeLike: 0,
    },
    rug: {
      rugScore: signal.rug.rugScore,
      blocked: signal.rug.blocked,
      fakeVolumeProbability: signal.rug.fakeVolumeProbability ?? 0,
      creatorRisk: 0,
      holderConcentration: 0,
      liquidityWeakness: 0,
      suspiciousWallets: 0,
      reasons: signal.riskPenalties,
    },
    strategies: [],
    risk: { allowed: !signal.rug.blocked },
    dynamics: {
      lifecycle: signal.lifecycle,
      migrationProbability: signal.migrationProbability,
      burst: signal.burst,
      velocity: signal.velocity,
      coordinationPenalty: signal.coordinationPenalty / 100,
    },
    at: signal.at,
  }
}

let started = false
let lastStreamEpoch = 0
const unsubs: Array<() => void> = []

/** Single Socket.IO connection — registry:patch, trade:tick, chart:update only */
export function startSocketClient() {
  if (started) {
    realtimeGateway.start()
    return () => stopSocketClient()
  }
  started = true

  const quantPatch = useQuantStore.getState().patch

  unsubs.push(
    realtimeGateway.onStreamMeta((meta) => {
      touchHeartbeat()
      if (meta.epoch) {
        if (lastStreamEpoch > 0 && meta.epoch !== lastStreamEpoch) {
          useRealtimeStore.getState().setIngestionDegraded(true)
          window.setTimeout(() => useRealtimeStore.getState().setIngestionDegraded(false), INGESTION_FAILOVER_GRACE_MS)
        }
        lastStreamEpoch = meta.epoch
        useStreamStore.getState().setStreamEpoch(meta.epoch)
      }
      if (meta.pumpportal) {
        useRealtimeStore.getState().setStreamHealth({
          subscribedTradeMints: meta.pumpportal.subscribedTradeMints,
          maxTradeSubscriptions: meta.pumpportal.maxTradeSubscriptions,
          connected: meta.pumpportal.connected,
          tradeMessagesReceived: meta.pumpportal.tradeMessagesReceived ?? 0,
          messagesReceived: meta.pumpportal.messagesReceived ?? 0,
          leaderId: meta.leaderId,
          isLeader: meta.isLeader,
          streamEpoch: meta.epoch,
        })
      }
      useStreamStore.getState().tickConnection()
    }),
    realtimeGateway.onReconnectSnapshot((tokens) => {
      if (tokens.length > 0) {
        useStreamStore.getState().hydrateFeed(tokens)
        useRealtimeStore.getState().setIngestionDegraded(false)
      }
    }),
    realtimeGateway.onRegistryPatch((t) => useStreamStore.getState().applyRegistryPatch(t)),
    realtimeGateway.onTradeTick((tick) => useStreamStore.getState().applyTradeTick(tick)),
    realtimeGateway.onChartUpdate((payload) => {
      if (isChartUpdatePayload(payload)) {
        useStreamStore.getState().applyChartUpdate(payload)
      } else {
        useStreamStore.getState().scheduleChart(payload as TokenChartSeries)
      }
    }),
    realtimeGateway.onSignalUpdate((s) => {
      useStreamStore.getState().applySignal(s)
      quantPatch(signalToQuantUpdate(s))
    }),
    realtimeGateway.onHolderUpdate((h) => useStreamStore.getState().applyHolder(h)),
    realtimeGateway.onMigrationUpdate((m) => useStreamStore.getState().applyMigration(m)),
    realtimeGateway.onTokenStateChange((ev) => useStreamStore.getState().applyStateChange(ev)),
    realtimeGateway.onWalletUpdate((p) => useStreamStore.getState().setWalletGraph(p.mint, p.graph)),
    realtimeGateway.onBubblemapUpdate((p) => useStreamStore.getState().setWalletGraph(p.mint, p.graph)),
    realtimeGateway.onConnect(() => {
      useStreamStore.getState().setWsConnected(true)
      useRealtimeStore.getState().setConnected(true)
      touchHeartbeat()
    }),
    realtimeGateway.onDisconnect(() => {
      useStreamStore.getState().setWsConnected(false)
      useRealtimeStore.getState().setConnected(false)
      useRealtimeStore.getState().setReconnecting(true)
      useStreamStore.getState().tickConnection()
    }),
  )

  realtimeGateway.start()
  useStreamStore.getState().setWsConnected(realtimeGateway.connected)
  useRealtimeStore.getState().setConnected(realtimeGateway.connected)

  const heartbeatIv = window.setInterval(() => {
    useStreamStore.getState().tickConnection()
  }, 2_000)

  return () => {
    window.clearInterval(heartbeatIv)
    stopSocketClient()
  }
}

export function stopSocketClient() {
  for (const u of unsubs) u()
  unsubs.length = 0
  started = false
  useStreamStore.getState().setWsConnected(false)
}

export function getSocketConnected() {
  return realtimeGateway.connected
}
