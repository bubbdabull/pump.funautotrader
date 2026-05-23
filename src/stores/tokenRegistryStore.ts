import { create } from 'zustand'
import type { PumpToken } from '@/types'
import type { WalletRelationshipGraph } from '@/lib/terminalTypes'
import type { SignalUpdatePayload } from '@/lib/terminalTypes'
import { patchToken, applySignalToToken } from '@/lib/patchToken'

interface TokenRegistryState {
  byMint: Record<string, PumpToken>
  walletGraphs: Record<string, WalletRelationshipGraph>
  signals: Record<string, SignalUpdatePayload>
  lastPatchAt: Record<string, number>

  patch: (token: PumpToken) => void
  patchMany: (tokens: PumpToken[]) => void
  applySignal: (signal: SignalUpdatePayload) => void
  setWalletGraph: (mint: string, graph: WalletRelationshipGraph) => void
  get: (mint: string) => PumpToken | undefined
  getGraph: (mint: string) => WalletRelationshipGraph | undefined
  list: () => PumpToken[]
}

export const useTokenRegistryStore = create<TokenRegistryState>((set, get) => ({
  byMint: {},
  walletGraphs: {},
  signals: {},
  lastPatchAt: {},

  patch: (token) => {
    const prev = get().byMint[token.mint]
    const at = token.updatedAt ?? Date.now()
    const last = get().lastPatchAt[token.mint] ?? 0
    if (last > at + 5_000) return
    set((s) => ({
      byMint: { ...s.byMint, [token.mint]: patchToken(prev, token) },
      lastPatchAt: { ...s.lastPatchAt, [token.mint]: at },
    }))
  },

  patchMany: (tokens) => {
    set((s) => {
      const byMint = { ...s.byMint }
      const lastPatchAt = { ...s.lastPatchAt }
      for (const t of tokens) {
        byMint[t.mint] = patchToken(byMint[t.mint], t)
        lastPatchAt[t.mint] = t.updatedAt ?? Date.now()
      }
      return { byMint, lastPatchAt }
    })
  },

  applySignal: (signal) => {
    set((s) => {
      const prev = s.byMint[signal.mint]
      if (!prev) return { signals: { ...s.signals, [signal.mint]: signal } }
      return {
        byMint: { ...s.byMint, [signal.mint]: applySignalToToken(prev, signal) },
        signals: { ...s.signals, [signal.mint]: signal },
      }
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

  list: () => Object.values(get().byMint),
}))
