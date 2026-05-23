import { useMemo } from 'react'
import type { PumpToken } from '@/types'

interface DistributionRingsProps {
  token: PumpToken
  size?: number
}

/** Fallback holder view when bubble graph is not yet enriched. */
export function DistributionRings({ token, size = 200 }: DistributionRingsProps) {
  const rings = useMemo(() => {
    const raw1 = token.top1Pct ?? 0
    const raw5 = token.top5Pct ?? raw1
    const top1 = raw1 > 1 ? raw1 : raw1 * 100
    const top5 = raw5 > 1 ? raw5 : raw5 * 100
    const retail = Math.max(0, 100 - top5)
    return [
      { label: 'Top 1', pct: top1, color: '#f97316', r: size * 0.38 },
      { label: 'Top 5', pct: Math.max(0, top5 - top1), color: '#a855f7', r: size * 0.32 },
      { label: 'Retail', pct: retail, color: '#3b82f6', r: size * 0.26 },
    ]
  }, [token.top1Pct, token.top5Pct, size])

  const cx = size / 2
  const cy = size / 2

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} className="drop-shadow-lg">
        {rings.map((ring, i) => {
          const stroke = 10 + i * 4
          const circumference = 2 * Math.PI * ring.r
          const dash = (ring.pct / 100) * circumference
          return (
            <circle
              key={ring.label}
              cx={cx}
              cy={cy}
              r={ring.r}
              fill="none"
              stroke={ring.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              opacity={0.85 - i * 0.12}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="transition-all duration-500"
            />
          )
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-[10px] font-mono fill-white/90" fontSize={11}>
          {token.holders}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-[9px] fill-zinc-500" fontSize={9}>
          holders
        </text>
      </svg>
      <div className="grid w-full grid-cols-3 gap-2 text-center text-[10px]">
        {rings.map((r) => (
          <div key={r.label}>
            <span className="block font-medium" style={{ color: r.color }}>
              {r.label}
            </span>
            <span className="font-mono text-zinc-400">{r.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
