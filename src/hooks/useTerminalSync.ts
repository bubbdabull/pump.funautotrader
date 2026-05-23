import { useEffect } from 'react'
import { wsService } from '@/services/websocket'
import { useTokenRegistryStore } from '@/stores/tokenRegistryStore'
import { useQuantStore } from '@/stores/quantStore'

/** Single WS → normalized registry bridge (mount once at app root). */
export function useTerminalSync() {
  const patch = useTokenRegistryStore((s) => s.patch)
  const patchMany = useTokenRegistryStore((s) => s.patchMany)
  const applySignal = useTokenRegistryStore((s) => s.applySignal)
  const setWalletGraph = useTokenRegistryStore((s) => s.setWalletGraph)
  const quantPatch = useQuantStore((s) => s.patch)
  const getToken = useTokenRegistryStore((s) => s.get)

  useEffect(() => {
    wsService.connect()

    const unsubs = [
      wsService.onFeedUpdate((tokens) => patchMany(tokens)),
      wsService.onFeedPatch((t) => patch(t)),
      wsService.onTokenUpdate((t) => patch(t)),
      wsService.onFeedPrepend((t) => patch(t)),
      wsService.onSignalUpdate((s) => applySignal(s)),
      wsService.onHolderUpdate((h) => {
        const existing = getToken(h.mint)
        if (!existing) return
        patch({
          ...existing,
          holders: h.holders,
          holdersVerified: h.holdersVerified,
          top1Pct: h.top1Pct,
          top5Pct: h.top5Pct,
        })
      }),
      wsService.onBubbleMapUpdate((p) => setWalletGraph(p.mint, p.graph)),
      wsService.onWalletUpdate((p) => setWalletGraph(p.mint, p.graph)),
      wsService.onQuantUpdate((q) => {
        quantPatch(q)
        if (q.dynamics) {
          const existing = getToken(q.mint)
          if (existing) {
            patch({
              ...existing,
              lifecycle: q.dynamics.lifecycle as import('@/types').TokenLifecycleState,
              migrationProbability: q.dynamics.migrationProbability,
              burstIgnition: Math.round(q.dynamics.burst.ignitionScore * 100),
              coordinationPenalty: Math.round(q.dynamics.coordinationPenalty * 100),
            })
          }
        }
      }),
    ]

    return () => {
      for (const u of unsubs) u()
    }
  }, [patch, patchMany, applySignal, setWalletGraph, quantPatch, getToken])
}
