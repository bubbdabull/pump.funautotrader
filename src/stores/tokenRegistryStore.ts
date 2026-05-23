import { create } from 'zustand'
import type { PumpToken } from '@/types'
import type { TokenChartSeries } from '@/lib/chartTypes'
import type { FeedTrade } from '@/services/api'
import type {
  HolderUpdatePayload,
  MigrationUpdatePayload,
  SignalUpdatePayload,
  TokenStateChangePayload,
  WalletRelationshipGraph,
} from '@/lib/terminalTypes'
import type { TradeTickPayload } from '@/lib/tradeTypes'
import { patchToken, applySignalToToken } from '@/lib/patchToken'
import { applyTradeTickToToken, tradeTickToFeedTrade } from '@/lib/applyTradeTick'
import { normalizePumpToken } from '@/lib/normalizeToken'
import { registryDebug } from '@/lib/registryDebug'

const PATCH_BATCH_MS = 100
const CHART_BATCH_MS = 120
const MAX_TRADES_PER_MINT = 80

interface TokenRegistryState {
  byMint: Record<string, PumpToken>
  charts: Record<string, TokenChartSeries>
  trades: Record<string, FeedTrade[]>
  tradeSigs: Record<string, Set<string>>
  walletGraphs: Record<string, WalletRelationshipGraph>
  signals: Record<string, SignalUpdatePayload>
  lastPatchAt: Record<string, number>
  version: number
  wsConnected: boolean

  _pendingPatches: Record<string, PumpToken>
  _patchTimer: ReturnType<typeof setTimeout> | null
  _pendingCharts: Record<string, TokenChartSeries>
  _chartTimer: ReturnType<typeof setTimeout> | null

  setWsConnected: (v: boolean) => void
  schedulePatch: (token: PumpToken) => void
  flushPatches: () => void
  applyTradeTick: (tick: TradeTickPayload) => void
  scheduleChart: (series: TokenChartSeries) => void
  flushCharts: () => void
  applySignal: (signal: SignalUpdatePayload) => void
  applyHolder: (h: HolderUpdatePayload) => void
  applyMigration: (m: MigrationUpdatePayload) => void
  applyStateChange: (s: TokenStateChangePayload) => void
  setWalletGraph: (mint: string, graph: WalletRelationshipGraph) => void
  get: (mint: string) => PumpToken | undefined
  getGraph: (mint: string) => WalletRelationshipGraph | undefined
  getChart: (mint: string) => TokenChartSeries | undefined
  getTrades: (mint: string) => FeedTrade[]
  list: () => PumpToken[]
}

function patchImmediate(
  byMint: Record<string, PumpToken>,
  lastPatchAt: Record<string, number>,
  token: PumpToken,
): { byMint: Record<string, PumpToken>; lastPatchAt: Record<string, number> } | null {
  const normalized = normalizePumpToken(token)
  const at = normalized.updatedAt ?? Date.now()
  const last = lastPatchAt[normalized.mint] ?? 0
  if (at < last - 5_000) {
    registryDebug.stale(normalized.mint, at, last)
    return null
  }
  const prev = byMint[normalized.mint]
  const merged = patchToken(prev, normalized)
  registryDebug.merge(normalized.mint, prev, merged)
  return {
    byMint: { ...byMint, [normalized.mint]: merged },
    lastPatchAt: { ...lastPatchAt, [normalized.mint]: Math.max(last, at) },
  }
}

export const useTokenRegistryStore = create<TokenRegistryState>((set, get) => ({
  byMint: {},
  charts: {},
  trades: {},
  tradeSigs: {},
  walletGraphs: {},
  signals: {},
  lastPatchAt: {},
  version: 0,
  wsConnected: false,
  _pendingPatches: {},
  _patchTimer: null,
  _pendingCharts: {},
  _chartTimer: null,

  setWsConnected: (v) => set({ wsConnected: v }),

  schedulePatch: (token) => {
    if (!token?.mint) return
    const s = get()
    const pending = { ...s._pendingPatches }
    const prev = pending[token.mint]
    pending[token.mint] = prev ? patchToken(prev, normalizePumpToken(token)) : normalizePumpToken(token)
    if (!s._patchTimer) {
      const timer = setTimeout(() => {
        get().flushPatches()
      }, PATCH_BATCH_MS)
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
    let byMint = s.byMint
    let lastPatchAt = s.lastPatchAt
    for (const token of Object.values(pending)) {
      const next = patchImmediate(byMint, lastPatchAt, token)
      if (next) {
        byMint = next.byMint
        lastPatchAt = next.lastPatchAt
      }
    }
    set({
      byMint,
      lastPatchAt,
      version: s.version + 1,
      _pendingPatches: {},
      _patchTimer: null,
    })
  },

  applyTradeTick: (tick) => {
    if (!tick?.mint || !tick.signature) return
    const s = get()
    const sigs = s.tradeSigs[tick.mint] ?? new Set<string>()
    if (sigs.has(tick.signature)) {
      registryDebug.duplicate('trade', tick.signature)
      return
    }
    const nextSigs = new Set(sigs)
    nextSigs.add(tick.signature)
    const row = tradeTickToFeedTrade(tick)
    const prevTrades = s.trades[tick.mint] ?? []
    const trades = [row, ...prevTrades].slice(0, MAX_TRADES_PER_MINT)

    const prevToken = s.byMint[tick.mint]
    if (!prevToken) {
      set({
        trades: { ...s.trades, [tick.mint]: trades },
        tradeSigs: { ...s.tradeSigs, [tick.mint]: nextSigs },
      })
      return
    }
    const merged = applyTradeTickToToken(prevToken, tick)
    const patched = patchImmediate(s.byMint, s.lastPatchAt, merged)
    if (!patched) return
    set({
      ...patched,
      trades: { ...s.trades, [tick.mint]: trades },
      tradeSigs: { ...s.tradeSigs, [tick.mint]: nextSigs },
      version: s.version + 1,
    })
  },

  scheduleChart: (series) => {
    if (!series?.mint) return
    const s = get()
    const pending = { ...s._pendingCharts, [series.mint]: series }
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
    const prev = s.byMint[signal.mint]
    set({
      signals: { ...s.signals, [signal.mint]: signal },
      ...(prev
        ? {
            byMint: {
              ...s.byMint,
              [signal.mint]: applySignalToToken(prev, signal),
            },
            version: s.version + 1,
          }
        : {}),
    })
  },

  applyHolder: (h) => {
    const prev = get().byMint[h.mint]
    if (!prev) return
    get().schedulePatch({
      ...prev,
      holders: h.holders,
      holdersVerified: h.holdersVerified,
      top1Pct: h.top1Pct,
      top5Pct: h.top5Pct,
      updatedAt: Date.parse(h.at) || Date.now(),
    })
  },

  applyMigration: (m) => {
    const prev = get().byMint[m.mint]
    if (!prev) return
    get().schedulePatch({
      ...prev,
      lifecycle: m.lifecycle,
      migrationProbability: m.probability,
      bondingCurvePercent: m.bondingCurvePercent,
      updatedAt: Date.parse(m.at) || Date.now(),
    })
  },

  applyStateChange: (ev) => {
    const prev = get().byMint[ev.mint]
    if (!prev) return
    get().schedulePatch({
      ...prev,
      lifecycle: ev.to,
      updatedAt: Date.parse(ev.at) || Date.now(),
    })
  },

  setWalletGraph: (mint, graph) => {
    set((s) => ({
      walletGraphs: { ...s.walletGraphs, [mint]: graph },
      byMint: s.byMint[mint]
        ? {
            ...s.byMint,
            [mint]: {
              ...s.byMint[mint],
              top1Pct: graph.top1Pct,
              top5Pct: graph.top5Pct,
            },
          }
        : s.byMint,
    }))
  },

  get: (mint) => get().byMint[mint],
  getGraph: (mint) => get().walletGraphs[mint],
  getChart: (mint) => get().charts[mint],
  getTrades: (mint) => get().trades[mint] ?? [],
  list: () => Object.values(get().byMint),
}))
