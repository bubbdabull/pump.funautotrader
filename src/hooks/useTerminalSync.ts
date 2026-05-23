import { useEffect } from 'react'
import { wsService } from '@/services/websocket'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'
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

/** Single WS → global registry bridge (mount once at app root). */
export function useTerminalSync() {
  const hydrateFeed = useTokenRegistryStore((s) => s.hydrateFeed)
  const schedulePatch = useTokenRegistryStore((s) => s.schedulePatch)
  const applyTradeTick = useTokenRegistryStore((s) => s.applyTradeTick)
  const scheduleChart = useTokenRegistryStore((s) => s.scheduleChart)
  const applySignal = useTokenRegistryStore((s) => s.applySignal)
  const applyHolder = useTokenRegistryStore((s) => s.applyHolder)
  const applyMigration = useTokenRegistryStore((s) => s.applyMigration)
  const applyStateChange = useTokenRegistryStore((s) => s.applyStateChange)
  const setWalletGraph = useTokenRegistryStore((s) => s.setWalletGraph)
  const setWsConnected = useTokenRegistryStore((s) => s.setWsConnected)
  const quantPatch = useQuantStore((s) => s.patch)

  useEffect(() => {
    wsService.connect()

    const unsubs = [
      wsService.onConnect(() => setWsConnected(true)),
      wsService.onDisconnect(() => setWsConnected(false)),
      wsService.onFeedSnapshot((tokens) => hydrateFeed(tokens)),
      wsService.onRegistryPatch((t) => schedulePatch(t)),
      wsService.onTradeTick((tick) => applyTradeTick(tick)),
      wsService.onChartUpdate((series) => scheduleChart(series)),
      wsService.onSignalUpdate((s) => {
        applySignal(s)
        quantPatch(signalToQuantUpdate(s))
      }),
      wsService.onHolderUpdate((h) => applyHolder(h)),
      wsService.onMigrationUpdate((m) => applyMigration(m)),
      wsService.onTokenStateChange((ev) => applyStateChange(ev)),
      wsService.onWalletUpdate((p) => setWalletGraph(p.mint, p.graph)),
    ]

    setWsConnected(wsService.connected)

    return () => {
      for (const u of unsubs) u()
      setWsConnected(false)
    }
  }, [
    hydrateFeed,
    schedulePatch,
    applyTradeTick,
    scheduleChart,
    applySignal,
    applyHolder,
    applyMigration,
    applyStateChange,
    setWalletGraph,
    setWsConnected,
    quantPatch,
  ])
}
