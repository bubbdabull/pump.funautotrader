import { useMemo } from 'react'
import type { WalletRelationshipGraph } from '@/lib/terminalTypes'

const W = 360
const H = 220
const CX = W / 2
const CY = H / 2

export function BubbleMapViz({ graph }: { graph?: WalletRelationshipGraph }) {
  const layout = useMemo(() => {
    if (!graph?.nodes.length) return []
    const maxShare = Math.max(...graph.nodes.map((n) => n.sharePct), 1)
    return graph.nodes.slice(0, 24).map((node, i) => {
      const angle = (i / Math.min(graph.nodes.length, 24)) * Math.PI * 2
      const r = 40 + (i % 4) * 18
      const size = 8 + (node.sharePct / maxShare) * 28
      const danger =
        node.flags.includes('dev') ||
        node.flags.includes('cluster') ||
        node.sharePct > 12
      return {
        ...node,
        x: CX + Math.cos(angle) * r,
        y: CY + Math.sin(angle) * r,
        size,
        danger,
      }
    })
  }, [graph])

  if (!graph) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        Wallet graph loading… (requires holder enrichment)
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/30">
        {graph.clusters.map((c, i) => (
          <circle
            key={`c-${i}`}
            cx={CX}
            cy={CY}
            r={50 + c.density * 40}
            fill="rgba(168,85,247,0.06)"
            stroke="rgba(168,85,247,0.2)"
            strokeWidth={1}
          />
        ))}
        {layout.map((n) => (
          <g key={n.wallet}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.size}
              fill={n.danger ? 'rgba(248,113,113,0.55)' : 'rgba(45,212,191,0.45)'}
              stroke={n.danger ? '#f87171' : '#2dd4bf'}
              strokeWidth={1}
            />
            {n.sharePct >= 6 && (
              <text
                x={n.x}
                y={n.y + 3}
                textAnchor="middle"
                className="fill-[8px] font-mono fill-white/80"
                fontSize={8}
              >
                {n.sharePct.toFixed(0)}%
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-4">
        <span>Top1: {(graph.top1Pct * 100).toFixed(1)}%</span>
        <span>Top5: {(graph.top5Pct * 100).toFixed(1)}%</span>
        <span>Organic: {(graph.organicDistributionScore * 100).toFixed(0)}</span>
        <span>Bundle: {(graph.bundleProbability * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}
