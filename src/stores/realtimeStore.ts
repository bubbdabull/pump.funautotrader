import { create } from 'zustand'

export type RealtimeDiagnostics = {
  socketInstances: number
  reconnectCount: number
  eventsReceived: number
  patchesReceived: number
  patchesBuffered: number
  patchesDropped: number
  stalePatchesRejected: number
  duplicateTrades: number
  lastEventAt: number
  lastPatchAt: number
  avgEventLatencyMs: number
}

const emptyDiagnostics = (): RealtimeDiagnostics => ({
  socketInstances: 0,
  reconnectCount: 0,
  eventsReceived: 0,
  patchesReceived: 0,
  patchesBuffered: 0,
  patchesDropped: 0,
  stalePatchesRejected: 0,
  duplicateTrades: 0,
  lastEventAt: 0,
  lastPatchAt: 0,
  avgEventLatencyMs: 0,
})

interface RealtimeState {
  connected: boolean
  reconnecting: boolean
  diagnostics: RealtimeDiagnostics
  setConnected: (v: boolean) => void
  setReconnecting: (v: boolean) => void
  patchDiagnostics: (patch: Partial<RealtimeDiagnostics>) => void
  recordReconnect: () => void
  resetDiagnostics: () => void
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connected: false,
  reconnecting: false,
  diagnostics: emptyDiagnostics(),

  setConnected: (v) => set({ connected: v, reconnecting: v ? false : get().reconnecting }),
  setReconnecting: (v) => set({ reconnecting: v }),
  patchDiagnostics: (patch) =>
    set((s) => ({ diagnostics: { ...s.diagnostics, ...patch } })),
  recordReconnect: () =>
    set((s) => ({
      reconnecting: true,
      diagnostics: {
        ...s.diagnostics,
        reconnectCount: s.diagnostics.reconnectCount + 1,
      },
    })),
  resetDiagnostics: () => set({ diagnostics: emptyDiagnostics() }),
}))
