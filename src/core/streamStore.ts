import { create } from 'zustand'
import type { PumpToken } from '@/types'
import type { ChartUpdatePayload, TokenChartSeries } from '@/lib/chartTypes'
import { mergeChartUpdate, patchChartFromTradeTick } from '@/lib/chartUpdate'
import type { FeedTrade } from '@/services/api'
import type {
  HolderUpdatePayload,
  MigrationUpdatePayload,
  SignalUpdatePayload,
  TokenStateChangePayload,
  WalletRelationshipGraph,
} from '@/lib/terminalTypes'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import { applySignalToToken } from '@/lib/patchToken'
import { applyTradeTickToToken, tradeTickToFeedTrade } from '@/lib/applyTradeTick'
import { normalizeStreamToken, mergeStreamTokens } from '@/domain/tokens/tokenNormalizer'
import type { StreamToken, StreamDisplayMode, ConnectionStatus } from '@/domain/tokens/tokenTypes'
import { isInvalidStreamToken } from '@/domain/tokens/tokenTypes'
import {
  touchRegistryActivity,
  touchTradeActivity,
  resolveConnectionStatus,
} from '@/core/heartbeat'
import { rankIntelligenceLane, isInvalidSignal, applySubscriptionTier, limitFreeTierVisible } from '@/lib/intelligence'
import type { ScannerLane } from '@/lib/feedQuality'
import { useRealtimeStore } from '@/stores/realtimeStore'

const PATCH_BATCH_MS = 100
const CHART_BATCH_MS = 120
const MAX_TRADES_PER_MINT = 80
const CHART_TICK_INTERVALS = [1_000, 5_000] as const
const LIVE_STREAM_CAP = 250

const IS_PRO_TIER =
  import.meta.env.VITE_SUBSCRIPTION_TIER === 'pro' ||
  (typeof window !== 'undefined' && window.localStorage.getItem('phronis_tier') === 'pro')

function chartKey(mint: string, intervalMs: number) {
  return `${mint}::${intervalMs}`
}

interface StreamState {
  tokens: Map<string, StreamToken>
  charts: Record<string, TokenChartSeries>
  trades: Record<string, FeedTrade[]>
  tradeSigs: Record<string, Set<string>>
  walletGraphs: Record<string, WalletRelationshipGraph>
  signals: Record<string, SignalUpdatePayload>
  lastPatchAt: Record<string, number>
  version: number
  updatedAt: number
  wsConnected: boolean
  streamEpoch: number
  displayMode: StreamDisplayMode
  connectionStatus: ConnectionStatus
  heartbeatAt: number

  _pendingPatches: Record<string, StreamToken>
  _patchTimer: ReturnType<typeof setTimeout> | null
  _pendingCharts: Record<string, TokenChartSeries>
  _chartTimer: ReturnType<typeof setTimeout> | null

  setWsConnected: (v: boolean) => void
  setStreamEpoch: (epoch: number) => void
  setDisplayMode: (mode: StreamDisplayMode) => void
  tickConnection: () => void
  hydrateFeed: (tokens: PumpToken[]) => void
  applyRegistryPatch: (token: PumpToken) => void
  flushPatches: () => void
  applyTradeTick: (tick: TradeTickPayload) => void
  applyChartUpdate: (patch: ChartUpdatePayload) => void
  scheduleChart: (series: TokenChartSeries) => void
  applySignal: (signal: SignalUpdatePayload) => void
  applyHolder: (h: HolderUpdatePayload) => void
  applyMigration: (m: MigrationUpdatePayload) => void
  applyStateChange: (s: TokenStateChangePayload) => void
  setWalletGraph: (mint: string, graph: WalletRelationshipGraph) => void
  getToken: (mint: string) => StreamToken | undefined
  getChart: (mint: string, intervalMs?: number) => TokenChartSeries | undefined
  getTrades: (mint: string) => FeedTrade[]
  getGraph: (mint: string) => WalletRelationshipGraph | undefined
  listTokens: (lane?: ScannerLane, tier?: 'free' | 'pro') => StreamToken[]
  flushCharts: () => void
}

function patchImmediate(
  tokens: Map<string, StreamToken>,
  lastPatchAt: Record<string, number>,
  raw: PumpToken,
): { tokens: Map<string, StreamToken>; lastPatchAt: Record<string, number> } | null {
  const normalized = normalizeStreamToken(raw)
  const at = normalized.updatedAt ?? Date.now()
  const last = lastPatchAt[normalized.mint] ?? 0
  if (at < last - 5_000) return null
  const prev = tokens.get(normalized.mint)
  const merged = prev ? mergeStreamTokens(prev, normalized) : normalized
  const next = new Map(tokens)
  next.set(normalized.mint, merged)
  return {
    tokens: next,
    lastPatchAt: { ...lastPatchAt, [normalized.mint]: Math.max(last, at) },
  }
}

export const useStreamStore = create<StreamState>((set, get) => ({
  tokens: new Map(),
  charts: {},
  trades: {},
  tradeSigs: {},
  walletGraphs: {},
  signals: {},
  lastPatchAt: {},
  version: 0,
  updatedAt: 0,
  wsConnected: false,
  streamEpoch: 0,
  displayMode: 'LIVE_STREAM',
  connectionStatus: 'OFFLINE',
  heartbeatAt: 0,
  _pendingPatches: {},
  _patchTimer: null,
  _pendingCharts: {},
  _chartTimer: null,

  setWsConnected: (v) => {
    set({ wsConnected: v })
    get().tickConnection()
  },

  setStreamEpoch: (epoch) => set({ streamEpoch: epoch }),

  setDisplayMode: (mode) => set({ displayMode: mode }),

  tickConnection: () => {
    const status = resolveConnectionStatus(get().wsConnected)
    const mode: StreamDisplayMode =
      status === 'OFFLINE' && get().tokens.size > 0 ? 'OFFLINE_MODE' : get().displayMode
    set({
      connectionStatus: status,
      displayMode: status === 'OFFLINE' ? 'OFFLINE_MODE' : mode === 'OFFLINE_MODE' ? 'LIVE_STREAM' : mode,
      heartbeatAt: Date.now(),
    })
  },

  hydrateFeed: (list) => {
    if (!list.length) return
    let tokens = get().tokens
    let lastPatchAt = get().lastPatchAt
    for (const raw of list) {
      const normalized = normalizeStreamToken(raw)
      const prev = tokens.get(normalized.mint)
      tokens = new Map(tokens)
      tokens.set(normalized.mint, prev ? mergeStreamTokens(prev, normalized) : normalized)
      lastPatchAt = {
        ...lastPatchAt,
        [normalized.mint]: Math.max(lastPatchAt[normalized.mint] ?? 0, normalized.updatedAt ?? Date.now()),
      }
    }
    touchRegistryActivity()
    set({
      tokens,
      lastPatchAt,
      version: get().version + 1,
      updatedAt: Date.now(),
      heartbeatAt: Date.now(),
    })
    get().tickConnection()
  },

  applyRegistryPatch: (token) => {
    if (!token?.mint) return
    const s = get()
    const pending = { ...s._pendingPatches }
    const prev = pending[token.mint]
    pending[token.mint] = prev
      ? mergeStreamTokens(prev, normalizeStreamToken(token))
      : normalizeStreamToken(token)
    if (!s._patchTimer) {
      const timer = setTimeout(() => get().flushPatches(), PATCH_BATCH_MS)
      set({ _pendingPatches: pending, _patchTimer: timer })
    } else {
      set({ _pendingPatches: pending })
    }
  },

  flushPatches: () => {
    const s = get()
    if (s._patchTimer) clearTimeout(s._patchTimer)
    const pending = s._pendingPatches
    if (Object.keys(pending).length === 0) {
      set({ _patchTimer: null, _pendingPatches: {} })
      return
    }
    let tokens = s.tokens
    let lastPatchAt = s.lastPatchAt
    for (const token of Object.values(pending)) {
      const next = patchImmediate(tokens, lastPatchAt, token)
      if (next) {
        tokens = next.tokens
        lastPatchAt = next.lastPatchAt
      }
    }
    touchRegistryActivity()
    const now = Date.now()
    useRealtimeStore.getState().patchStreamDebug({ registryUpdatedAt: now })
    set({
      tokens,
      lastPatchAt,
      version: s.version + 1,
      updatedAt: now,
      heartbeatAt: now,
      _pendingPatches: {},
      _patchTimer: null,
    })
    get().tickConnection()
  },

  applyTradeTick: (tick) => {
    if (!tick?.mint || !tick.signature) return
    const s = get()
    const sigs = s.tradeSigs[tick.mint] ?? new Set<string>()
    if (sigs.has(tick.signature)) return
    const nextSigs = new Set(sigs)
    nextSigs.add(tick.signature)
    const row = tradeTickToFeedTrade(tick)
    const prevTrades = s.trades[tick.mint] ?? []
    const trades = [row, ...prevTrades].slice(0, MAX_TRADES_PER_MINT)

    const prevToken = s.tokens.get(tick.mint)
    if (!prevToken) {
      set({
        trades: { ...s.trades, [tick.mint]: trades },
        tradeSigs: { ...s.tradeSigs, [tick.mint]: nextSigs },
      })
      touchTradeActivity()
      return
    }

    const merged = applyTradeTickToToken(prevToken, tick)
    const patched = patchImmediate(s.tokens, s.lastPatchAt, merged)
    if (!patched) return

    const charts = { ...s.charts }
    for (const intervalMs of CHART_TICK_INTERVALS) {
      const key = chartKey(tick.mint, intervalMs)
      const next = patchChartFromTradeTick(charts[key], tick, intervalMs)
      if (next) charts[key] = { ...next, chartSeq: (charts[key]?.chartSeq ?? 0) + 1 }
    }

    touchTradeActivity()
    const now = Date.now()
    useRealtimeStore.getState().patchStreamDebug({
      registryUpdatedAt: now,
      lastTradeTickAt: now,
    })
    set({
      tokens: patched.tokens,
      lastPatchAt: patched.lastPatchAt,
      charts,
      trades: { ...s.trades, [tick.mint]: trades },
      tradeSigs: { ...s.tradeSigs, [tick.mint]: nextSigs },
      version: s.version + 1,
      updatedAt: now,
      heartbeatAt: now,
    })
    get().tickConnection()
  },

  applyChartUpdate: (patch) => {
    if (!patch?.mint) return
    const s = get()
    const charts = { ...s.charts }
    for (const raw of Object.keys(patch.intervals)) {
      const intervalMs = Number(raw)
      if (!Number.isFinite(intervalMs)) continue
      const key = chartKey(patch.mint, intervalMs)
      const prev = charts[key]
      if (prev?.chartSeq != null && prev.chartSeq >= patch.seq) continue
      charts[key] = { ...mergeChartUpdate(prev, patch, intervalMs), chartSeq: patch.seq }
    }
    touchRegistryActivity()
    set({ charts, updatedAt: Date.now(), heartbeatAt: Date.now() })
    get().tickConnection()
  },

  scheduleChart: (series) => {
    if (!series?.mint) return
    const s = get()
    const key = chartKey(series.mint, series.intervalMs ?? 5_000)
    const pending = { ...s._pendingCharts, [key]: series }
    if (!s._chartTimer) {
      const timer = setTimeout(() => get().flushCharts(), CHART_BATCH_MS)
      set({ _pendingCharts: pending, _chartTimer: timer })
    } else {
      set({ _pendingCharts: pending })
    }
  },

  flushCharts: () => {
    const s = get()
    if (s._chartTimer) clearTimeout(s._chartTimer)
    const pending = s._pendingCharts
    if (Object.keys(pending).length === 0) {
      set({ _chartTimer: null, _pendingCharts: {} })
      return
    }
    set({
      charts: { ...s.charts, ...pending },
      _chartTimer: null,
      _pendingCharts: {},
    })
  },

  applySignal: (signal) => {
    const s = get()
    const prev = s.tokens.get(signal.mint)
    const next = new Map(s.tokens)
    if (prev) {
      next.set(signal.mint, normalizeStreamToken(applySignalToToken(prev, signal)))
    }
    set({
      signals: { ...s.signals, [signal.mint]: signal },
      tokens: next,
      version: prev ? s.version + 1 : s.version,
      updatedAt: Date.now(),
    })
  },

  applyHolder: (h) => {
    const prev = get().tokens.get(h.mint)
    if (!prev) return
    get().applyRegistryPatch({
      ...prev,
      holders: h.holders,
      holdersVerified: h.holdersVerified,
      top1Pct: h.top1Pct,
      top5Pct: h.top5Pct,
      updatedAt: Date.parse(h.at) || Date.now(),
    })
  },

  applyMigration: (m) => {
    const prev = get().tokens.get(m.mint)
    if (!prev) return
    get().applyRegistryPatch({
      ...prev,
      lifecycle: m.lifecycle,
      migrationProbability: m.probability,
      bondingCurvePercent: m.bondingCurvePercent,
      updatedAt: Date.parse(m.at) || Date.now(),
    })
  },

  applyStateChange: (ev) => {
    const prev = get().tokens.get(ev.mint)
    if (!prev) return
    get().applyRegistryPatch({
      ...prev,
      lifecycle: ev.to,
      updatedAt: Date.parse(ev.at) || Date.now(),
    })
  },

  setWalletGraph: (mint, graph) => {
    set((s) => {
      const tokens = new Map(s.tokens)
      const t = tokens.get(mint)
      if (t) {
        tokens.set(mint, { ...t, top1Pct: graph.top1Pct, top5Pct: graph.top5Pct })
      }
      return {
        walletGraphs: { ...s.walletGraphs, [mint]: graph },
        tokens,
      }
    })
  },

  getToken: (mint) => get().tokens.get(mint),

  getChart: (mint, intervalMs = 5_000) => get().charts[chartKey(mint, intervalMs)],

  getTrades: (mint) => get().trades[mint] ?? [],

  getGraph: (mint) => get().walletGraphs[mint],

  listTokens: (lane = 'all', tier = IS_PRO_TIER ? 'pro' : 'free') => {
    const s = get()
    const all = [...s.tokens.values()]
    const visible = all.filter((t) => !isInvalidStreamToken(t) && !isInvalidSignal(t))

    if (s.displayMode === 'ANALYTICS_VIEW') {
      const ranked = rankIntelligenceLane(visible as PumpToken[], lane, LIVE_STREAM_CAP)
      return ranked.map((t) => applySubscriptionTier(normalizeStreamToken(t), tier) as StreamToken)
    }

    const ranked = rankIntelligenceLane(visible as PumpToken[], lane, LIVE_STREAM_CAP)
    const tiered = ranked.map((t) => applySubscriptionTier(normalizeStreamToken(t), tier) as StreamToken)
    return tier === 'pro' ? tiered : limitFreeTierVisible(tiered, tier, LIVE_STREAM_CAP)
  },
}))
