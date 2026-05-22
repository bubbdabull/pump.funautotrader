import { create } from 'zustand'
import type { QuantHolderPatch, QuantUpdate, StrategySignal } from '@/lib/quantTypes'

interface QuantState {
  byMint: Record<string, QuantUpdate>
  strategies: Array<{ mint: string; signal: StrategySignal }>
  patch: (update: QuantUpdate) => void
  patchHolders: (patch: QuantHolderPatch) => void
  addStrategy: (mint: string, signal: StrategySignal) => void
  getRug: (mint: string) => QuantUpdate['rug'] | undefined
  getHolders: (mint: string) => number | undefined
}

function isFullQuantUpdate(u: QuantUpdate | QuantHolderPatch): u is QuantUpdate {
  return 'scores' in u && u.scores != null && 'rug' in u && u.rug != null
}

export const useQuantStore = create<QuantState>((set, get) => ({
  byMint: {},
  strategies: [],
  patch: (update) => {
    if (!isFullQuantUpdate(update)) return
    set((s) => ({
      byMint: {
        ...s.byMint,
        [update.mint]: {
          ...s.byMint[update.mint],
          ...update,
          scores: update.scores,
          rug: update.rug,
          strategies: update.strategies ?? s.byMint[update.mint]?.strategies ?? [],
          risk: update.risk ?? s.byMint[update.mint]?.risk ?? { allowed: true },
        },
      },
    }))
  },
  patchHolders: (patch) =>
    set((s) => {
      const prev = s.byMint[patch.mint]
      if (!prev) return s
      return {
        byMint: {
          ...s.byMint,
          [patch.mint]: {
            ...prev,
            holders: patch.holdersVerified
              ? patch.holders
              : Math.max(prev.holders ?? 0, patch.holders),
            holdersVerified: patch.holdersVerified ?? prev.holdersVerified,
          },
        },
      }
    }),
  addStrategy: (mint, signal) =>
    set((s) => ({
      strategies: [{ mint, signal }, ...s.strategies].slice(0, 40),
    })),
  getRug: (mint) => get().byMint[mint]?.rug,
  getHolders: (mint) => get().byMint[mint]?.holders,
}))
