import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { distributionFromAmounts, type OnChainHolderSnapshot } from '@phronis/trading'

const BUBBLEMAPS_BASE = 'https://api.bubblemaps.io'

export interface BubbleMapNode {
  wallet: string
  sharePct: number
  related?: string[]
}

export interface BubbleMapCluster {
  wallets: string[]
  density: number
  probability: number
  label?: string
}

export interface BubbleMapData {
  snapshot: OnChainHolderSnapshot
  nodes: BubbleMapNode[]
  clusters: BubbleMapCluster[]
}

@Injectable()
export class BubblemapsService {
  private readonly logger = new Logger(BubblemapsService.name)
  private readonly apiKey: string
  private readonly cache = new Map<string, { data: BubbleMapData; at: number }>()

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('BUBBLEMAPS_API_KEY')?.trim() || ''
  }

  get enabled(): boolean {
    return Boolean(this.apiKey)
  }

  async fetchHolderSnapshot(mint: string): Promise<OnChainHolderSnapshot | null> {
    const full = await this.fetchBubbleMap(mint)
    return full?.snapshot ?? null
  }

  async fetchBubbleMap(mint: string): Promise<BubbleMapData | null> {
    if (!this.apiKey) return null
    const cached = this.cache.get(mint)
    if (cached && Date.now() - cached.at < 90_000) return cached.data

    try {
      const { data } = await axios.get<Record<string, unknown>>(
        `${BUBBLEMAPS_BASE}/maps/solana/${mint}`,
        {
          params: {
            return_nodes: true,
            return_clusters: true,
            use_magic_nodes: true,
          },
          headers: { 'X-ApiKey': this.apiKey },
          timeout: 15_000,
        },
      )

      const rawNodes = (data.nodes ?? data.holders) as
        | {
            address?: string
            holder_address?: string
            pct?: number
            percentage?: number
            balance?: number
            links?: string[]
            related?: string[]
          }[]
        | undefined
      const rawClusters = data.clusters as
        | {
            wallets?: string[]
            addresses?: string[]
            size?: number
            pct?: number
            percentage?: number
            label?: string
          }[]
        | undefined

      if (!rawNodes?.length) return null

      const nodes: BubbleMapNode[] = []
      for (const n of rawNodes) {
        const wallet = String(n.address ?? n.holder_address ?? '').trim()
        if (wallet.length < 32) continue
        const sharePct = Number(n.percentage ?? n.pct ?? n.balance ?? 0)
        nodes.push({
          wallet,
          sharePct: sharePct > 1 ? sharePct : sharePct * 100,
          related: [...(n.links ?? []), ...(n.related ?? [])].filter(
            (w) => typeof w === 'string' && w.length > 30,
          ) as string[],
        })
      }

      const clusters: BubbleMapCluster[] = (rawClusters ?? []).map((c) => {
        const wallets = (c.wallets ?? c.addresses ?? []).filter((w) => w.length > 30)
        const pct = Number(c.pct ?? c.percentage ?? 0)
        return {
          wallets,
          density: clamp01(pct / 100 || (c.size ?? wallets.length) / 20),
          probability: clamp01(pct / 100 + 0.15),
          label: c.label,
        }
      })

      const amounts = nodes.map((n) => n.sharePct).filter((a) => a > 0)
      const dist = distributionFromAmounts(amounts.length ? amounts : nodes.map(() => 1))

      let suspiciousClusterPct = 0
      if (clusters.length) {
        suspiciousClusterPct = Math.min(
          1,
          clusters.reduce((a, c) => a + c.probability, 0) / clusters.length,
        )
      }

      const snapshot: OnChainHolderSnapshot = {
        holders: nodes.length,
        top1Pct: dist.top1Pct,
        top5Pct: dist.top5Pct,
        entropy: dist.entropy,
        suspiciousClusterPct,
        source: 'bubblemaps',
        verified: true,
        updatedAt: Date.now(),
      }

      const result: BubbleMapData = { snapshot, nodes, clusters }
      this.cache.set(mint, { data: result, at: Date.now() })
      return result
    } catch (err) {
      this.logger.debug(`Bubblemaps ${mint.slice(0, 8)}…: ${(err as Error).message}`)
      return null
    }
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}
