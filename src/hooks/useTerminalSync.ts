import { useEffect } from 'react'
import { realtimeGateway } from '@/services/realtime-gateway'
import { tokenApi } from '@/services/api'
import { isChartUpdatePayload } from '@/lib/chartUpdate'
import type { TokenChartSeries } from '@/lib/chartTypes'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useQuantStore } from '@/stores/quantStore'
import type { SignalUpdatePayload } from '@/lib/terminalTypes'

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

/**
 * Mount once at app root: Socket.IO → token registry store.
 * No polling; optional one-time REST bootstrap if socket snapshot is empty.
 */
export function useTerminalSync() {
  const hydrateFeed = useTokenRegistryStore((s) => s.hydrateFeed)
  const schedulePatch = useTokenRegistryStore((s) => s.schedulePatch)
  const applyTradeTick = useTokenRegistryStore((s) => s.applyTradeTick)
  const scheduleChart = useTokenRegistryStore((s) => s.scheduleChart)
  const applyChartDelta = useTokenRegistryStore((s) => s.applyChartDelta)
  const applySignal = useTokenRegistryStore((s) => s.applySignal)
  const applyHolder = useTokenRegistryStore((s) => s.applyHolder)
  const applyMigration = useTokenRegistryStore((s) => s.applyMigration)
  const applyStateChange = useTokenRegistryStore((s) => s.applyStateChange)
  const setWalletGraph = useTokenRegistryStore((s) => s.setWalletGraph)
  const setWsConnected = useTokenRegistryStore((s) => s.setWsConnected)
  const setStreamEpoch = useTokenRegistryStore((s) => s.setStreamEpoch)
  const quantPatch = useQuantStore((s) => s.patch)

  useEffect(() => {
    const unsubs = [
      realtimeGateway.onStreamMeta((meta) => setStreamEpoch(meta.epoch)),
      realtimeGateway.onReconnectSnapshot((tokens) => {
        if (tokens.length > 0) hydrateFeed(tokens)
      }),
      realtimeGateway.onRegistryPatch((t) => schedulePatch(t)),
      realtimeGateway.onTradeTick((tick) => applyTradeTick(tick)),
      realtimeGateway.onChartUpdate((payload) => {
        if (isChartUpdatePayload(payload)) {
          applyChartDelta(payload)
        } else {
          scheduleChart(payload as TokenChartSeries)
        }
      }),
      realtimeGateway.onSignalUpdate((s) => {
        applySignal(s)
        quantPatch(signalToQuantUpdate(s))
      }),
      realtimeGateway.onHolderUpdate((h) => applyHolder(h)),
      realtimeGateway.onMigrationUpdate((m) => applyMigration(m)),
      realtimeGateway.onTokenStateChange((ev) => applyStateChange(ev)),
      realtimeGateway.onWalletUpdate((p) => setWalletGraph(p.mint, p.graph)),
      realtimeGateway.onBubblemapUpdate((p) => setWalletGraph(p.mint, p.graph)),
      realtimeGateway.onConnect(() => {
        setWsConnected(true)
        useRealtimeStore.getState().setConnected(true)
      }),
      realtimeGateway.onDisconnect(() => {
        setWsConnected(false)
        useRealtimeStore.getState().setConnected(false)
        useRealtimeStore.getState().setReconnecting(true)
      }),
    ]

    realtimeGateway.start()
    setWsConnected(realtimeGateway.connected)
    useRealtimeStore.getState().setConnected(realtimeGateway.connected)

    return () => {
      for (const u of unsubs) u()
      setWsConnected(false)
      useRealtimeStore.getState().setConnected(false)
    }
  }, [
    hydrateFeed,
    schedulePatch,
    applyTradeTick,
    scheduleChart,
    applyChartDelta,
    applySignal,
    applyHolder,
    applyMigration,
    applyStateChange,
    setWalletGraph,
    setWsConnected,
    setStreamEpoch,
    quantPatch,
  ])

  /** Cold start only — not a live sync loop. */
  useEffect(() => {
    let cancelled = false
    const attemptBootstrap = async () => {
      if (cancelled) return
      if (Object.keys(useTokenRegistryStore.getState().byMint).length > 0) return
      if (realtimeGateway.connected) return
      try {
        const tokens = await tokenApi.feed('all')
        if (!cancelled && tokens.length > 0) hydrateFeed(tokens)
      } catch (err) {
        console.warn('[registry] cold bootstrap failed:', (err as Error).message)
      }
    }
    const t = window.setTimeout(() => void attemptBootstrap(), 8_000)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [hydrateFeed])
}
