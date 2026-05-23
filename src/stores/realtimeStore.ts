import { create } from 'zustand'
import type { IntelligenceAlert } from '@/types'

const MAX_INTELLIGENCE_ALERTS = 48

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

export type StreamDebugSnapshot = {
  streamHealth: 'connected' | 'disconnected' | 'degraded'
  ingestionLagMs: number
  registryUpdatedAt: number
  lastPatchAt: number
  lastTradeTickAt: number
}

interface RealtimeState {
  connected: boolean
  reconnecting: boolean
  /** Brief ingestion failover — keep buffered feed, show degraded UI. */
  ingestionDegraded: boolean
  diagnostics: RealtimeDiagnostics
  streamHealth: StreamHealthSnapshot
  streamDebug: StreamDebugSnapshot
  intelligenceAlerts: IntelligenceAlert[]
  setConnected: (v: boolean) => void
  setReconnecting: (v: boolean) => void
  setIngestionDegraded: (v: boolean) => void
  setStreamHealth: (patch: Partial<StreamHealthSnapshot>) => void
  patchStreamDebug: (patch: Partial<StreamDebugSnapshot>) => void
  patchDiagnostics: (patch: Partial<RealtimeDiagnostics>) => void
  pushIntelligenceAlert: (alert: IntelligenceAlert) => void
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

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  reconnecting: false,
  ingestionDegraded: false,
  diagnostics: emptyDiagnostics(),
  streamHealth: emptyStreamHealth(),
  intelligenceAlerts: [],
  streamDebug: {
    streamHealth: 'disconnected',
    ingestionLagMs: 0,
    registryUpdatedAt: 0,
    lastPatchAt: 0,
    lastTradeTickAt: 0,
  },

  setIngestionDegraded: (v) => set({ ingestionDegraded: v }),

  setStreamHealth: (patch) =>
    set((s) => ({
      streamHealth: {
        ...s.streamHealth,
        ...patch,
        updatedAt: Date.now(),
      },
    })),

  setConnected: (v) =>
    set((s) => ({
      connected: v,
      reconnecting: v ? false : s.reconnecting,
      streamDebug: {
        ...s.streamDebug,
        streamHealth: v ? (s.ingestionDegraded ? 'degraded' : 'connected') : 'disconnected',
      },
    })),
  setReconnecting: (v) => set({ reconnecting: v }),
  patchStreamDebug: (patch) =>
    set((s) => ({ streamDebug: { ...s.streamDebug, ...patch } })),
  patchDiagnostics: (patch) =>
    set((s) => ({
      diagnostics: { ...s.diagnostics, ...patch },
      streamDebug: {
        ...s.streamDebug,
        lastPatchAt: patch.lastPatchAt ?? s.streamDebug.lastPatchAt,
        lastTradeTickAt:
          patch.eventsReceived != null && patch.lastEventAt
            ? patch.lastEventAt
            : s.streamDebug.lastTradeTickAt,
        ingestionLagMs: patch.avgEventLatencyMs ?? s.streamDebug.ingestionLagMs,
      },
    })),
  pushIntelligenceAlert: (alert) =>
    set((s) => {
      const next = [alert, ...s.intelligenceAlerts.filter((a) => a.mint !== alert.mint || a.type !== alert.type)]
      return { intelligenceAlerts: next.slice(0, MAX_INTELLIGENCE_ALERTS) }
    }),
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
