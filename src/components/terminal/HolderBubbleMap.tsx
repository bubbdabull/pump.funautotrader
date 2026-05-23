import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { WalletRelationshipGraph } from '@/lib/terminalTypes'
import type { PumpToken } from '@/types'
import { DistributionRings } from '@/components/terminal/DistributionRings'

const W = 340
const H = 240
const CX = W / 2
const CY = H / 2

type WalletKind = 'whale' | 'sniper' | 'retail' | 'cluster'

function classifyWallet(flags: string[], sharePct: number): WalletKind {
  if (flags.includes('dev') || flags.includes('cluster') || sharePct > 12) return 'cluster'
  if (flags.includes('sniper') || flags.includes('early')) return 'sniper'
  if (sharePct >= 5) return 'whale'
  return 'retail'
}

const KIND_COLORS: Record<WalletKind, { fill: string; stroke: string }> = {
  whale: { fill: 'rgba(249,115,22,0.55)', stroke: '#fb923c' },
  sniper: { fill: 'rgba(168,85,247,0.5)', stroke: '#c084fc' },
  retail: { fill: 'rgba(59,130,246,0.45)', stroke: '#60a5fa' },
  cluster: { fill: 'rgba(248,113,113,0.55)', stroke: '#f87171' },
}

interface HolderBubbleMapProps {
  graph?: WalletRelationshipGraph
  token?: PumpToken
}

export function HolderBubbleMap({ graph, token }: HolderBubbleMapProps) {
  const [hover, setHover] = useState<string | null>(null)

  const layout = useMemo(() => {
    if (!graph?.nodes.length) return []
    const maxShare = Math.max(...graph.nodes.map((n) => n.sharePct), 1)
    const nodes = graph.nodes.slice(0, 28)
    const small = nodes.filter((n) => n.sharePct < 1.2)
    const large = nodes.filter((n) => n.sharePct >= 1.2)

    const placed = large.map((node, i) => {
      const angle = (i / Math.max(large.length, 1)) * Math.PI * 2 - Math.PI / 2
      const r = 35 + (i % 5) * 16
      const kind = classifyWallet(node.flags, node.sharePct)
      const size = 10 + (node.sharePct / maxShare) * 32
      return {
        ...node,
        kind,
        x: CX + Math.cos(angle) * r,
        y: CY + Math.sin(angle) * r,
        size,
      }
    })

    if (small.length >= 3) {
      const clusterShare = small.reduce((a, n) => a + n.sharePct, 0)
      placed.push({
        ...small[0],
        wallet: 'cluster-retail',
        sharePct: clusterShare,
        tokenBalance: small.reduce((a, n) => a + n.tokenBalance, 0),
        relatedWallets: small.map((n) => n.wallet).slice(0, 12),
        flags: ['cluster'],
        kind: 'retail' as WalletKind,
        x: CX + 70,
        y: CY + 50,
        size: 18 + Math.min(24, small.length * 2),
      })
    }

    return placed
  }, [graph])

  const hovered = layout.find((n) => n.wallet === hover)

  if (!graph?.nodes.length) {
    if (token && (token.top1Pct != null || token.holders > 0)) {
      return (
        <div className="space-y-2">
          <p className="text-center text-[10px] uppercase tracking-wider text-zinc-500">
            Holder distribution (estimated)
          </p>
          <DistributionRings token={token} />
        </div>
      )
    }
    return (
      <div className="terminal-warmup flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="h-24 w-24 animate-pulse rounded-full border border-dashed border-violet-500/30" />
        <p className="text-xs text-zinc-500">Warming up holder intelligence…</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/40">
        {graph.clusters.map((c, i) => (
          <motion.circle
            key={`cl-${i}`}
            cx={CX}
            cy={CY}
            r={45 + c.density * 50}
            fill="rgba(168,85,247,0.05)"
            stroke="rgba(168,85,247,0.15)"
            strokeWidth={1}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
        <AnimatePresence>
          {layout.map((n) => {
            const colors = KIND_COLORS[n.kind]
            return (
              <motion.g
                key={n.wallet}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onMouseEnter={() => setHover(n.wallet)}
                onMouseLeave={() => setHover(null)}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.size}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={hover === n.wallet ? 2 : 1}
                  className="cursor-pointer transition-all"
                />
              </motion.g>
            )
          })}
        </AnimatePresence>
      </svg>

      {hovered && (
        <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-[11px]">
          <p className="font-mono text-zinc-300">{hovered.wallet.slice(0, 8)}…</p>
          <p className="text-zinc-500">
            {hovered.sharePct.toFixed(2)}% · {hovered.kind}
            {hovered.flags.length ? ` · ${hovered.flags.join(', ')}` : ''}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[10px] text-zinc-500">
        {(['whale', 'retail', 'sniper', 'cluster'] as WalletKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: KIND_COLORS[k].stroke }}
            />
            {k}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
        <span>Top1: {(graph.top1Pct * 100).toFixed(1)}%</span>
        <span>Top5: {(graph.top5Pct * 100).toFixed(1)}%</span>
        <span>Organic: {(graph.organicDistributionScore * 100).toFixed(0)}</span>
        <span>Bundle: {(graph.bundleProbability * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}
