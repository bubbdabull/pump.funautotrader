import { useEffect } from 'react'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { realtimeGateway } from '@/services/realtime-gateway'

/** Dev-only: log realtime health when diagnostics drift. */
export function useRealtimeDiagnostics() {
  const diagnostics = useRealtimeStore((s) => s.diagnostics)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (diagnostics.socketInstances > 1) {
      console.error('[realtime] multiple socket instances detected')
    }
    const id = window.setInterval(() => {
      const d = realtimeGateway.getDiagnostics()
      if (d.patchesDropped > 0 || d.stalePatchesRejected > 10) {
        console.debug('[realtime:stats]', d)
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [diagnostics.socketInstances])

  return diagnostics
}
