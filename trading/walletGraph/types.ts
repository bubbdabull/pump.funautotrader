export interface WalletNode {
  wallet: string
  tokenBalance: number
  sharePct: number
  fundedBy?: string
  firstSeen: number
  relatedWallets: string[]
  flags: string[]
}

export interface WalletCluster {
  wallets: string[]
  density: number
  probability: number
  label?: string
}

export interface WalletRelationshipGraph {
  mint: string
  updatedAt: number
  nodes: WalletNode[]
  clusters: WalletCluster[]
  top1Pct: number
  top5Pct: number
  top10Pct: number
  walletDiversityScore: number
  centralizationScore: number
  clusterDensity: number
  organicDistributionScore: number
  bundleProbability: number
  devControlProbability: number
  sniperProbability: number
  coordinationPenalty: number
}
