import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PumpToken } from '@/types'
import { tokenVolumeSol, formatUsd } from '@/lib/utils'

interface MarketOverviewChartProps {
  tokens: PumpToken[]
}

export function MarketOverviewChart({ tokens }: MarketOverviewChartProps) {
  const data = useMemo(() => {
    return [...tokens]
      .sort((a, b) => tokenVolumeSol(b) - tokenVolumeSol(a))
      .slice(0, 12)
      .map((t) => ({
        symbol: t.symbol,
        volume: tokenVolumeSol(t),
        mcap: t.marketCap,
      }))
  }, [tokens])

  if (!data.length) {
    return (
      <div className="panel flex h-48 items-center justify-center text-xs text-zinc-500">
        Waiting for alpha feed…
      </div>
    )
  }

  return (
    <div className="panel p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Volume leaders (alpha)
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="symbol" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            contentStyle={{ background: '#0a0b0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
            formatter={(value, name) => {
              const v = Number(value ?? 0)
              return name === 'volume' ? [`${v.toFixed(2)} SOL`, 'Vol'] : [formatUsd(v), 'MCap']
            }}
          />
          <Area type="monotone" dataKey="volume" stroke="#14b8a6" fill="url(#volGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
