import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { distributionFromAmounts, type OnChainHolderSnapshot } from '@phronis/trading'

const BUBBLEMAPS_BASE = 'https://api.bubblemaps.io'

@Injectable()
export class BubblemapsService {
  private readonly logger = new Logger(BubblemapsService.name)
  private readonly apiKey: string

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('BUBBLEMAPS_API_KEY')?.trim() || ''
  }

  get enabled(): boolean {
    return Boolean(this.apiKey)
  }

  async fetchHolderSnapshot(mint: string): Promise<OnChainHolderSnapshot | null> {
    if (!this.apiKey) return null
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

      const nodes = (data.nodes ?? data.holders) as
        | { address?: string; holder_address?: string; pct?: number; percentage?: number; balance?: number }[]
        | undefined
      const clusters = data.clusters as { size?: number; pct?: number; percentage?: number }[] | undefined

      if (!nodes?.length) return null

      const amounts = nodes
        .map((n) => Number(n.balance ?? n.pct ?? n.percentage ?? 0))
        .filter((a) => a > 0)
      const dist = distributionFromAmounts(amounts.length ? amounts : nodes.map(() => 1))

      let suspiciousClusterPct = 0
      if (clusters?.length) {
        const clusterSupply = clusters.reduce(
          (a, c) => a + Number(c.pct ?? c.percentage ?? 0),
          0,
        )
        suspiciousClusterPct = Math.min(1, clusterSupply / 100)
      }

      return {
        holders: nodes.length,
        top1Pct: dist.top1Pct,
        top5Pct: dist.top5Pct,
        entropy: dist.entropy,
        suspiciousClusterPct,
        source: 'bubblemaps',
        updatedAt: Date.now(),
      }
    } catch (err) {
      this.logger.debug(`Bubblemaps ${mint.slice(0, 8)}…: ${(err as Error).message}`)
      return null
    }
  }
}
