import { clamp01, coefficientOfVariation } from '../utils/math'
import type { DynamicsTradeInput } from './types'

const MAX_WALLETS_GLOBAL = 12_000
const MAX_MINT_WALLETS = 400

export interface WalletProfile {
  firstSeenMs: number
  lastSeenMs: number
  tradeCount: number
  buySol: number
  sellSol: number
  mints: Set<string>
  recentSolSizes: number[]
}

export interface CoordinationResult {
  penalty: number
  flags: string[]
}

export class WalletBehaviorModel {
  private readonly global = new Map<string, WalletProfile>()
  private readonly mintWallets = new Map<string, Map<string, number>>()
  private readonly mintBuyTimestamps = new Map<string, number[]>()

  observe(mint: string, trade: DynamicsTradeInput): CoordinationResult {
    const now = trade.timestampMs
    const wallet = trade.wallet
    if (!wallet || wallet === 'unknown') return { penalty: 0, flags: [] }

    let profile = this.global.get(wallet)
    if (!profile) {
      if (this.global.size >= MAX_WALLETS_GLOBAL) this.evictOldestGlobal()
      profile = {
        firstSeenMs: now,
        lastSeenMs: now,
        tradeCount: 0,
        buySol: 0,
        sellSol: 0,
        mints: new Set(),
        recentSolSizes: [],
      }
      this.global.set(wallet, profile)
    }

    profile.lastSeenMs = now
    profile.tradeCount++
    profile.mints.add(mint)
    if (trade.side === 'buy') profile.buySol += trade.solAmount
    else profile.sellSol += trade.solAmount
    if (profile.recentSolSizes.length >= 8) profile.recentSolSizes.shift()
    profile.recentSolSizes.push(trade.solAmount)

    let mintMap = this.mintWallets.get(mint)
    if (!mintMap) {
      mintMap = new Map()
      this.mintWallets.set(mint, mintMap)
    }
    if (mintMap.size >= MAX_MINT_WALLETS && !mintMap.has(wallet)) {
      const firstKey = mintMap.keys().next().value
      if (firstKey) mintMap.delete(firstKey)
    }
    mintMap.set(wallet, now)

    if (trade.side === 'buy') {
      let stamps = this.mintBuyTimestamps.get(mint)
      if (!stamps) {
        stamps = []
        this.mintBuyTimestamps.set(mint, stamps)
      }
      stamps.push(now)
      if (stamps.length > 40) stamps.splice(0, stamps.length - 40)
    }

    return this.scoreCoordination(mint, now)
  }

  private scoreCoordination(mint: string, now: number): CoordinationResult {
    const flags: string[] = []
    let penalty = 0

    const stamps = this.mintBuyTimestamps.get(mint) ?? []
    if (stamps.length >= 6) {
      const recent = stamps.filter((t) => now - t <= 8_000)
      if (recent.length >= 4) {
        penalty += 0.35
        flags.push('sniper_bundle')
      }
    }

    const mintMap = this.mintWallets.get(mint)
    if (mintMap && mintMap.size >= 3) {
      const entries = [...mintMap.entries()].sort((a, b) => a[1] - b[1])
      let cluster = 1
      let maxCluster = 1
      for (let i = 1; i < entries.length; i++) {
        if (entries[i][1] - entries[i - 1][1] <= 1_500) {
          cluster++
          maxCluster = Math.max(maxCluster, cluster)
        } else {
          cluster = 1
        }
      }
      if (maxCluster >= 5) {
        penalty += 0.28
        flags.push('coordinated_entries')
      }
    }

    const sizes: number[] = []
    for (const [w, t] of mintMap ?? []) {
      if (now - t > 60_000) continue
      const p = this.global.get(w)
      if (p?.recentSolSizes.length) sizes.push(p.recentSolSizes[p.recentSolSizes.length - 1])
    }
    if (sizes.length >= 5) {
      const cv = coefficientOfVariation(sizes)
      if (cv < 0.08) {
        penalty += 0.22
        flags.push('uniform_sol_sizes')
      }
    }

    let overlapLaunch = 0
    for (const [, p] of this.global) {
      if (p.mints.has(mint) && p.mints.size >= 4 && now - p.firstSeenMs < 120_000) {
        overlapLaunch++
      }
    }
    if (overlapLaunch >= 3) {
      penalty += 0.15
      flags.push('serial_sniper_wallet')
    }

    const mintProfiles = [...(mintMap?.keys() ?? [])].map((w) => this.global.get(w)).filter(Boolean) as WalletProfile[]
    const washCandidates = mintProfiles.filter((p) => p.buySol > 0.05 && p.sellSol > 0.04)
    if (washCandidates.length >= 3 && mintProfiles.length >= 4) {
      const washRatio = washCandidates.length / mintProfiles.length
      if (washRatio > 0.45) {
        penalty += 0.25
        flags.push('wash_trading')
      }
    }

    return { penalty: clamp01(penalty), flags }
  }

  private evictOldestGlobal() {
    let oldestKey: string | null = null
    let oldest = Infinity
    for (const [k, p] of this.global) {
      if (p.lastSeenMs < oldest) {
        oldest = p.lastSeenMs
        oldestKey = k
      }
    }
    if (oldestKey) this.global.delete(oldestKey)
  }

  pruneMint(mint: string) {
    this.mintWallets.delete(mint)
    this.mintBuyTimestamps.delete(mint)
  }
}
