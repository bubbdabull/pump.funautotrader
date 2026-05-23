import { clamp01 } from '../utils/math'
import type { WalletCluster, WalletNode, WalletRelationshipGraph } from './types'

export function buildWalletGraph(params: {
  mint: string
  balances: Map<string, number>
  deployerWallet?: string
  coordinationPenalty?: number
  coordinationFlags?: string[]
  top1Pct?: number
  top5Pct?: number
  suspiciousClusterPct?: number
  bubbleNodes?: Array<{ wallet: string; sharePct: number; related?: string[] }>
  bubbleClusters?: Array<{ wallets: string[]; density: number; probability: number; label?: string }>
  firstSeenByWallet?: Map<string, number>
}): WalletRelationshipGraph {
  const {
    mint,
    balances,
    deployerWallet,
    coordinationPenalty = 0,
    coordinationFlags = [],
    top1Pct: extTop1,
    top5Pct: extTop5,
    suspiciousClusterPct = 0,
    bubbleNodes = [],
    bubbleClusters = [],
    firstSeenByWallet,
  } = params

  const entries = [...balances.entries()]
    .filter(([, b]) => b > 0)
    .sort((a, b) => b[1] - a[1])
  const total = entries.reduce((a, [, b]) => a + b, 0) || 1

  const nodeMap = new Map<string, WalletNode>()

  for (const [wallet, bal] of entries.slice(0, 40)) {
    const sharePct = (bal / total) * 100
    const flags: string[] = []
    if (deployerWallet && wallet === deployerWallet) flags.push('dev')
    if (sharePct >= 8) flags.push('whale')
    nodeMap.set(wallet, {
      wallet,
      tokenBalance: bal,
      sharePct,
      firstSeen: firstSeenByWallet?.get(wallet) ?? Date.now(),
      relatedWallets: [],
      flags,
    })
  }

  for (const bn of bubbleNodes) {
    const prev = nodeMap.get(bn.wallet)
    const flags = [...(prev?.flags ?? [])]
    if (bn.sharePct >= 5 && !flags.includes('whale')) flags.push('whale')
    nodeMap.set(bn.wallet, {
      wallet: bn.wallet,
      tokenBalance: prev?.tokenBalance ?? bn.sharePct,
      sharePct: Math.max(prev?.sharePct ?? 0, bn.sharePct),
      firstSeen: prev?.firstSeen ?? firstSeenByWallet?.get(bn.wallet) ?? Date.now(),
      relatedWallets: [...new Set([...(prev?.relatedWallets ?? []), ...(bn.related ?? [])])],
      flags,
    })
  }

  const sorted = [...nodeMap.values()].sort((a, b) => b.sharePct - a.sharePct)
  const top1 = extTop1 ?? (sorted[0]?.sharePct ?? 0) / 100
  const top5 =
    extTop5 ??
    sorted.slice(0, 5).reduce((a, n) => a + n.sharePct, 0) / 100
  const top10 = sorted.slice(0, 10).reduce((a, n) => a + n.sharePct, 0) / 100

  const clusters: WalletCluster[] = bubbleClusters.length
    ? bubbleClusters
    : coordinationFlags.includes('coordinated_buys')
      ? [
          {
            wallets: sorted.slice(0, 6).map((n) => n.wallet),
            density: coordinationPenalty,
            probability: coordinationPenalty,
            label: 'coordination',
          },
        ]
      : []

  for (const c of clusters) {
    for (const w of c.wallets) {
      const n = nodeMap.get(w)
      if (!n) continue
      n.relatedWallets = [...new Set([...n.relatedWallets, ...c.wallets.filter((x) => x !== w)])]
      if (c.probability > 0.4) n.flags = [...new Set([...n.flags, 'cluster'])]
    }
  }

  const walletDiversityScore = clamp01(sorted.length / 25 + (1 - top5) * 0.5)
  const centralizationScore = clamp01(top1 * 1.2 + top5 * 0.4)
  const clusterDensity = clamp01(
    suspiciousClusterPct + clusters.reduce((a, c) => a + c.density, 0) / Math.max(1, clusters.length),
  )
  const organicDistributionScore = clamp01(
    walletDiversityScore * 0.5 + (1 - centralizationScore) * 0.35 + (1 - clusterDensity) * 0.15,
  )
  const bundleProbability = clamp01(
    coordinationPenalty * 0.6 +
      (coordinationFlags.includes('sniper_bundle') ? 0.35 : 0) +
      suspiciousClusterPct * 0.25,
  )
  const devControlProbability = clamp01(
    (deployerWallet && sorted.some((n) => n.flags.includes('dev')) ? top1 + top5 * 0.5 : 0) +
      (coordinationFlags.includes('dev_linked') ? 0.25 : 0),
  )
  const sniperProbability = clamp01(
    coordinationFlags.includes('sniper_bundle') ? 0.7 + coordinationPenalty * 0.2 : coordinationPenalty * 0.4,
  )

  return {
    mint,
    updatedAt: Date.now(),
    nodes: sorted.slice(0, 32),
    clusters: clusters.slice(0, 8),
    top1Pct: top1,
    top5Pct: top5,
    top10Pct: top10 / 100,
    walletDiversityScore,
    centralizationScore,
    clusterDensity,
    organicDistributionScore,
    bundleProbability,
    devControlProbability,
    sniperProbability,
    coordinationPenalty,
  }
}
