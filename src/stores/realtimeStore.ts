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

export type StreamHealthSnapshot = {
  subscribedTradeMints: number
  maxTradeSubscriptions: number
  connected: boolean
  tradeMessagesReceived: number
  messagesReceived: number
  leaderId?: string | null
  isLeader?: boolean
  streamEpoch: number
  updatedAt: number
}

interface RealtimeState {
  connected: boolean
  reconnecting: boolean
  /** Brief ingestion failover — keep buffered feed, show degraded UI. */
  ingestionDegraded: boolean
  diagnostics: RealtimeDiagnostics
  streamHealth: StreamHealthSnapshot
  setConnected: (v: boolean) => void
  setReconnecting: (v: boolean) => void
  setIngestionDegraded: (v: boolean) => void
  setStreamHealth: (patch: Partial<StreamHealthSnapshot>) => void
  patchDiagnostics: (patch: Partial<RealtimeDiagnostics>) => void
  recordReconnect: () => void
  resetDiagnostics: () => void
}

const emptyStreamHealth = (): StreamHealthSnapshot => ({
  subscribedTradeMints: 0,
  maxTradeSubscriptions: 250,
  connected: false,
  tradeMessagesReceived: 0,
  messagesReceived: 0,
  streamEpoch: 0,
  updatedAt: 0,
})

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connected: false,
  reconnecting: false,
  ingestionDegraded: false,
  diagnostics: emptyDiagnostics(),
  streamHealth: emptyStreamHealth(),

  setIngestionDegraded: (v) => set({ ingestionDegraded: v }),

  setStreamHealth: (patch) =>
    set((s) => ({
      streamHealth: {
        ...s.streamHealth,
        ...patch,
        updatedAt: Date.now(),
      },
    })),

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
