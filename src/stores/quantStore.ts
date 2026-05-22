import { create } from 'zustand'
import type { QuantUpdate, StrategySignal } from '@/lib/quantTypes'

interface QuantState {
  byMint: Record<string, QuantUpdate>
  strategies: Array<{ mint: string; signal: StrategySignal }>
  patch: (update: QuantUpdate) => void
  addStrategy: (mint: string, signal: StrategySignal) => void
  getRug: (mint: string) => QuantUpdate['rug'] | undefined
  getHolders: (mint: string) => number | undefined
}

export const useQuantStore = create<QuantState>((set, get) => ({
  byMint: {},
  strategies: [],
  patch: (update) =>
    set((s) => ({
      byMint: { ...s.byMint, [update.mint]: update },
    })),
  addStrategy: (mint, signal) =>
    set((s) => ({
      strategies: [{ mint, signal }, ...s.strategies].slice(0, 40),
    })),
  getRug: (mint) => get().byMint[mint]?.rug,
  getHolders: (mint) => get().byMint[mint]?.holders,
}))
