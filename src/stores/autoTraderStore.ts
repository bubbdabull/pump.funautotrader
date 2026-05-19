import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { evaluateProbabilisticEntry } from '@/lib/probabilisticTrading'
import type { AutoTradeRules, AutoTradeSignal, TradeExecution } from '@/types'

const DEFAULT_RULES: AutoTradeRules = {
  enabled: false,
  buyAmountSol: 0.1,
  slippage: 12,
  priorityFee: 0.0001,
  pool: 'auto',
  snipeNewTokens: true,
  minBondingCurve: 5,
  maxBondingCurve: 35,
  maxMarketCapUsd: 120_000,
  maxSignalScore: 35,
  autoSellTakeProfitPct: 80,
  autoSellStopLossPct: 25,
}

interface AutoTraderState {
  rules: AutoTradeRules
  panelOpen: boolean
  signals: AutoTradeSignal[]
  executions: TradeExecution[]
  positions: Record<string, { entrySol: number; mint: string; symbol?: string; entryEvScore?: number }>
  setRules: (r: Partial<AutoTradeRules>) => void
  toggleEnabled: () => void
  setPanelOpen: (open: boolean) => void
  addSignal: (s: AutoTradeSignal) => void
  addExecution: (e: TradeExecution) => void
  setPosition: (mint: string, data: { entrySol: number; symbol?: string; entryEvScore?: number }) => void
  removePosition: (mint: string) => void
}

export const useAutoTraderStore = create<AutoTraderState>()(
  persist(
    (set, get) => ({
      rules: DEFAULT_RULES,
      panelOpen: true,
      signals: [],
      executions: [],
      positions: {},
      setRules: (r) => set({ rules: { ...get().rules, ...r } }),
      toggleEnabled: () => set({ rules: { ...get().rules, enabled: !get().rules.enabled } }),
      setPanelOpen: (panelOpen) => set({ panelOpen }),
      addSignal: (s) =>
        set((state) => ({ signals: [s, ...state.signals].slice(0, 100) })),
      addExecution: (e) =>
        set((state) => ({ executions: [e, ...state.executions].slice(0, 200) })),
      setPosition: (mint, data) =>
        set((state) => ({
          positions: { ...state.positions, [mint]: { ...data, mint } },
        })),
      removePosition: (mint) => {
        const { [mint]: _, ...rest } = get().positions
        set({ positions: rest })
      },
    }),
    { name: 'phronis-autotrader' },
  ),
)

/** Probabilistic EV gates + legacy curve/mcap filters. */
export function evaluateTokenAgainstRules(
  token: { mint: string; bondingCurvePercent: number; marketCap: number; signalScore: number },
  rules: AutoTradeRules,
): boolean {
  return evaluateProbabilisticEntry(token.mint, rules) !== null
}
