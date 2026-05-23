import { useRealtimeStore } from '@/stores/realtimeStore'

const ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_REGISTRY_DEBUG !== 'false'

export const registryDebug = {
  event(name: string, detail?: unknown) {
    if (!ENABLED) return
    console.debug(`[registry:ws] ${name}`, detail ?? '')
  },
  stale(mint: string, incoming: number, last: number) {
    const d = useRealtimeStore.getState().diagnostics
    useRealtimeStore.getState().patchDiagnostics({
      stalePatchesRejected: d.stalePatchesRejected + 1,
    })
    if (!ENABLED) return
    console.debug(`[registry:stale] ${mint.slice(0, 8)} incoming=${incoming} last=${last}`)
  },
  merge(mint: string, before: unknown, after: unknown) {
    if (!ENABLED) return
    console.debug(`[registry:merge] ${mint.slice(0, 8)}`, { before, after })
  },
  duplicate(kind: string, id: string) {
    if (!ENABLED) return
    console.debug(`[registry:dup] ${kind} ${id}`)
  },
}
