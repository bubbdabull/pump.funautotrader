import { Injectable, Logger } from '@nestjs/common'
import {
  globalMarketState,
  buildWalletGraph,
  type WalletRelationshipGraph,
} from '@phronis/trading'

export interface WalletClusterLight {
  mint: string
  top1Pct: number
  top5Pct: number
  bundleProbability: number
  sniperProbability: number
  nodeCount: number
  updatedAt: number
}
import { SolanaRpcService } from '../rpc/solana-rpc.service'
import { BubblemapsService } from '../holders/bubblemaps.service'
import { MarketDynamicsService } from './market-dynamics.service'

@Injectable()
export class WalletGraphService {
  private readonly logger = new Logger(WalletGraphService.name)
  private readonly cache = new Map<string, WalletRelationshipGraph>()

  constructor(
    private rpc: SolanaRpcService,
    private bubblemaps: BubblemapsService,
    private dynamics: MarketDynamicsService,
  ) {}

  getCached(mint: string): WalletRelationshipGraph | undefined {
    return this.cache.get(mint)
  }

  exportLightClusters(limit = 150): WalletClusterLight[] {
    const rows = [...this.cache.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
    return rows.map((g) => ({
      mint: g.mint,
      top1Pct: g.top1Pct,
      top5Pct: g.top5Pct,
      bundleProbability: g.bundleProbability,
      sniperProbability: g.sniperProbability,
      nodeCount: g.nodes.length,
      updatedAt: g.updatedAt,
    }))
  }

  importLightClusters(clusters: WalletClusterLight[]): number {
    let n = 0
    for (const c of clusters) {
      if (!c?.mint) continue
      const existing = this.cache.get(c.mint)
      if (existing && existing.updatedAt >= c.updatedAt) continue
      this.cache.set(c.mint, {
        mint: c.mint,
        updatedAt: c.updatedAt,
        nodes: existing?.nodes ?? [],
        clusters: existing?.clusters ?? [],
        top1Pct: c.top1Pct,
        top5Pct: c.top5Pct,
        top10Pct: existing?.top10Pct ?? c.top5Pct * 1.2,
        walletDiversityScore: existing?.walletDiversityScore ?? 0,
        centralizationScore: existing?.centralizationScore ?? 0,
        clusterDensity: existing?.clusterDensity ?? 0,
        organicDistributionScore: existing?.organicDistributionScore ?? 0,
        bundleProbability: c.bundleProbability,
        devControlProbability: existing?.devControlProbability ?? 0,
        sniperProbability: c.sniperProbability,
        coordinationPenalty: existing?.coordinationPenalty ?? 0,
      })
      n++
    }
    return n
  }

  async buildGraph(mint: string): Promise<WalletRelationshipGraph | null> {
    const state = globalMarketState.getState(mint)
    const balances = new Map<string, number>()
    if (state) {
      for (const [w, b] of state.walletBalances) {
        if (b > 0) balances.set(w, b)
      }
      const firstSeen = new Map<string, number>()
      for (const t of state.trades) {
        if (t.wallet === 'unknown') continue
        const prev = firstSeen.get(t.wallet)
        if (!prev || t.timestamp < prev) firstSeen.set(t.wallet, t.timestamp)
      }

      if (balances.size < 3 && this.rpc.isDedicated) {
        await this.mergeLargestAccounts(mint, balances)
      }

      const bubble = await this.bubblemaps.fetchBubbleMap(mint)
      const analytics = this.dynamics.getAnalytics(mint)

      const graph = buildWalletGraph({
        mint,
        balances,
        deployerWallet: state.deployerWallet,
        coordinationPenalty: analytics?.coordinationPenalty ?? 0,
        coordinationFlags: this.dynamics.getCoordinationFlags(mint),
        top1Pct: bubble?.snapshot?.top1Pct,
        top5Pct: bubble?.snapshot?.top5Pct,
        suspiciousClusterPct: bubble?.snapshot?.suspiciousClusterPct,
        bubbleNodes: bubble?.nodes,
        bubbleClusters: bubble?.clusters,
        firstSeenByWallet: firstSeen,
      })

      this.cache.set(mint, graph)
      return graph
    }

    const bubble = await this.bubblemaps.fetchBubbleMap(mint)
    if (!bubble?.nodes.length) return null

    const graph = buildWalletGraph({
      mint,
      balances,
      bubbleNodes: bubble.nodes,
      bubbleClusters: bubble.clusters,
      top1Pct: bubble.snapshot?.top1Pct,
      top5Pct: bubble.snapshot?.top5Pct,
      suspiciousClusterPct: bubble.snapshot?.suspiciousClusterPct,
    })
    this.cache.set(mint, graph)
    return graph
  }

  private async mergeLargestAccounts(mint: string, balances: Map<string, number>) {
    try {
      const result = await this.rpc.rpc<{
        value: Array<{ address: string; amount: string; uiAmount: number }>
      }>('getTokenLargestAccounts', [mint])
      const rows = result?.value ?? []
      for (const row of rows.slice(0, 20)) {
        const amt = Number(row.uiAmount ?? row.amount ?? 0)
        if (amt > 0) balances.set(row.address, amt)
      }
    } catch (err) {
      this.logger.debug(`getTokenLargestAccounts ${mint.slice(0, 8)}: ${(err as Error).message}`)
    }
  }
}
